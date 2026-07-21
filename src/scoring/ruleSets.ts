export const HOUSE_RULES_V1 = 'HOUSE_RULES_V1' as const;
export const FEDERATION_2026 = 'FEDERATION_2026' as const;

export type ScoringRuleSetId = typeof HOUSE_RULES_V1 | typeof FEDERATION_2026;

export interface GameRuleConfiguration {
  readonly ruleSet: ScoringRuleSetId;
}

export interface FederationScoringTable {
  readonly normalSuccessBase: number;
  readonly ownerSuccessBase: number;
  readonly ownerFailureBasePenalty: number;
  readonly dashUnderSuccess: number;
  readonly dashOverSuccess: number;
  readonly dashUnderFailureBasePenalty: number;
  readonly dashOverFailureBasePenalty: number;
  readonly superBidSuccess: Readonly<Record<8 | 9 | 10, number>>;
  readonly superBidFailureBasePenalty: number;
  readonly onlyWinnerBonus: number;
  readonly onlyLoserPenalty: number;
  readonly riskBonus: number;
  readonly doubleRiskBonus: number;
}

export const federation2026ScoringTable: FederationScoringTable = {
  normalSuccessBase: 13,
  ownerSuccessBase: 23,
  ownerFailureBasePenalty: 10,
  dashUnderSuccess: 23,
  dashOverSuccess: 13,
  dashUnderFailureBasePenalty: 10,
  dashOverFailureBasePenalty: 0,
  superBidSuccess: {
    8: 41,
    9: 42,
    10: 43,
  },
  superBidFailureBasePenalty: 20,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  riskBonus: 10,
  doubleRiskBonus: 20,
};

export function isScoringRuleSetId(value: unknown): value is ScoringRuleSetId {
  return value === HOUSE_RULES_V1 || value === FEDERATION_2026;
}

export function resolveScoringRuleSetId(value: unknown): ScoringRuleSetId {
  return isScoringRuleSetId(value) ? value : HOUSE_RULES_V1;
}
