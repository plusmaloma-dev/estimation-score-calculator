import assert from 'node:assert/strict';
import test from 'node:test';
import { BalanceAccumulator } from '../src/scoring/BalanceAccumulator.js';
import { MarkdownScoreTableRenderer } from '../src/scoring/MarkdownScoreTableRenderer.js';
import type { RoundScoreResult } from '../src/scoring/types.js';

function round(scores: Record<string, number>, bids: Record<string, number>, actuals: Record<string, number>): RoundScoreResult {
  return {
    valid: true,
    errors: [],
    playerScores: Object.keys(scores).map((playerId) => ({
      playerId,
      bidTricks: bids[playerId] ?? 0,
      actualTricks: actuals[playerId] ?? 0,
      delta: Math.abs((actuals[playerId] ?? 0) - (bids[playerId] ?? 0)),
      didMatchBid: (actuals[playerId] ?? 0) === (bids[playerId] ?? 0),
      role: playerId === 'p1' ? 'bid-owner' : 'other-player',
      riskType: 'none',
      isRiskTaker: false,
      riskModifier: 0,
      isHighContract: false,
      isOnlyWinner: false,
      isOnlyLoser: false,
      status: scores[playerId] >= 0 ? 'success' : 'failed',
      score: scores[playerId],
      notes: [],
    })),
  };
}

test('renders score table with running balances from accumulator snapshots', () => {
  const accumulator = new BalanceAccumulator(['p1', 'p2', 'p3', 'p4']);
  const renderer = new MarkdownScoreTableRenderer();

  const result1 = round(
    { p1: 24, p2: 13, p3: 13, p4: -21 },
    { p1: 4, p2: 3, p3: 3, p4: 4 },
    { p1: 4, p2: 3, p3: 3, p4: 3 },
  );
  const balances1 = accumulator.addRound(1, result1).balances;

  const result2 = round(
    { p1: 20, p2: 25, p3: 14, p4: 12 },
    { p1: 0, p2: 5, p3: 4, p4: 2 },
    { p1: 0, p2: 5, p3: 4, p4: 2 },
  );
  const balances2 = accumulator.addRound(2, result2).balances;

  const table = renderer.render(
    [
      { roundNumber: 1, roundLabel: 'Over +1', result: result1, balances: balances1 },
      { roundNumber: 2, roundLabel: 'Under -2', result: result2, balances: balances2 },
    ],
    ['p1', 'p2', 'p3', 'p4'],
  );

  assert.equal(
    table,
    [
      '| Rd | Type | p1 | p2 | p3 | p4 |',
      '| ---: | --- | --- | --- | --- | --- |',
      '| 1 | Over +1 | BO 4/4 = +24 (+24) | 3/3 = +13 (+13) | 3/3 = +13 (+13) | 4/3 = -21 (-21) |',
      '| 2 | Under -2 | BO 0/0 = +20 (+44) | 5/5 = +25 (+38) | 4/4 = +14 (+27) | 2/2 = +12 (-9) |',
    ].join('\n'),
  );
});
