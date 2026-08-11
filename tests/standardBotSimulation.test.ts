import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BotSimulationService,
  type BotSimulationInput,
} from '../src/index.js';

const input: BotSimulationInput = {
  gameId: 'simulation-game',
  dealId: 'simulation-deal',
  nonce: 'simulation-nonce',
  seedHex: '5a'.repeat(32),
  firstSeat: 1,
  roundNumber: 1,
  bidOrder: [0, 1, 2, 3],
  playOrder: [0, 1, 2, 3],
  bidOwnerSeat: 0,
  firstLeadSeat: 0,
};

test('four Standard bots complete bidding and all fifty-two legal card actions', async () => {
  const result = await new BotSimulationService().simulateRound(input);

  assert.equal(result.finalState.phase, 'scored');
  assert.equal(result.finalState.completedTricks.length, 13);
  assert.deepEqual(result.finalState.hands.map((hand) => hand.cards.length), [0, 0, 0, 0]);
  assert.equal(result.version, 59);
  assert.equal(result.records.filter((record) => record.command.type === 'SUBMIT_AUCTION_ACTION').length, 4);
  assert.equal(result.records.filter((record) => record.command.type === 'SUBMIT_BID').length, 3);
  assert.equal(result.records.filter((record) => record.command.type === 'PLAY_CARD').length, 52);
  assert.equal(result.rejectedCommandCount, 0);
  assert.equal(result.replayVerified, true);
});

test('fixed seed produces deterministic bot bids, play, scores, and metrics', async () => {
  const service = new BotSimulationService();

  const first = await service.simulateRound(input);
  const second = await service.simulateRound(input);

  assert.deepEqual(first.finalState.bids, second.finalState.bids);
  assert.deepEqual(first.finalState.completedTricks, second.finalState.completedTricks);
  assert.deepEqual(first.finalState.scoreResult, second.finalState.scoreResult);
  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(first.reasonCounts, second.reasonCounts);
});

test('simulation reports bounded exact-estimate metrics and one audit per action', async () => {
  const result = await new BotSimulationService().simulateRound(input);

  assert.ok(result.metrics.exactMatchRate >= 0 && result.metrics.exactMatchRate <= 1);
  assert.ok(result.metrics.meanAbsoluteEstimateError >= 0);
  assert.ok(Number.isFinite(result.metrics.averageScore));
  assert.equal(result.decisionAudits.length, 59);
  assert.equal(
    Object.values(result.reasonCounts).reduce((sum, count) => sum + count, 0),
    59,
  );
});

test('altering the seed changes at least the deal or resulting trick history', async () => {
  const service = new BotSimulationService();
  const first = await service.simulateRound(input);
  const second = await service.simulateRound({ ...input, seedHex: '5b'.repeat(32) });

  assert.notDeepEqual(first.finalState.completedTricks, second.finalState.completedTricks);
});
