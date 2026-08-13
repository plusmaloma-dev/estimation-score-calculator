import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StandardBidPolicy,
  type BotBidObservation,
  type Card,
  type EstimationBid,
} from '../src/index.js';

const strongHand: readonly Card[] = [
  { suit: 'spades', rank: 'A' },
  { suit: 'spades', rank: 'K' },
  { suit: 'spades', rank: 'Q' },
  { suit: 'spades', rank: 'J' },
  { suit: 'hearts', rank: 'A' },
  { suit: 'hearts', rank: 'K' },
  { suit: 'hearts', rank: 'Q' },
  { suit: 'diamonds', rank: 'A' },
  { suit: 'diamonds', rank: 'K' },
  { suit: 'diamonds', rank: 'Q' },
  { suit: 'clubs', rank: 'A' },
  { suit: 'clubs', rank: 'K' },
  { suit: 'clubs', rank: 'Q' },
];

const weakHand: readonly Card[] = [
  { suit: 'spades', rank: '2' },
  { suit: 'spades', rank: '3' },
  { suit: 'spades', rank: '4' },
  { suit: 'spades', rank: '5' },
  { suit: 'hearts', rank: '2' },
  { suit: 'hearts', rank: '3' },
  { suit: 'hearts', rank: '4' },
  { suit: 'diamonds', rank: '2' },
  { suit: 'diamonds', rank: '3' },
  { suit: 'diamonds', rank: '4' },
  { suit: 'clubs', rank: '2' },
  { suit: 'clubs', rank: '3' },
  { suit: 'clubs', rank: '4' },
];

const priorBids: readonly EstimationBid[] = [
  { playerId: 'p0', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
  { playerId: 'p1', bidType: 'normal', tricks: 2 },
  { playerId: 'p2', bidType: 'normal', tricks: 1 },
];

function legalBid(tricks: number): EstimationBid {
  return { playerId: 'p3', bidType: 'normal', tricks };
}

function observation(
  hand: readonly Card[],
  overrides: Partial<BotBidObservation> = {},
): BotBidObservation {
  return {
    policyVersion: 'STANDARD_V1',
    playerId: 'p3',
    hand,
    legalBids: [1, 2, 3, 4, 6, 7].map(legalBid),
    priorBids,
    bidOwnerPlayerId: 'p0',
    isLastBidder: false,
    currentScores: { p0: 0, p1: 0, p2: 0, p3: 0 },
    ...overrides,
  };
}

test('stronger hand selects a higher exact estimate than a weak hand', () => {
  const policy = new StandardBidPolicy();

  const strong = policy.decide(observation(strongHand));
  const weak = policy.decide(observation(weakHand));

  assert.ok(strong.bid.tricks > weak.bid.tricks);
  assert.equal(strong.evaluatedLegalBids, 6);
  assert.equal(weak.evaluatedLegalBids, 6);
});

test('selected bid always comes from the supplied legal action list', () => {
  const input = observation(strongHand, {
    isLastBidder: true,
    legalBids: [1, 2, 4, 6].map(legalBid),
  });

  const decision = new StandardBidPolicy().decide(input);

  assert.ok(input.legalBids.some((bid) => JSON.stringify(bid) === JSON.stringify(decision.bid)));
  assert.notEqual(decision.bid.tricks, 5);
});

test('same bid observation produces the same decision and utility', () => {
  const policy = new StandardBidPolicy();
  const input = observation(strongHand);

  assert.deepEqual(policy.decide(input), policy.decide(input));
});

test('policy rejects an empty legal bid list', () => {
  const policy = new StandardBidPolicy();

  assert.throws(
    () => policy.decide(observation(strongHand, { legalBids: [] })),
    /Standard bid policy requires at least one legal bid\./,
  );
});

test('policy rejects a legal bid assigned to another player', () => {
  const policy = new StandardBidPolicy();

  assert.throws(
    () => policy.decide(observation(strongHand, {
      legalBids: [{ playerId: 'other-player', bidType: 'normal', tricks: 3 }],
    })),
    /Every legal bid must belong to bot player p3\./,
  );
});
