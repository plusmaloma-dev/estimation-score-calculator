import assert from 'node:assert/strict';
import test from 'node:test';
import { BalanceAccumulator } from '../src/scoring/BalanceAccumulator.js';
import type { RoundScoreResult } from '../src/scoring/types.js';

function round(scores: Record<string, number>): RoundScoreResult {
  return {
    valid: true,
    errors: [],
    playerScores: Object.entries(scores).map(([playerId, score]) => ({
      playerId,
      bidTricks: 0,
      actualTricks: 0,
      delta: 0,
      didMatchBid: score >= 0,
      role: 'other-player',
      riskType: 'none',
      isRiskTaker: false,
      riskModifier: 0,
      isHighContract: false,
      isOnlyWinner: false,
      isOnlyLoser: false,
      status: score >= 0 ? 'success' : 'failed',
      score,
      notes: [],
    })),
  };
}

test('accumulates running balances across rounds', () => {
  const accumulator = new BalanceAccumulator(['p1', 'p2', 'p3', 'p4']);

  const round1 = accumulator.addRound(1, round({ p1: 24, p2: 13, p3: 13, p4: -21 }));
  assert.deepEqual(round1.balances, [
    { playerId: 'p1', balance: 24 },
    { playerId: 'p2', balance: 13 },
    { playerId: 'p3', balance: 13 },
    { playerId: 'p4', balance: -21 },
  ]);

  const round2 = accumulator.addRound(2, round({ p1: 20, p2: 25, p3: 14, p4: 12 }));
  assert.deepEqual(round2.balances, [
    { playerId: 'p1', balance: 44 },
    { playerId: 'p2', balance: 38 },
    { playerId: 'p3', balance: 27 },
    { playerId: 'p4', balance: -9 },
  ]);
});

test('returns standings ordered by highest balance', () => {
  const accumulator = new BalanceAccumulator(['p1', 'p2', 'p3', 'p4']);
  accumulator.addRound(1, round({ p1: 24, p2: 13, p3: 13, p4: -21 }));
  accumulator.addRound(2, round({ p1: 20, p2: 25, p3: 14, p4: 12 }));

  assert.deepEqual(accumulator.getStandings(), [
    { playerId: 'p1', balance: 44 },
    { playerId: 'p2', balance: 38 },
    { playerId: 'p3', balance: 27 },
    { playerId: 'p4', balance: -9 },
  ]);
});
