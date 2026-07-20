import type { ScoringProfile } from './types.js';
import { HOUSE_RULES_V1 } from './ruleSets.js';

export const houseRulesV1ScoringProfile = {
  id: 'house-rules-v1',
  name: 'House Rules V1',
  type: 'standard',
  ruleSet: HOUSE_RULES_V1,
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  underDashSuccessBonus: 10,
  underDashFailurePenalty: 10,
  highContractThreshold: 8,
  highContractSuccessFormula: 'square',
  highContractFailurePenaltyBase: 30,
  highContractFailurePenaltyStep: 10,
  dashSuccessScore: 10,
  dashCallSuccessScore: 35,
} satisfies ScoringProfile;
