import { AnalyticsViewService } from '../analytics/AnalyticsViewService.js';
import type { PersistedScoreSheet } from '../../persistence/types.js';
import { EstimationMvpService, type MvpGameResult, type MvpRoundResult } from '../../services/EstimationMvpService.js';
import type { GameSummaryAction, GameSummaryLeaderboardRow, GameSummaryModel, GameSummaryRecentRoundRow } from './GameSummaryModel.js';

export type { GameSummaryModel } from './GameSummaryModel.js';

export interface GameSummaryViewOptions {
  readonly generatedAt?: Date | string;
  readonly recentRoundLimit?: number;
}

export class GameSummaryViewService {
  constructor(
    private readonly mvpService = new EstimationMvpService(),
    private readonly analyticsViewService = new AnalyticsViewService(),
  ) {}

  buildModel(scoreSheet: PersistedScoreSheet, options: GameSummaryViewOptions = {}): GameSummaryModel {
    const gameResult = scoreSheet.gameResult ?? this.mvpService.calculateGame(scoreSheet.gameInput);
    const analytics = this.analyticsViewService.buildModel(gameResult, {
      title: `${scoreSheet.name} Analytics`,
      generatedAt: options.generatedAt,
      playerOrder: scoreSheet.playerOrder,
    });

    return {
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: scoreSheet.status,
      ruleSet: gameResult.ruleSet,
      players: scoreSheet.playerOrder,
      roundCount: scoreSheet.roundCount,
      createdAtIso: scoreSheet.createdAtIso,
      updatedAtIso: scoreSheet.updatedAtIso,
      leaderboard: this.buildLeaderboard(gameResult),
      statistics: analytics.summaryMetrics,
      recentRounds: this.buildRecentRounds(gameResult, options.recentRoundLimit ?? 5),
      actions: this.buildActions(scoreSheet.roundCount),
      analytics,
    };
  }

  private buildLeaderboard(gameResult: MvpGameResult): readonly GameSummaryLeaderboardRow[] {
    return gameResult.leaderboard.map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      totalScore: entry.totalScore.toString(),
    }));
  }

  private buildRecentRounds(gameResult: MvpGameResult, recentRoundLimit: number): readonly GameSummaryRecentRoundRow[] {
    return gameResult.rounds
      .slice(-Math.max(0, recentRoundLimit))
      .map((round) => this.toRecentRoundRow(round));
  }

  private toRecentRoundRow(round: MvpRoundResult): GameSummaryRecentRoundRow {
    const playerScores = round.scoreResult?.playerScores ?? [];
    const highestScore = playerScores.length === 0 ? undefined : Math.max(...playerScores.map((score) => score.score));
    const winnerPlayerIds = highestScore === undefined ? [] : playerScores
      .filter((score) => score.score === highestScore)
      .map((score) => score.playerId);
    const riskTypes = [...new Set(playerScores
      .map((score) => score.riskType)
      .filter((riskType) => riskType !== 'none'))];

    return {
      roundNumber: round.roundNumber,
      roundType: round.bidValidation.roundType ?? 'invalid',
      valid: round.valid,
      winnerPlayerIds,
      riskTypes,
      nextRoundMultiplier: round.scoreResult?.nextRoundMultiplier?.toString() ?? '—',
    };
  }

  private buildActions(roundCount: number): readonly GameSummaryAction[] {
    const hasRounds = roundCount > 0;

    return [
      { id: 'resume', label: 'Resume game', enabled: true },
      { id: 'analytics', label: 'View analytics', enabled: hasRounds },
      { id: 'round-history', label: 'View round history', enabled: hasRounds },
      { id: 'export-backup', label: 'Export backup', enabled: true },
      { id: 'export-markdown', label: 'Export markdown', enabled: hasRounds },
      { id: 'export-csv', label: 'Export CSV', enabled: hasRounds },
    ];
  }
}
