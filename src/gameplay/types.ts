import type { Card } from '../domain/card.js';

export const SEAT_INDICES = [0, 1, 2, 3] as const;
export type SeatIndex = (typeof SEAT_INDICES)[number];

export interface SeatHand {
  readonly seat: SeatIndex;
  readonly cards: readonly Card[];
}

export type SeatHands = readonly [SeatHand, SeatHand, SeatHand, SeatHand];

export interface FairDealInput {
  readonly gameId: string;
  readonly dealId: string;
  readonly ruleSet: 'HOUSE_RULES_V1';
  readonly nonce: string;
  readonly seedHex: string;
  readonly firstSeat: SeatIndex;
}

export interface FairDealResult extends FairDealInput {
  readonly commitment: string;
  readonly shuffledDeck: readonly Card[];
  readonly hands: SeatHands;
}

export interface DealVerificationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
