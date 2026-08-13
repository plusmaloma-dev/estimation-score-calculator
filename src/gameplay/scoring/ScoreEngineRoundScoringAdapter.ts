import type {
  BidValidationMode,
  EstimationBid,
  RoundBidValidationResult,
} from '../../domain/bid.js';
import { houseRulesV1ScoringProfile } from '../../scoring/houseRulesV1Profile.js';
import { HOUSE_RULES_V1 } from '../../scoring/ruleSets.js';
import { EstimationMvpService } from '../../services/EstimationMvpService.js';
import type {
  GameplayRoundScoringInput,
  GameplayRoundScoringResult,
  RoundScoringPort,
} from './RoundScoringPort.js';

export class ScoreEngineRoundScoringAdapter implements RoundScoringPort {
  constructor(private readonly scoreEngine = new EstimationMvpService()) {}

  validateBids(
    bids: readonly EstimationBid[],
    options: {
      readonly mode: BidValidationMode;
      readonly bidOwnerPlayerId: string;
    },
  ): RoundBidValidationResult {
    return this.scoreEngine.validateBids(bids, options);
  }

  scoreRound(input: GameplayRoundScoringInput): GameplayRoundScoringResult {
    return this.scoreEngine.calculateRound({
      ...input,
      profile: houseRulesV1ScoringProfile,
      ruleSet: HOUSE_RULES_V1,
      bidValidationMode: input.bidValidationMode ?? 'round-estimates',
    });
  }
}
