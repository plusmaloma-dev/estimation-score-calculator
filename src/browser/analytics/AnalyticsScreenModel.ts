export interface AnalyticsScreenMetric {
  readonly label: string;
  readonly value: string;
}

export interface PlayerAnalyticsScreenRow {
  readonly rank: number;
  readonly playerId: string;
  readonly totalScore: string;
  readonly averageScore: string;
  readonly exactBidRate: string;
  readonly failureRate: string;
  readonly dashSuccessRate: string;
  readonly dashAttempts: string;
  readonly dashCallSuccessRate: string;
  readonly dashCallAttempts: string;
  readonly riskSuccessRate: string;
  readonly riskAttempts: string;
  readonly doubleRiskSuccessRate: string;
  readonly doubleRiskAttempts: string;
  readonly withRounds: string;
  readonly highContractRounds: string;
  readonly allLoserRounds: string;
}

export interface AnalyticsScreenModel {
  readonly title: string;
  readonly empty: boolean;
  readonly generatedAtIso?: string;
  readonly summaryMetrics: readonly AnalyticsScreenMetric[];
  readonly rows: readonly PlayerAnalyticsScreenRow[];
}
