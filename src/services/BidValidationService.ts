import { FULL_DECK_SIZE, isValidContractSuit } from '../domain/card.js';
import type { BidValidationOptions, EstimationBid, RoundBidValidationResult, ValidationResult } from '../domain/bid.js';

export class BidValidationService {
  validateBid(
    bid: EstimationBid,
    options: BidValidationOptions,
  ): ValidationResult {
    const errors: string[] = [];

    if (!bid.playerId.trim()) {
      errors.push('Player id is required.');
    }

    if (!Number.isInteger(options.playerCount) || options.playerCount !== 4) {
      errors.push('Egyptian Estimation requires exactly 4 players.');
    }

    if (!Number.isInteger(options.cardsPerPlayer) || options.cardsPerPlayer !== 13) {
      errors.push('Egyptian Estimation requires exactly 13 cards per player.');
    }

    if (options.playerCount * options.cardsPerPlayer > FULL_DECK_SIZE) {
      errors.push('Player count and cards per player cannot exceed the 52-card deck size.');
    }

    if (!['normal', 'dash', 'dash-call'].includes(bid.bidType)) {
      errors.push('Bid type must be normal, dash, or dash-call.');
    }

    if (!Number.isInteger(bid.tricks)) {
      errors.push('Trick bid must be an integer.');
    } else if (bid.tricks < 0) {
      errors.push('Trick bid cannot be negative.');
    } else if (bid.tricks > options.cardsPerPlayer) {
      errors.push('Trick bid cannot exceed cards per player.');
    }

    if (bid.bidType === 'normal') {
      if (bid.trumpSuit === undefined) {
        errors.push('Normal bids require a trump suit or no-trump contract.');
      } else if (!isValidContractSuit(bid.trumpSuit)) {
        errors.push('Selected contract suit must be one of: no-trump, spades, hearts, diamonds, clubs.');
      }
    }

    if (bid.bidType !== 'normal' && bid.tricks !== 0) {
      errors.push('Dash and Dash Call bids must use 0 estimated tricks until their scoring rules are confirmed.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateRoundBids(
    bids: readonly EstimationBid[],
    options: BidValidationOptions = { playerCount: 4, cardsPerPlayer: 13 },
  ): RoundBidValidationResult {
    const errors: string[] = [];
    const playerIds = new Set<string>();

    if (bids.length !== 4) {
      errors.push('Exactly 4 bids are required for an Egyptian Estimation round.');
    }

    for (const bid of bids) {
      const bidValidation = this.validateBid(bid, options);
      errors.push(...bidValidation.errors);

      const playerId = bid.playerId.trim();
      if (playerIds.has(playerId)) {
        errors.push(`Player ${playerId} cannot submit more than one bid in the same round.`);
      }
      playerIds.add(playerId);
    }

    const totalEstimatedTricks = bids.reduce((total, bid) => total + bid.tricks, 0);
    let roundType: 'over' | 'under' | undefined;

    if (totalEstimatedTricks === options.cardsPerPlayer) {
      errors.push('Total estimates cannot equal 13. The round must be Over or Under.');
    } else if (totalEstimatedTricks > options.cardsPerPlayer) {
      roundType = 'over';
    } else {
      roundType = 'under';
    }

    return {
      valid: errors.length === 0,
      errors,
      totalEstimatedTricks,
      roundType,
    };
  }

  validateEgyptianEstimationBid(
    bid: EstimationBid,
    options: BidValidationOptions,
  ): ValidationResult {
    return this.validateBid(bid, options);
  }
}
