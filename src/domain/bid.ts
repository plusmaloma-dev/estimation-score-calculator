import type { Suit } from './card.js';

export type BidMode = 'egyptian-estimation' | 'planning-poker';

export interface EstimationBid {
  readonly mode: 'egyptian-estimation';
  readonly playerId: string;
  readonly tricks: number;
  readonly trumpSuit?: Suit;
}

export interface PlanningPokerVote {
  readonly mode: 'planning-poker';
  readonly playerId: string;
  readonly value: number | '?' | 'coffee';
}

export type Bid = EstimationBid | PlanningPokerVote;

export interface BidValidationOptions {
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
