import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StandardBotPolicy,
  StandardCardPolicy,
  cardId,
  type BotBidObservation,
  type BotCardObservation,
  type BotCardDecision,
  type Card,
} from '../src/index.js';

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

function cardObservation(): BotCardObservation {
  const hand: readonly Card[] = [
    { suit: 'clubs', rank: '2' },
    { suit: 'clubs', rank: 'A' },
  ];
  return {
    policyVersion: 'STANDARD_V1',
    seat: 0,
    hand,
    legalCards: hand,
    bids: [],
    contractSuit: 'spades',
    currentTrick: [],
    completedTricks: [],
    estimate: 1,
    tricksWon: 1,
    cardsRemaining: 2,
  };
}

function bidObservation(): BotBidObservation {
  return {
    policyVersion: 'STANDARD_V1',
    playerId: 'p3',
    hand: weakHand,
    legalBids: [
      { playerId: 'p3', bidType: 'normal', tricks: 1 },
      { playerId: 'p3', bidType: 'normal', tricks: 2 },
      { playerId: 'p3', bidType: 'normal', tricks: 4 },
    ],
    priorBids: [
      { playerId: 'p0', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      { playerId: 'p1', bidType: 'normal', tricks: 2 },
      { playerId: 'p2', bidType: 'normal', tricks: 1 },
    ],
    bidOwnerPlayerId: 'p0',
    isLastBidder: true,
    currentScores: { p0: 0, p1: 0, p2: 0, p3: 0 },
  };
}

test('normal card decision records source, legal actions, reason, and duration', () => {
  const times = [100, 104];
  const policy = new StandardBotPolicy({
    clock: () => times.shift() ?? 104,
  });

  const result = policy.decideCard(cardObservation(), 'permanent-bot');

  assert.equal(result.audit.policyVersion, 'STANDARD_V1');
  assert.equal(result.audit.actionSource, 'permanent-bot');
  assert.equal(result.audit.fallbackUsed, false);
  assert.equal(result.audit.durationMs, 4);
  assert.equal(result.audit.reasonCode, 'AVOID_OVERTRICK');
  assert.deepEqual(result.audit.legalActionIds, ['2-clubs', 'A-clubs']);
  assert.equal(result.audit.selectedActionId, cardId(result.decision.card));
});

test('throwing primary card policy uses a deterministic legal fallback', () => {
  const throwingPolicy = {
    decide(): BotCardDecision {
      throw new Error('primary failed');
    },
  };
  const policy = new StandardBotPolicy({
    cardPolicy: throwingPolicy,
    clock: () => 10,
  });
  const observation = cardObservation();

  const first = policy.decideCard(observation, 'disconnect-substitute');
  const second = policy.decideCard(observation, 'disconnect-substitute');

  assert.equal(first.audit.fallbackUsed, true);
  assert.equal(first.audit.reasonCode, 'POLICY_ERROR_FALLBACK');
  assert.equal(first.audit.actionSource, 'disconnect-substitute');
  assert.ok(observation.legalCards.some((card) => cardId(card) === cardId(first.decision.card)));
  assert.deepEqual(first.decision, second.decision);
});

test('primary decision exceeding hard limit is replaced by fallback', () => {
  let now = 0;
  const slowPolicy = {
    decide(observation: BotCardObservation): BotCardDecision {
      now = 6_000;
      return new StandardCardPolicy().decide(observation);
    },
  };
  const policy = new StandardBotPolicy({
    cardPolicy: slowPolicy,
    clock: () => now,
    hardLimitMs: 5_000,
  });

  const result = policy.decideCard(cardObservation(), 'timeout-assistant');

  assert.equal(result.audit.fallbackUsed, true);
  assert.equal(result.audit.reasonCode, 'POLICY_TIMEOUT_FALLBACK');
  assert.equal(result.audit.actionSource, 'timeout-assistant');
  assert.equal(result.audit.durationMs, 6_000);
});

test('throwing primary bid policy selects a legal deterministic fallback bid', () => {
  const policy = new StandardBotPolicy({
    bidPolicy: {
      decide(): never {
        throw new Error('bid model failed');
      },
    },
    clock: () => 20,
  });
  const observation = bidObservation();

  const result = policy.decideBid(observation, 'permanent-bot');

  assert.equal(result.audit.fallbackUsed, true);
  assert.equal(result.audit.reasonCode, 'POLICY_ERROR_FALLBACK');
  assert.ok(observation.legalBids.some(
    (bid) => JSON.stringify(bid) === JSON.stringify(result.decision.bid),
  ));
  assert.deepEqual(result.decision.bid, observation.legalBids[0]);
});
