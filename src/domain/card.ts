export const CARD_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type CardSuit = (typeof CARD_SUITS)[number];

export const CONTRACT_SUITS = ['no-trump', 'spades', 'hearts', 'diamonds', 'clubs'] as const;
export type ContractSuit = (typeof CONTRACT_SUITS)[number];

// Backward-compatible alias for physical card suits.
export const SUITS = CARD_SUITS;
export type Suit = CardSuit;

export const CONTRACT_SUIT_PRIORITY: readonly ContractSuit[] = [
  'no-trump',
  'spades',
  'hearts',
  'diamonds',
  'clubs',
];

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
  readonly suit: CardSuit;
  readonly rank: Rank;
}

export const FULL_DECK_SIZE = CARD_SUITS.length * RANKS.length;

const rankOrder = new Map<Rank, number>(RANKS.map((rank, index) => [rank, index]));

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

export function isValidSuit(value: string): value is CardSuit {
  return (CARD_SUITS as readonly string[]).includes(value);
}

export function isValidContractSuit(value: string): value is ContractSuit {
  return (CONTRACT_SUITS as readonly string[]).includes(value);
}

export function contractSuitStrength(suit: ContractSuit): number {
  const index = CONTRACT_SUIT_PRIORITY.indexOf(suit);
  return index === -1 ? Number.NEGATIVE_INFINITY : CONTRACT_SUIT_PRIORITY.length - index;
}

export function isValidRank(value: string): value is Rank {
  return (RANKS as readonly string[]).includes(value);
}

export function compareRanks(left: Rank, right: Rank): number {
  return (rankOrder.get(left) ?? -1) - (rankOrder.get(right) ?? -1);
}
