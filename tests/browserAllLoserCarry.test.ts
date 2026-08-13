import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserUiShellService,
  InMemoryScoreSheetRepository,
  houseRulesV1ScoringProfile,
  type UiRoundEntryInput,
} from '../src/index.js';

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Bassem' },
  { id: 'C', name: 'Cairo' },
  { id: 'D', name: 'Dina' },
] as const;

const allLoserRound: UiRoundEntryInput = {
  roundNumber: 1,
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
    { playerId: 'B', bidType: 'normal', tricks: 4 },
    { playerId: 'C', bidType: 'normal', tricks: 2 },
    { playerId: 'D', bidType: 'normal', tricks: 1 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 4 },
    { playerId: 'B', actualTricks: 3 },
    { playerId: 'C', actualTricks: 3 },
    { playerId: 'D', actualTricks: 3 },
  ],
};

const scoredRound: UiRoundEntryInput = {
  roundNumber: 2,
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
    { playerId: 'B', bidType: 'normal', tricks: 4 },
    { playerId: 'C', bidType: 'normal', tricks: 2 },
    { playerId: 'D', bidType: 'normal', tricks: 0 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 5 },
    { playerId: 'B', actualTricks: 4 },
    { playerId: 'C', actualTricks: 2 },
    { playerId: 'D', actualTricks: 2 },
  ],
};

test('browser shell preserves a pending all-loser carry across reopen and consumes it on the next save', () => {
  const repository = new InMemoryScoreSheetRepository();
  const shell = new BrowserUiShellService(repository);
  const created = shell.createScoreSheet({ name: 'Carry Game', players });
  const id = created.scoreSheet?.id ?? '';

  const skipped = shell.saveRound(id, allLoserRound);
  assert.equal(skipped.valid, true, skipped.errors.join('; '));
  assert.deepEqual(skipped.gameResult?.leaderboard.map((entry) => entry.totalScore), [0, 0, 0, 0]);

  const reopened = new BrowserUiShellService(repository).openSession(id);
  assert.equal(reopened.valid, true, reopened.errors.join('; '));
  assert.equal(reopened.scoreSheet?.gameResult?.rounds[0]?.isAllLoserRound, true);
  assert.deepEqual(reopened.leaderboard?.map((entry) => entry.totalScore), [0, 0, 0, 0]);

  const baseShell = new BrowserUiShellService(new InMemoryScoreSheetRepository());
  const baseCreated = baseShell.createScoreSheet({ name: 'Base Game', players });
  const base = baseShell.saveRound(baseCreated.scoreSheet?.id ?? '', { ...scoredRound, roundNumber: 1 });
  const baseTotals = new Map(base.gameResult?.leaderboard.map((entry) => [entry.playerId, entry.totalScore]));

  const consumed = new BrowserUiShellService(repository).saveRound(id, scoredRound);
  assert.equal(consumed.valid, true, consumed.errors.join('; '));
  assert.equal(consumed.gameResult?.rounds[1]?.carriedAllLoserMultiplier, 2);
  assert.deepEqual(
    consumed.gameResult?.leaderboard.map((entry) => [entry.playerId, entry.totalScore]),
    players.map((player) => [player.id, (baseTotals.get(player.id) ?? 0) * 2]),
  );
});

test('manual score overrides do not redefine an all-loser round or consume its carry', () => {
  const repository = new InMemoryScoreSheetRepository();
  const shell = new BrowserUiShellService(repository);
  const created = shell.createScoreSheet({ name: 'Override Carry Game', players });
  const id = created.scoreSheet?.id ?? '';

  shell.saveRound(id, allLoserRound);
  const overridden = shell.overrideRoundScores(id, {
    roundNumber: 1,
    overridesByPlayerId: { A: 20 },
    reason: 'Correction for testing',
    actorId: 'tester',
  });
  assert.equal(overridden.valid, true, overridden.errors.join('; '));
  assert.equal(overridden.gameResult?.rounds[0]?.isAllLoserRound, true);

  const consumed = shell.saveRound(id, scoredRound);
  assert.equal(consumed.valid, true, consumed.errors.join('; '));
  assert.equal(consumed.gameResult?.rounds[1]?.carriedAllLoserMultiplier, 2);
  assert.equal(consumed.gameResult?.rounds[1]?.carryConsumed, true);
});
