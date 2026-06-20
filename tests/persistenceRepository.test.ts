import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryScoreSheetRepository, type MvpGameInput, type ScoringProfile } from '../src/index.js';

const profile: ScoringProfile = {
  id: 'egyptian-estimation-local',
  name: 'Egyptian Estimation Local Rules',
  type: 'standard',
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  underDashSuccessBonus: 10,
  underDashFailurePenalty: 10,
  highContractThreshold: 8,
  highContractWinBase: 80,
  highContractWinStep: 10,
  highContractLossBasePenalty: -80,
  highContractLossStepPenalty: -10,
  dashSuccessScore: 10,
  dashCallSuccessScore: 35,
};

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 3 },
        { playerId: 'B', bidType: 'normal', tricks: 3 },
        { playerId: 'C', bidType: 'normal', tricks: 3 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 3 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 4 },
        { playerId: 'D', actualTricks: 3 },
      ],
    },
  ],
};

test('repository saves and retrieves score sheets without database coupling', () => {
  const repository = new InMemoryScoreSheetRepository();
  const saved = repository.save({
    name: 'Friday Game',
    gameInput,
    nowIso: '2026-06-21T00:00:00.000Z',
  });

  assert.equal(saved.id, 'score-sheet-1');
  assert.equal(saved.name, 'Friday Game');
  assert.equal(saved.status, 'draft');
  assert.equal(saved.roundCount, 1);
  assert.deepEqual(saved.playerOrder, ['A', 'B', 'C', 'D']);
  assert.equal(repository.getById(saved.id), saved);
});

test('repository updates existing score sheets while preserving creation timestamp', () => {
  const repository = new InMemoryScoreSheetRepository();
  const saved = repository.save({
    id: 'game-1',
    name: 'Friday Game',
    gameInput,
    nowIso: '2026-06-21T00:00:00.000Z',
  });

  const updated = repository.save({
    id: saved.id,
    name: 'Friday Game Final',
    status: 'finalized',
    gameInput,
    nowIso: '2026-06-21T01:00:00.000Z',
  });

  assert.equal(updated.id, 'game-1');
  assert.equal(updated.name, 'Friday Game Final');
  assert.equal(updated.status, 'finalized');
  assert.equal(updated.createdAtIso, '2026-06-21T00:00:00.000Z');
  assert.equal(updated.updatedAtIso, '2026-06-21T01:00:00.000Z');
  assert.equal(repository.list().length, 1);
});

test('repository infers player order when callers omit it', () => {
  const repository = new InMemoryScoreSheetRepository();
  const saved = repository.save({
    name: 'No Declared Player Order',
    gameInput: { rounds: gameInput.rounds },
    nowIso: '2026-06-21T00:00:00.000Z',
  });

  assert.deepEqual(saved.playerOrder, ['A', 'B', 'C', 'D']);
});

test('repository rejects unnamed score sheets', () => {
  const repository = new InMemoryScoreSheetRepository();

  assert.throws(
    () => repository.save({ name: '   ', gameInput, nowIso: '2026-06-21T00:00:00.000Z' }),
    /Score sheet name is required\./,
  );
});

test('repository deletes saved score sheets', () => {
  const repository = new InMemoryScoreSheetRepository();
  const saved = repository.save({
    name: 'Friday Game',
    gameInput,
    nowIso: '2026-06-21T00:00:00.000Z',
  });

  assert.equal(repository.deleteById(saved.id), true);
  assert.equal(repository.getById(saved.id), undefined);
  assert.equal(repository.deleteById(saved.id), false);
});
