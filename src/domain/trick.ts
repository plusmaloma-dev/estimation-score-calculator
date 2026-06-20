import type { Card } from './card.js';

export interface TrickEntry {
  readonly playerId: string;
  readonly card: Card;
}

export interface Trick {
  readonly roundNumber: number;
  readonly trickNumber: number;
  readonly entries: readonly TrickEntry[];
}

export interface TrickValidationOptions {
  readonly activePlayerIds: readonly string[];
}
