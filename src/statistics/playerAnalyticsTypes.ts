export interface PlayerAnalyticsEntry {
  readonly rank: number;
  readonly playerId: string;
  readonly totalScore: number;
  readonly roundsPlayed: number;
  readonly averageScore: number;
  readonly bestRoundScore: number;
  readonly worstRoundScore: number;
  readonly exactBidRate: number;
  readonly failureRate: number;
  readonly dashAttempts: number;
  readonly dashSuccessRate: number;
  readonly dashCallAttempts: number;
  readonly dashCallSuccessRate: number;
  readonly riskAttempts: number;
  readonly riskSuccessRate: number;
  readonly doubleRiskAttempts: number;
  readonly doubleRiskSuccessRate: number;
  readonly withRounds: number;
  readonly highContractRounds: number;
  readonly allLoserRounds: number;
}

export interface PlayerAnalyticsSummary {
  readonly players: readonly PlayerAnalyticsEntry[];
  readonly totalRounds: number;
  readonly validRounds: number;
  readonly invalidRounds: number;
  readonly leaderPlayerId?: string;
  readonly mostConsistentPlayerId?: string;
}
