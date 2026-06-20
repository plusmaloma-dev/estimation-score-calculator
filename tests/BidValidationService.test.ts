import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BidValidationService } from '../src/services/BidValidationService.js';
import type { EstimationBid } from '../src/domain/bid.js';

const service = new BidValidationService();
const standardOptions = { playerCount: 4, cardsPerPlayer: 13 };

describe('BidValidationService', () => {
  it('accepts a valid Egyptian Estimation bid', () => {
    const bid: EstimationBid = {
      mode: 'egyptian-estimation',
      playerId: 'player-1',
      tricks: 7,
      trumpSuit: 'spades',
    };

    assert.deepEqual(service.validateEgyptianEstimationBid(bid, standardOptions), {
      valid: true,
      errors: [],
    });
  });

  it('rejects empty players and negative trick bids', () => {
    const bid: EstimationBid = {
      mode: 'egyptian-estimation',
      playerId: ' ',
      tricks: -1,
    };

    const result = service.validateEgyptianEstimationBid(bid, standardOptions);

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /Player id is required/);
    assert.match(result.errors.join('\n'), /cannot be negative/);
  });

  it('rejects bids above the cards dealt to a player', () => {
    const bid: EstimationBid = {
      mode: 'egyptian-estimation',
      playerId: 'player-1',
      tricks: 14,
    };

    const result = service.validateEgyptianEstimationBid(bid, standardOptions);

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /cannot exceed cards per player/);
  });

  it('rejects impossible table sizes', () => {
    const bid: EstimationBid = {
      mode: 'egyptian-estimation',
      playerId: 'player-1',
      tricks: 1,
    };

    const result = service.validateEgyptianEstimationBid(bid, {
      playerCount: 5,
      cardsPerPlayer: 11,
    });

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /52-card deck size/);
  });
});
