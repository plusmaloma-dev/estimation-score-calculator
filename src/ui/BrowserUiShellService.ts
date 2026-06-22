import type { EstimationBid } from '../domain/bid.js';
import type { AnalyticsScreenModel } from '../browser/analytics/AnalyticsScreenModel.js';
import { AnalyticsViewService } from '../browser/analytics/AnalyticsViewService.js';
import type { GameSummaryModel } from '../browser/gameSummary/GameSummaryModel.js';
import { GameSummaryViewService } from '../browser/gameSummary/GameSummaryViewService.js';
import type { PlayerRoundActualResult, RiskType, ScoringProfile } from '../scoring/types.js';
import { ScoreSheetBackupService } from '../importExport/ScoreSheetBackupService.js';
import type { ScoreSheetBackupDocument } from '../importExport/types.js';
import type { PersistedScoreSheet, PersistedScoreSheetMetadata, ScoreSheetRepository } from '../persistence/types.js';
import { EstimationMvpService, type MvpGameResult, type MvpRoundInput, type MvpRoundResult } from '../services/EstimationMvpService.js';
import type { LeaderboardEntry } from '../services/LeaderboardService.js';

export interface UiPlayerSetupInput {
  readonly id: string;
  readonly name: string;
}

export interface UiCreateScoreSheetInput {
  readonly name: string;
  readonly players: readonly UiPlayerSetupInput[];
  readonly nowIso?: string;
}

export interface UiRoundEntryInput {
  readonly roundNumber: number;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly profile: ScoringProfile;
  readonly roundMultiplier?: number;
  readonly riskPlayerId?: string;
  readonly bidOwnerPlayerId?: string;
}

export interface UiValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface UiCreateScoreSheetResult extends UiValidationResult {
  readonly scoreSheet?: PersistedScoreSheet;
}

export interface UiRoundPreviewResult extends UiValidationResult {
  readonly round?: MvpRoundResult;
}

export interface UiSaveRoundResult extends UiValidationResult {
  readonly scoreSheet?: PersistedScoreSheet;
  readonly gameResult?: MvpGameResult;
}

export interface UiExportBackupResult extends UiValidationResult {
  readonly document?: ScoreSheetBackupDocument;
}

export interface UiAnalyticsDashboardResult extends UiValidationResult {
  readonly analytics?: AnalyticsScreenModel;
}

export interface UiGameSummaryResult extends UiValidationResult {
  readonly summary?: GameSummaryModel;
}

export interface UiSessionHistoryItem {
  readonly id: string;
  readonly name: string;
  readonly status: PersistedScoreSheet['status'];
  readonly players: readonly string[];
  readonly roundCount: number;
  readonly updatedAtIso: string;
  readonly updatedAtLabel: string;
}

export interface UiSessionHistoryResult {
  readonly sessions: readonly UiSessionHistoryItem[];
}

export interface UiOpenSessionResult extends UiValidationResult {
  readonly scoreSheet?: PersistedScoreSheet;
  readonly leaderboard?: readonly LeaderboardEntry[];
  readonly analytics?: AnalyticsScreenModel;
  readonly roundHistory?: readonly UiRoundHistoryEntry[];
}

export interface UiScoreSheetSummary {
  readonly id: string;
  readonly name: string;
  readonly status: PersistedScoreSheet['status'];
  readonly playerOrder: readonly string[];
  readonly roundCount: number;
  readonly updatedAtIso: string;
}

export interface UiRoundHistoryEntry {
  readonly roundNumber: number;
  readonly roundType?: 'over' | 'under';
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly playerScores: NonNullable<MvpRoundResult['scoreResult']>['playerScores'];
  readonly riskTypes: readonly RiskType[];
  readonly nextRoundMultiplier?: number;
}

export class BrowserUiShellService {
  constructor(
    private readonly repository: ScoreSheetRepository,
    private readonly mvpService = new EstimationMvpService(),
    private readonly backupService = new ScoreSheetBackupService(),
    private readonly analyticsViewService = new AnalyticsViewService(),
    private readonly gameSummaryViewService = new GameSummaryViewService(),
  ) {}

  validatePlayerSetup(players: readonly UiPlayerSetupInput[]): UiValidationResult {
    const errors: string[] = [];

    if (players.length !== 4) {
      errors.push('Exactly four players are required.');
    }

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    players.forEach((player, index) => {
      const id = player.id.trim();
      const name = player.name.trim();

      if (id.length === 0) {
        errors.push(`Player ${index + 1} id is required.`);
      } else if (seenIds.has(id)) {
        errors.push(`Player id must be unique: ${id}.`);
      } else {
        seenIds.add(id);
      }

      if (name.length === 0) {
        errors.push(`Player ${index + 1} name is required.`);
      } else if (seenNames.has(name.toLocaleLowerCase())) {
        errors.push(`Player name must be unique: ${name}.`);
      } else {
        seenNames.add(name.toLocaleLowerCase());
      }
    });

    return { valid: errors.length === 0, errors };
  }

  createScoreSheet(input: UiCreateScoreSheetInput): UiCreateScoreSheetResult {
    const errors: string[] = [];
    if (input.name.trim().length === 0) {
      errors.push('Score-sheet name is required.');
    }

    const playerSetup = this.validatePlayerSetup(input.players);
    errors.push(...playerSetup.errors);

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const playerOrder = input.players.map((player) => player.id.trim());
    const gameInput = { rounds: [], playerOrder };
    const gameResult = this.mvpService.calculateGame(gameInput);
    const scoreSheet = this.repository.save({
      name: input.name,
      status: 'draft',
      gameInput,
      gameResult,
      nowIso: input.nowIso,
    });

    return { valid: true, errors: [], scoreSheet };
  }

  listScoreSheets(): readonly UiScoreSheetSummary[] {
    return this.repository.list().map((scoreSheet) => ({
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: scoreSheet.status,
      playerOrder: scoreSheet.playerOrder,
      roundCount: scoreSheet.roundCount,
      updatedAtIso: scoreSheet.updatedAtIso,
    }));
  }

  getSessionHistory(): UiSessionHistoryResult {
    const sessions = [...this.repository.list()]
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
      .map((metadata) => this.toSessionHistoryItem(metadata));

    return { sessions };
  }

  openSession(scoreSheetId: string, generatedAt?: Date | string): UiOpenSessionResult {
    const scoreSheet = this.repository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }

    const gameResult = scoreSheet.gameResult ?? this.mvpService.calculateGame(scoreSheet.gameInput);
    const analytics = this.analyticsViewService.buildModel(gameResult, {
      title: `${scoreSheet.name} Analytics`,
      generatedAt,
      playerOrder: scoreSheet.playerOrder,
    });

    return {
      valid: true,
      errors: [],
      scoreSheet,
      leaderboard: gameResult.leaderboard,
      analytics,
      roundHistory: this.buildRoundHistory(scoreSheet),
    };
  }

  getGameSummary(scoreSheetId: string, generatedAt?: Date | string): UiGameSummaryResult {
    const scoreSheet = this.repository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }

    return {
      valid: true,
      errors: [],
      summary: this.gameSummaryViewService.buildModel(scoreSheet, { generatedAt }),
    };
  }

  previewRound(input: UiRoundEntryInput): UiRoundPreviewResult {
    const roundInput = this.toMvpRoundInput(input);
    const round = this.mvpService.calculateRound(roundInput);
    return { valid: round.valid, errors: round.errors, round };
  }

  saveRound(scoreSheetId: string, input: UiRoundEntryInput, nowIso?: string): UiSaveRoundResult {
    const scoreSheet = this.repository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }

    const preview = this.previewRound(input);
    if (!preview.valid) {
      return { valid: false, errors: preview.errors };
    }

    const gameInput = {
      ...scoreSheet.gameInput,
      rounds: [...scoreSheet.gameInput.rounds, this.toMvpRoundInput(input)],
    };
    const gameResult = this.mvpService.calculateGame(gameInput);
    if (!gameResult.valid) {
      return { valid: false, errors: gameResult.errors, gameResult };
    }

    const saved = this.repository.save({
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: scoreSheet.status,
      gameInput,
      gameResult,
      nowIso,
    });

    return { valid: true, errors: [], scoreSheet: saved, gameResult };
  }

  getRoundHistory(scoreSheetId: string): readonly UiRoundHistoryEntry[] {
    const scoreSheet = this.repository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return [];
    }

    return this.buildRoundHistory(scoreSheet);
  }

  getLeaderboard(scoreSheetId: string): readonly LeaderboardEntry[] {
    return this.repository.getById(scoreSheetId)?.gameResult?.leaderboard ?? [];
  }

  getAnalyticsDashboard(scoreSheetId: string, generatedAt?: Date | string): UiAnalyticsDashboardResult {
    const scoreSheet = this.repository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }

    const gameResult = scoreSheet.gameResult ?? this.mvpService.calculateGame(scoreSheet.gameInput);
    const analytics = this.analyticsViewService.buildModel(gameResult, {
      title: `${scoreSheet.name} Analytics`,
      generatedAt,
      playerOrder: scoreSheet.playerOrder,
    });

    return { valid: true, errors: [], analytics };
  }

  exportScoreSheet(scoreSheetId: string, exportedAtIso?: string): UiExportBackupResult {
    const scoreSheet = this.repository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }

    const document = this.backupService.exportScoreSheets({
      scoreSheets: [scoreSheet],
      exportedAtIso,
      source: 'browser-ui-shell',
    });

    return { valid: true, errors: [], document };
  }

  private toSessionHistoryItem(metadata: PersistedScoreSheetMetadata): UiSessionHistoryItem {
    return {
      id: metadata.id,
      name: metadata.name,
      status: metadata.status,
      players: metadata.playerOrder,
      roundCount: metadata.roundCount,
      updatedAtIso: metadata.updatedAtIso,
      updatedAtLabel: this.formatSessionDateLabel(metadata.updatedAtIso),
    };
  }

  private formatSessionDateLabel(updatedAtIso: string): string {
    return updatedAtIso.slice(0, 16).replace('T', ' ');
  }

  private buildRoundHistory(scoreSheet: PersistedScoreSheet): readonly UiRoundHistoryEntry[] {
    return scoreSheet.gameInput.rounds.map((roundInput, index) => {
      const roundResult = scoreSheet.gameResult?.rounds[index] ?? this.mvpService.calculateRound(roundInput);
      const playerScores = roundResult.scoreResult?.playerScores ?? [];
      return {
        roundNumber: roundInput.roundNumber,
        roundType: roundResult.bidValidation.roundType,
        valid: roundResult.valid,
        errors: roundResult.errors,
        bids: roundInput.bids,
        actualResults: roundInput.actualResults,
        playerScores,
        riskTypes: this.resolveRiskTypes(playerScores),
        nextRoundMultiplier: roundResult.scoreResult?.nextRoundMultiplier,
      };
    });
  }

  private resolveRiskTypes(playerScores: NonNullable<MvpRoundResult['scoreResult']>['playerScores']): readonly RiskType[] {
    const riskTypes = new Set<RiskType>();
    for (const playerScore of playerScores) {
      if (playerScore.riskType !== 'none') {
        riskTypes.add(playerScore.riskType);
      }
    }

    return [...riskTypes];
  }

  private toMvpRoundInput(input: UiRoundEntryInput): MvpRoundInput {
    return {
      roundNumber: input.roundNumber,
      bids: input.bids,
      actualResults: input.actualResults,
      profile: input.profile,
      roundMultiplier: input.roundMultiplier,
      riskPlayerId: input.riskPlayerId,
      bidOwnerPlayerId: input.bidOwnerPlayerId,
    };
  }
}
