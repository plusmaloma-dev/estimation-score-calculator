import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HandStrengthEvaluator,
  type Card,
  type TrickProbability,
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

const longTrumpHand: readonly Card[] = [
  { suit: 'spades', rank: 'A' },
  { suit: 'spades', rank: 'K' },
  { suit: 'spades', rank: 'Q' },
  { suit: 'spades', rank: 'J' },
  { suit: 'spades', rank: '10' },
  { suit: 'spades', rank: '9' },
  { suit: 'spades', rank: '8' },
  { suit: 'hearts', rank: '2' },
  { suit: 'hearts', rank: '3' },
  { suit: 'diamonds', rank: '2' },
  { suit: 'diamonds', rank: '3' },
  { suit: 'clubs', rank: '2' },
  { suit: 'clubs', rank: '3' },
];

function expectedTricks(distribution: readonly TrickProbability[]): number {
  return distribution.reduce(
    (total, entry) => total + entry.tricks * entry.probability,
    0,
  );
}

test('evaluator returns a normalized probability for every trick count zero through thirteen', () => {
  const distribution = new HandStrengthEvaluator().evaluate(strongHand, 'spades');

  assert.deepEqual(distribution.map((entry) => entry.tricks), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.ok(distribution.every((entry) => entry.probability >= 0));
  const total = distribution.reduce((sum, entry) => sum + entry.probability, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('strong honours shift expected tricks above a weak hand', () => {
  const evaluator = new HandStrengthEvaluator();

  const strongExpected = expectedTricks(evaluator.evaluate(strongHand, 'spades'));
  const weakExpected = expectedTricks(evaluator.evaluate(weakHand, 'spades'));

  assert.ok(strongExpected > weakExpected + 3);
});

test('long high trump holding is stronger when its suit is trump than in No Trump', () => {
  const evaluator = new HandStrengthEvaluator();

  const trumpExpected = expectedTricks(evaluator.evaluate(longTrumpHand, 'spades'));
  const noTrumpExpected = expectedTricks(evaluator.evaluate(longTrumpHand, 'no-trump'));

  assert.ok(trumpExpected > noTrumpExpected);
});

test('same hand and contract produce identical probability distributions', () => {
  const evaluator = new HandStrengthEvaluator();

  assert.deepEqual(
    evaluator.evaluate(strongHand, 'hearts'),
    evaluator.evaluate(strongHand, 'hearts'),
  );
});

test('evaluator rejects hands that are not thirteen unique cards', () => {
  const evaluator = new HandStrengthEvaluator();

  assert.throws(
    () => evaluator.evaluate(strongHand.slice(0, 12), 'spades'),
    /Standard bot hand evaluation requires exactly thirteen unique cards\./,
  );
});
