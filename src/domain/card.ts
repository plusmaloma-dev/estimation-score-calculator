export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export const FULL_DECK_SIZE = SUITS.length * RANKS.length;

const rankOrder = new Map<Rank, number>(RANKS.map((rank, index) => [rank, index]));

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

export function isValidSuit(value: string): value is Suit {
  return (SUITS as readonly string[]).includes(value);
}

export function isValidRank(value: string): value is Rank {
  return (RANKS as readonly string[]).includes(value);
}

export function compareRanks(left: Rank, right: Rank): number {
  return (rankOrder.get(left) ?? -1) - (rankOrder.get(right) ?? -1);
}
