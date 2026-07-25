import { compareRanks, type ContractSuit } from '../domain/card.js';
import type { GameplayTrickEntry, SeatIndex } from './types.js';

export class TrickResolutionService {
  resolve(
    entries: readonly GameplayTrickEntry[],
    contractSuit: ContractSuit,
  ): SeatIndex {
    if (entries.length !== 4) {
      throw new Error('A completed Estimation trick requires exactly four cards.');
    }
    if (new Set(entries.map((entry) => entry.seat)).size !== 4) {
      throw new Error('A completed Estimation trick requires four unique seats.');
    }

    const leadSuit = entries[0]!.card.suit;
    const trumpEntries = contractSuit === 'no-trump'
      ? []
      : entries.filter((entry) => entry.card.suit === contractSuit);
    const eligibleEntries = trumpEntries.length > 0
      ? trumpEntries
      : entries.filter((entry) => entry.card.suit === leadSuit);

    return eligibleEntries.reduce((winner, challenger) => (
      compareRanks(challenger.card.rank, winner.card.rank) > 0
        ? challenger
        : winner
    )).seat;
  }
}
