import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FederationAuctionService,
  type FederationAuctionAction,
} from '../src/index.js';

const players = ['A', 'B', 'C', 'D'] as const;
const fourPasses: readonly FederationAuctionAction[] = players.map((playerId) => ({
  playerId,
  actionType: 'pass',
}));

function resolve(overrides: Partial<Parameters<FederationAuctionService['resolve']>[0]> = {}) {
  return new FederationAuctionService().resolve({
    roundNumber: 5,
    dealerPlayerId: 'A',
    playerIds: players,
    actions: fourPasses,
    ...overrides,
  });
}

test('four unique passes require a redeal with the same dealer and round number', () => {
  const result = resolve();

  assert.equal(result.valid, true);
  assert.equal(result.status, 'redeal-required');
  if (result.status === 'redeal-required') {
    assert.equal(result.reason, 'all-pass');
    assert.equal(result.roundNumber, 5);
    assert.equal(result.dealerPlayerId, 'A');
    assert.equal(result.nextDealerPlayerId, 'A');
  }
});

test('fewer than four passes continue the auction', () => {
  const result = resolve({ actions: fourPasses.slice(0, 3) });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'continue-auction');
});

test('an auction containing a bid continues instead of requiring a redeal', () => {
  const result = resolve({
    actions: [
      { playerId: 'A', actionType: 'pass' },
      { playerId: 'B', actionType: 'pass' },
      { playerId: 'C', actionType: 'bid' },
      { playerId: 'D', actionType: 'pass' },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'continue-auction');
});

test('duplicate player actions are rejected', () => {
  const result = resolve({
    actions: [
      { playerId: 'A', actionType: 'pass' },
      { playerId: 'A', actionType: 'pass' },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid');
  assert.ok(result.errors.includes('Player A cannot act more than once in the same auction attempt.'));
});

test('actions from players outside the game are rejected', () => {
  const result = resolve({ actions: [{ playerId: 'X', actionType: 'pass' }] });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Auction action player is not part of the game: X.'));
});

test('dealer must belong to the game', () => {
  const result = resolve({ dealerPlayerId: 'X' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Dealer must be one of the game players.'));
});

test('round number must be a positive integer', () => {
  const result = resolve({ roundNumber: 0 });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Round number must be a positive integer.'));
});

test('more than four actions are rejected', () => {
  const result = resolve({
    actions: [
      ...fourPasses,
      { playerId: 'A', actionType: 'pass' },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('A Federation auction cannot contain more than four actions.'));
});

test('exactly four unique non-empty game players are required', () => {
  const invalidPlayerLists = [
    ['A', 'B', 'C'],
    ['A', 'B', 'C', 'C'],
    ['A', 'B', 'C', ''],
  ];

  for (const playerIds of invalidPlayerLists) {
    const result = resolve({ playerIds });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('Exactly four unique players are required for a Federation auction.'));
  }
});
