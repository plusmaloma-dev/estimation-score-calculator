import { FULL_DECK_SIZE, isValidSuit } from '../domain/card.js';
import type { BidValidationOptions, EstimationBid, ValidationResult } from '../domain/bid.js';

export class BidValidationService {
  validateEgyptianEstimationBid(
    bid: EstimationBid,
    options: BidValidationOptions,
  ): ValidationResult {
    const errors: string[] = [];

    if (bid.mode !== 'egyptian-estimation') {
      errors.push('Bid mode must be egyptian-estimation. Planning Poker votes are validated separately.');
    }

    if (!bid.playerId.trim()) {
      errors.push('Player id is required.');
    }

    if (!Number.isInteger(options.playerCount) || options.playerCount < 2) {
      errors.push('Player count must be an integer greater than or equal to 2.');
    }

    if (!Number.isInteger(options.cardsPerPlayer) || options.cardsPerPlayer < 1) {
      errors.push('Cards per player must be a positive integer.');
    }

    if (options.playerCount * options.cardsPerPlayer > FULL_DECK_SIZE) {
      errors.push('Player count and cards per player cannot exceed the 52-card deck size.');
    }

    if (!Number.isInteger(bid.tricks)) {
      errors.push('Trick bid must be an integer.');
    } else if (bid.tricks < 0) {
      errors.push('Trick bid cannot be negative.');
    } else if (bid.tricks > options.cardsPerPlayer) {
      errors.push('Trick bid cannot exceed cards per player.');
    }

    const suitToCheck = bid.trumpSuit;
    if (suitToCheck !== undefined && !isValidSuit(suitToCheck)) {
      errors.push('Selected suit must be one of: spades, hearts, diamonds, clubs.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
