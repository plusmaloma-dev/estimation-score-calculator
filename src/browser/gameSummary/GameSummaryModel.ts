import type { AnalyticsScreenMetric, AnalyticsScreenModel } from '../analytics/AnalyticsScreenModel.js';
import type { PersistedScoreSheetStatus } from '../../persistence/types.js';
import type { ScoringRuleSetId } from '../../scoring/ruleSets.js';

export interface GameSummaryLeaderboardRow {
  readonly rank: number;
  readonly playerId: string;
  readonly totalScore: string;
}

export interface GameSummaryRecentRoundRow {
  readonly roundNumber: number;
  readonly roundType: 'over' | 'under' | 'invalid';
  readonly valid: boolean;
  readonly winnerPlayerIds: readonly string[];
  readonly riskTypes: readonly string[];
  readonly nextRoundMultiplier: string;
}

export interface GameSummaryAction {
  readonly id: 'resume' | 'analytics' | 'round-history' | 'export-backup' | 'export-markdown' | 'export-csv';
  readonly label: string;
  readonly enabled: boolean;
}

export interface GameSummaryModel {
  readonly id: string;
  readonly name: string;
  readonly status: PersistedScoreSheetStatus;
  readonly ruleSet: ScoringRuleSetId;
  readonly players: readonly string[];
  readonly roundCount: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly leaderboard: readonly GameSummaryLeaderboardRow[];
  readonly statistics: readonly AnalyticsScreenMetric[];
  readonly recentRounds: readonly GameSummaryRecentRoundRow[];
  readonly actions: readonly GameSummaryAction[];
  readonly analytics: AnalyticsScreenModel;
}
