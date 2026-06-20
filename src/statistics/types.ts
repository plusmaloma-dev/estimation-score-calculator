export interface PlayerStatistics {
  readonly playerId: string;
  readonly totalScore: number;
  readonly roundsPlayed: number;
  readonly successfulRounds: number;
  readonly failedRounds: number;
  readonly pendingRuleRounds: number;
  readonly exactBidRate: number;
  readonly averageScore: number;
  readonly bestRoundScore: number;
  readonly worstRoundScore: number;
  readonly dashSuccesses: number;
  readonly dashFailures: number;
  readonly dashCallSuccesses: number;
  readonly dashCallFailures: number;
  readonly riskSuccesses: number;
  readonly riskFailures: number;
  readonly withRounds: number;
  readonly highContractRounds: number;
}

export interface GameStatisticsSummary {
  readonly playerStatistics: readonly PlayerStatistics[];
  readonly totalRounds: number;
  readonly validRounds: number;
  readonly invalidRounds: number;
  readonly highestScorePlayerId?: string;
  readonly lowestScorePlayerId?: string;
}
