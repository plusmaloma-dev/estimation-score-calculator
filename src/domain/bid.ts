import type { ContractSuit } from './card.js';

export type BidType = 'normal' | 'dash' | 'dash-call' | 'with' | 'hold';
export type BidValidationMode = 'auction-calls' | 'round-estimates';

export interface EstimationBid {
  readonly playerId: string;
  readonly bidType: BidType;
  readonly tricks: number;
  readonly trumpSuit?: ContractSuit;
  readonly withTargetPlayerId?: string;
}

export interface BidValidationOptions {
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
  readonly mode?: BidValidationMode;
  readonly bidOwnerPlayerId?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface RoundBidValidationResult extends ValidationResult {
  readonly totalEstimatedTricks: number;
  readonly roundType?: 'over' | 'under';
}
