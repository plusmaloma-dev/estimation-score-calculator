import assert from 'node:assert/strict';
import test from 'node:test';

import { GameplayPlayerSnapshotProjector } from '../src/gameplay/GameplayPlayerSnapshotProjector.js';
import type { HouseRulesRoundState, SeatHands } from '../src/gameplay/types.js';

const hands: SeatHands = [
  { seat: 0, cards: [{ suit: 'hearts', rank: 'A' }, { suit: 'clubs', rank: '2' }] },
  { seat: 1, cards: [{ suit: 'spades', rank: 'K' }, { suit: 'diamonds', rank: '3' }] },
  { seat: 2, cards: [{ suit: 'hearts', rank: '4' }, { suit: 'clubs', rank: '5' }] },
  { seat: 3, cards: [{ suit: 'spades', rank: '6' }, { suit: 'diamonds', rank: '7' }] },
];

function state(overrides: Partial<HouseRulesRoundState> = {}): HouseRulesRoundState {
  return {
    roundNumber: 1,
    phase: 'playing',
    players: [
      { seat: 0, playerId: 'p0' },
      { seat: 1, playerId: 'p1' },
      { seat: 2, playerId: 'p2' },
      { seat: 3, playerId: 'p3' },
    ],
    hands,
    bidOrder: [0, 1, 2, 3],
    playOrder: [0, 1, 2, 3],
    bidOwnerSeat: 0,
    firstLeadSeat: 0,
    currentBidIndex: 4,
    currentTurnSeat: 0,
    bids: [
      { playerId: 'p0', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
      { playerId: 'p1', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
      { playerId: 'p2', bidType: 'normal', tricks: 2, trumpSuit: 'hearts' },
      { playerId: 'p3', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
    ],
    currentTrick: [{ seat: 2, card: { suit: 'hearts', rank: '4' } }],
    completedTricks: [],
    actualTricksBySeat: [1, 0, 0, 0],
    ...overrides,
  };
}

test('viewer snapshot exposes only the viewer hand and public round state', () => {
  const projector = new GameplayPlayerSnapshotProjector();

  const snapshot = projector.project(state(), 0);
  const serialized = JSON.stringify(snapshot);

  assert.deepEqual(snapshot.ownHand, hands[0].cards);
  assert.equal(snapshot.opponentCardCounts[1], 2);
  assert.equal(snapshot.phase, 'playing');
  assert.equal(snapshot.currentTurnSeat, 0);
  assert.equal(snapshot.bids.length, 4);
  assert.deepEqual(snapshot.currentTrick, [{ seat: 2, card: { suit: 'hearts', rank: '4' } }]);
  assert.deepEqual(snapshot.actualTricksBySeat, [1, 0, 0, 0]);
  assert.doesNotMatch(serialized, /K-spades|3-diamonds|5-clubs|6-spades|7-diamonds/);
  assert.equal('hands' in snapshot, false);
});

test('legal card projection follows the led suit and is empty for a non-turn viewer', () => {
  const projector = new GameplayPlayerSnapshotProjector();

  const active = projector.project(state(), 0);
  const waiting = projector.project(state(), 1);

  assert.deepEqual(active.legalCards, [{ suit: 'hearts', rank: 'A' }]);
  assert.deepEqual(waiting.legalCards, []);
});

test('bidding snapshot exposes legal estimates without allowing total estimates to equal thirteen', () => {
  const projector = new GameplayPlayerSnapshotProjector();
  const bidding = state({
    phase: 'bidding',
    currentBidIndex: 3,
    currentTurnSeat: 3,
    bids: [
      { playerId: 'p0', bidType: 'normal', tricks: 3 },
      { playerId: 'p1', bidType: 'normal', tricks: 4 },
      { playerId: 'p2', bidType: 'normal', tricks: 2 },
    ],
    currentTrick: [],
  });

  const snapshot = projector.project(bidding, 3);

  assert.equal(snapshot.legalEstimates.includes(4), false);
  assert.equal(snapshot.legalEstimates.includes(3), true);
  assert.equal(snapshot.legalEstimates.includes(5), true);
});

test('scored snapshot preserves public score result but never restores hidden hands', () => {
  const scored = state({
    phase: 'scored',
    currentTurnSeat: undefined,
    hands: [
      { seat: 0, cards: [] },
      { seat: 1, cards: [] },
      { seat: 2, cards: [] },
      { seat: 3, cards: [] },
    ],
    scoreResult: {
      valid: true,
      errors: [],
      scores: [10, -4, 12, -1],
      totalEstimatedTricks: 13,
      roundType: 'over',
      riskTakerPlayerId: 'p3',
      riskBonusByPlayerId: {},
    },
  });

  const snapshot = new GameplayPlayerSnapshotProjector().project(scored, 2);

  assert.deepEqual(snapshot.scoreResult?.scores, [10, -4, 12, -1]);
  assert.deepEqual(snapshot.ownHand, []);
  assert.deepEqual(snapshot.legalCards, []);
  assert.deepEqual(snapshot.legalEstimates, []);
});
