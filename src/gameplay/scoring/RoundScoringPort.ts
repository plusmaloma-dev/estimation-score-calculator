import type {
  BidValidationMode,
  EstimationBid,
  RoundBidValidationResult,
} from '../../domain/bid.js';
import type {
  AllLoserCarryMetadata,
  PlayerRoundActualResult,
  RoundScoreResult,
} from '../../scoring/types.js';

export interface GameplayRoundScoringInput {
  readonly roundNumber: number;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly bidOwnerPlayerId: string;
  readonly riskPlayerId: string;
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
}

export interface GameplayRoundScoringResult extends AllLoserCarryMetadata {
  readonly roundNumber: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly bidValidation: RoundBidValidationResult;
  readonly scoreResult?: RoundScoreResult;
}

export interface RoundScoringPort {
  validateBids(
    bids: readonly EstimationBid[],
    options: {
      readonly mode: BidValidationMode;
      readonly bidOwnerPlayerId: string;
    },
  ): RoundBidValidationResult;

  scoreRound(input: GameplayRoundScoringInput): GameplayRoundScoringResult;
}
