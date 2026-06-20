import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HighestBidResolver } from '../src/services/HighestBidResolver.js';
import type { EstimationBid } from '../src/domain/bid.js';

const resolver = new HighestBidResolver();

function bid(playerId: string, tricks: number, trumpSuit?: EstimationBid['trumpSuit']): EstimationBid {
  return {
    playerId,
    bidType: 'normal',
    tricks,
    trumpSuit,
  };
}

describe('HighestBidResolver', () => {
  it('returns null when no bids are provided', () => {
    assert.deepEqual(resolver.resolve([]), {
      winningBid: null,
      tiedBids: [],
    });
  });

  it('selects the highest trick bid', () => {
    const result = resolver.resolve([
      bid('player-1', 4, 'clubs'),
      bid('player-2', 7, 'diamonds'),
      bid('player-3', 5, 'spades'),
    ]);

    assert.equal(result.winningBid?.playerId, 'player-2');
    assert.deepEqual(result.tiedBids.map((item) => item.playerId), ['player-2']);
  });

  it('uses configurable suit priority when trick bids match', () => {
    const result = resolver.resolve(
      [bid('player-1', 6, 'clubs'), bid('player-2', 6, 'hearts')],
      { suitPriority: ['clubs', 'diamonds', 'hearts', 'spades'] },
    );

    assert.equal(result.winningBid?.playerId, 'player-2');
  });

  it('reports ties when trick count and suit priority are equal', () => {
    const result = resolver.resolve([bid('player-1', 8, 'spades'), bid('player-2', 8, 'spades')]);

    assert.equal(result.winningBid?.playerId, 'player-1');
    assert.deepEqual(result.tiedBids.map((item) => item.playerId), ['player-1', 'player-2']);
  });
});
