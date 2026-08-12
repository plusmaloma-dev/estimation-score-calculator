import type { SeatIndex } from './types.js';

export interface GameplayRoundScoreHistoryRow {
  readonly roundNumber: number;
  readonly deltasBySeat: readonly [number, number, number, number];
}

export interface GameplaySeatPresentationMetadata {
  readonly seat: SeatIndex;
  readonly displayName: string;
  readonly isBot: boolean;
}
