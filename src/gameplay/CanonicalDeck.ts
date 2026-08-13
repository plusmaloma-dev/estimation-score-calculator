import { CARD_SUITS, RANKS, type Card } from '../domain/card.js';

export function createCanonicalDeck(): readonly Card[] {
  return CARD_SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}
