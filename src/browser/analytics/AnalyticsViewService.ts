import type { MvpGameResult } from '../../services/EstimationMvpService.js';
import { PlayerAnalyticsService } from '../../statistics/PlayerAnalyticsService.js';
import type { PlayerAnalyticsEntry, PlayerAnalyticsSummary } from '../../statistics/playerAnalyticsTypes.js';
import type { AnalyticsScreenMetric, AnalyticsScreenModel, PlayerAnalyticsScreenRow } from './AnalyticsScreenModel.js';

export interface AnalyticsViewOptions {
  readonly title?: string;
  readonly generatedAt?: Date | string;
  readonly playerOrder?: readonly string[];
}

export class AnalyticsViewService {
  constructor(private readonly analyticsService = new PlayerAnalyticsService()) {}

  buildModel(gameResult: MvpGameResult, options: AnalyticsViewOptions = {}): AnalyticsScreenModel {
    const summary = this.analyticsService.summarizeGame(gameResult, { playerOrder: options.playerOrder });

    return {
      title: options.title ?? 'Player Analytics',
      empty: summary.players.length === 0,
      generatedAtIso: this.formatGeneratedAt(options.generatedAt),
      summaryMetrics: this.buildSummaryMetrics(summary),
      rows: summary.players.map((player) => this.formatPlayerRow(player)),
    };
  }

  private buildSummaryMetrics(summary: PlayerAnalyticsSummary): readonly AnalyticsScreenMetric[] {
    return [
      { label: 'Total rounds', value: summary.totalRounds.toString() },
      { label: 'Valid rounds', value: summary.validRounds.toString() },
      { label: 'Invalid rounds', value: summary.invalidRounds.toString() },
      { label: 'Leader', value: summary.leaderPlayerId ?? '—' },
      { label: 'Most consistent', value: summary.mostConsistentPlayerId ?? '—' },
    ];
  }

  private formatPlayerRow(player: PlayerAnalyticsEntry): PlayerAnalyticsScreenRow {
    return {
      rank: player.rank,
      playerId: player.playerId,
      totalScore: player.totalScore.toString(),
      averageScore: this.formatNumber(player.averageScore),
      exactBidRate: this.formatRate(player.exactBidRate, player.roundsPlayed),
      failureRate: this.formatRate(player.failureRate, player.roundsPlayed),
      dashSuccessRate: this.formatRate(player.dashSuccessRate, player.dashAttempts),
      dashAttempts: player.dashAttempts.toString(),
      dashCallSuccessRate: this.formatRate(player.dashCallSuccessRate, player.dashCallAttempts),
      dashCallAttempts: player.dashCallAttempts.toString(),
      riskSuccessRate: this.formatRate(player.riskSuccessRate, player.riskAttempts),
      riskAttempts: player.riskAttempts.toString(),
      doubleRiskSuccessRate: this.formatRate(player.doubleRiskSuccessRate, player.doubleRiskAttempts),
      doubleRiskAttempts: player.doubleRiskAttempts.toString(),
      withRounds: player.withRounds.toString(),
      highContractRounds: player.highContractRounds.toString(),
      allLoserRounds: player.allLoserRounds.toString(),
    };
  }

  private formatRate(rate: number, attempts: number): string {
    if (attempts === 0) {
      return '—';
    }

    return `${Math.round(rate * 100)}%`;
  }

  private formatNumber(value: number): string {
    if (Number.isInteger(value)) {
      return value.toString();
    }

    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  private formatGeneratedAt(generatedAt: Date | string | undefined): string | undefined {
    if (generatedAt instanceof Date) {
      return generatedAt.toISOString();
    }

    return generatedAt;
  }
}
