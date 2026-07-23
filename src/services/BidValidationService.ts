import { FULL_DECK_SIZE, isValidContractSuit } from '../domain/card.js';
import type { BidValidationOptions, EstimationBid, RoundBidValidationResult, ValidationResult } from '../domain/bid.js';

const MIN_NORMAL_CONTRACT = 4;
const MAX_NORMAL_CONTRACT = 13;
const MAX_ROUND_ESTIMATE = 12;

export class BidValidationService {
  validateBid(
    bid: EstimationBid,
    options: BidValidationOptions,
  ): ValidationResult {
    const errors: string[] = [];
    const mode = options.mode ?? 'auction-calls';

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

    if (!['normal', 'dash', 'dash-call', 'with', 'hold'].includes(bid.bidType)) {
      errors.push('Bid type must be normal, dash, dash-call, with, or hold.');
    }

    if (mode === 'auction-calls' && bid.bidType === 'hold') {
      errors.push('Hold bids are only valid for accepted round estimates.');
    }

    if (!Number.isInteger(bid.tricks)) {
      errors.push('Trick bid must be an integer.');
    } else if (bid.tricks < 0) {
      errors.push('Trick bid cannot be negative.');
    } else if (mode === 'round-estimates' && bid.tricks > MAX_ROUND_ESTIMATE) {
      errors.push('Round estimates must be between 0 and 12 tricks.');
    } else if (mode === 'auction-calls' && bid.tricks > options.cardsPerPlayer) {
      errors.push('Trick bid cannot exceed cards per player.');
    }

    if (mode === 'auction-calls' && (bid.bidType === 'normal' || bid.bidType === 'with')) {
      if (bid.tricks < MIN_NORMAL_CONTRACT || bid.tricks > MAX_NORMAL_CONTRACT) {
        errors.push('Normal and With bids must be between 4 and 13 tricks.');
      }

      if (bid.trumpSuit === undefined) {
        errors.push('Normal and With bids require a trump suit or no-trump contract.');
      } else if (!isValidContractSuit(bid.trumpSuit)) {
        errors.push('Selected contract suit must be one of: no-trump, spades, hearts, diamonds, clubs.');
      }
    }

    if (mode === 'round-estimates') {
      const isBidOwner = bid.playerId === options.bidOwnerPlayerId;
      if (isBidOwner && bid.trumpSuit === undefined) {
        errors.push('The highest estimator must select a trump suit or no-trump contract.');
      }
      if (bid.trumpSuit !== undefined && !isValidContractSuit(bid.trumpSuit)) {
        errors.push('Selected contract suit must be one of: no-trump, spades, hearts, diamonds, clubs.');
      }
    }

    if (bid.bidType === 'with' && !bid.withTargetPlayerId?.trim()) {
      errors.push('With bids must reference the bid owner they are matching.');
    }

    if ((bid.bidType === 'dash' || bid.bidType === 'dash-call') && bid.tricks !== 0) {
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
    const mode = options.mode ?? 'auction-calls';

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

    if (mode === 'round-estimates') {
      const highest = Math.max(...bids.map((bid) => bid.tricks));
      const leaders = bids.filter((bid) => bid.tricks === highest);
      const owner = bids.find((bid) => bid.playerId === options.bidOwnerPlayerId);

      if (options.bidOwnerPlayerId === undefined) {
        errors.push('Bid owner player id is required for accepted round estimates.');
      } else if (owner === undefined || owner.tricks !== highest) {
        errors.push('Bid owner must be one of the players with the highest estimate.');
      } else {
        if (owner.bidType === 'with') {
          errors.push('The original highest estimator cannot be marked With.');
        }
        if (owner.bidType === 'hold') {
          errors.push('The bid owner cannot be marked Hold.');
        }

        for (const leader of leaders) {
          if (leader.playerId === owner.playerId) continue;
          if (leader.bidType !== 'with' || leader.withTargetPlayerId !== owner.playerId) {
            errors.push(`Player ${leader.playerId} must be marked With the bid owner.`);
          }
        }

        for (const bid of bids) {
          if (bid.tricks !== highest && bid.bidType === 'with') {
            errors.push(`Player ${bid.playerId} cannot be marked With without matching the highest estimate.`);
          }
        }
      }
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
