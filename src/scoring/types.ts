import type { ContractSuit } from '../domain/card.js';
import type { EstimationBid } from '../domain/bid.js';

export type RoundType = 'over' | 'under';
export type ScoringProfileType = 'standard' | 'custom';
export type ScoreStatus = 'success' | 'failed' | 'pending-rule';
export type PlayerRoundRole = 'bid-owner' | 'with-player' | 'other-player' | 'risk-taker';
export type OwnerRoundOutcome = 'owner-won' | 'owner-lost';
export type ScoringScope = 'all-players' | 'winner-only' | 'loser-only';
export type RiskType = 'none' | 'dash' | 'dash-call' | 'with' | 'high-contract' | 'custom';

export interface ScoringProfile {
  readonly id: string;
  readonly name: string;
  readonly type: ScoringProfileType;
  readonly scope?: ScoringScope;
  readonly normalBidSuccessBase?: number;
  readonly normalBidSuccessPerTrick?: number;
  readonly normalBidFailurePenaltyPerTrickDifference?: number;
  readonly ownerWinBase?: number;
  readonly ownerWinPerContract?: number;
  readonly ownerLossBase?: number;
  readonly ownerLossPerDelta?: number;
  readonly otherWinBase?: number;
  readonly otherWinPerContract?: number;
  readonly otherLossBase?: number;
  readonly otherLossPerDelta?: number;
  readonly riskSuccessBonus?: number;
  readonly riskFailurePenalty?: number;
  readonly underDashSuccessBonus?: number;
  readonly underDashFailurePenalty?: number;
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

export interface PlayerRoundEvaluation {
  readonly playerId: string;
  readonly bidTricks: number;
  readonly actualTricks: number;
  readonly delta: number;
  readonly didMatchBid: boolean;
  readonly role: PlayerRoundRole;
  readonly riskType: RiskType;
}

export interface ScoreContext {
  readonly roundNumber: number;
  readonly roundType: RoundType;
  readonly winningContractNumber?: number;
  readonly bidOwnerPlayerId?: string;
  readonly ownerOutcome?: OwnerRoundOutcome;
  readonly trumpSuit?: ContractSuit;
  readonly playerBid: EstimationBid;
  readonly actualResult: PlayerRoundActualResult;
  readonly evaluation: PlayerRoundEvaluation;
  readonly profile: ScoringProfile;
}

export interface PlayerScoreResult {
  readonly playerId: string;
  readonly bidTricks: number;
  readonly actualTricks: number;
  readonly delta: number;
  readonly didMatchBid: boolean;
  readonly role: PlayerRoundRole;
  readonly riskType: RiskType;
  readonly status: ScoreStatus;
  readonly score: number;
  readonly notes: readonly string[];
}

export interface RoundScoreInput {
  readonly roundNumber: number;
  readonly roundType: RoundType;
  readonly winningContractNumber?: number;
  readonly bidOwnerPlayerId?: string;
  readonly trumpSuit?: ContractSuit;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly profile: ScoringProfile;
}

export interface RoundScoreResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly ownerOutcome?: OwnerRoundOutcome;
  readonly playerScores: readonly PlayerScoreResult[];
}

export interface ScoringStrategy {
  calculatePlayerScore(context: ScoreContext): PlayerScoreResult;
}
