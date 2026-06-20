import type { ContractSuit } from '../domain/card.js';
import type { EstimationBid } from '../domain/bid.js';

export type RoundType = 'over' | 'under';
export type ScoringProfileType = 'standard' | 'custom';
export type ScoreStatus = 'success' | 'failed' | 'pending-rule';

export interface ScoringProfile {
  readonly id: string;
  readonly name: string;
  readonly type: ScoringProfileType;
  readonly normalBidSuccessBase?: number;
  readonly normalBidSuccessPerTrick?: number;
  readonly normalBidFailurePenaltyPerTrickDifference?: number;
  readonly highContractThreshold?: number;
  readonly highContractMultiplier?: number;
  readonly dashSuccessScore?: number;
  readonly dashFailureScore?: number;
  readonly dashCallSuccessScore?: number;
  readonly dashCallFailureScore?: number;
}

export interface PlayerRoundActualResult {
  readonly playerId: string;
  readonly actualTricks: number;
}

export interface ScoreContext {
  readonly roundNumber: number;
  readonly roundType: RoundType;
  readonly winningContractNumber?: number;
  readonly trumpSuit?: ContractSuit;
  readonly playerBid: EstimationBid;
  readonly actualResult: PlayerRoundActualResult;
  readonly profile: ScoringProfile;
}

export interface PlayerScoreResult {
  readonly playerId: string;
  readonly bidTricks: number;
  readonly actualTricks: number;
  readonly status: ScoreStatus;
  readonly score: number;
  readonly notes: readonly string[];
}

export interface RoundScoreInput {
  readonly roundNumber: number;
  readonly roundType: RoundType;
  readonly winningContractNumber?: number;
  readonly trumpSuit?: ContractSuit;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly profile: ScoringProfile;
}

export interface RoundScoreResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly playerScores: readonly PlayerScoreResult[];
}

export interface ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult;
}
