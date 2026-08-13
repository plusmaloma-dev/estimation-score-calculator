import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserUiShellService,
  InMemoryScoreSheetRepository,
  houseRulesV1ScoringProfile,
} from '../src/index.js';

function createCompletedSheet() {
  const shell = new BrowserUiShellService(new InMemoryScoreSheetRepository());
  const created = shell.createScoreSheet({
    name: 'Override table',
    ruleSet: 'HOUSE_RULES_V1',
    players: [
      { id: 'A', name: 'Ahmed' },
      { id: 'B', name: 'Mona' },
      { id: 'C', name: 'Rami' },
      { id: 'D', name: 'Dina' },
    ],
    nowIso: '2026-07-22T10:00:00.000Z',
  });
  assert.equal(created.valid, true, created.errors.join('; '));
  const id = created.scoreSheet?.id ?? '';

  const round1 = shell.saveRound(id, {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 2 },
    ],
  }, '2026-07-22T10:10:00.000Z');
  assert.equal(round1.valid, true, round1.errors.join('; '));

  const round2 = shell.saveRound(id, {
    roundNumber: 2,
    bidOwnerPlayerId: 'B',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 2 },
      { playerId: 'B', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 2 },
      { playerId: 'B', actualTricks: 5 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 2 },
    ],
  }, '2026-07-22T10:20:00.000Z');
  assert.equal(round2.valid, true, round2.errors.join('; '));

  return { shell, id };
}

test('browser shell applies an audited override and reopens with recalculated totals', () => {
  const { shell, id } = createCompletedSheet();
  const before = shell.openSession(id);
  const calculatedScore = before.scoreSheet?.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score ?? 0;
  const originalTotal = before.leaderboard?.find((entry) => entry.playerId === 'A')?.totalScore ?? 0;

  const result = shell.overrideRoundScores(id, {
    roundNumber: 1,
    overridesByPlayerId: { A: 100 },
    reason: 'Table correction',
    changedAtIso: '2026-07-22T11:00:00.000Z',
    actorId: 'Rami',
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.scoreSheet?.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score, calculatedScore);
  assert.equal(result.scoreSheet?.appliedGameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score, 100);
  assert.equal(result.scoreSheet?.scoreOverrides?.length, 1);

  const reopened = shell.openSession(id);
  assert.equal(reopened.leaderboard?.find((entry) => entry.playerId === 'A')?.totalScore, originalTotal - calculatedScore + 100);
  assert.equal(reopened.scoreSheet?.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score, calculatedScore);
});

test('browser shell restore original appends audit and restores applied leaderboard', () => {
  const { shell, id } = createCompletedSheet();
  const before = shell.openSession(id);
  const calculatedScore = before.scoreSheet?.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score ?? 0;
  const originalTotal = before.leaderboard?.find((entry) => entry.playerId === 'A')?.totalScore ?? 0;

  assert.equal(shell.overrideRoundScores(id, {
    roundNumber: 1,
    overridesByPlayerId: { A: 100 },
    reason: 'Correction',
  }).valid, true);

  const restored = shell.overrideRoundScores(id, {
    roundNumber: 1,
    overridesByPlayerId: { A: calculatedScore },
    reason: 'Restore original',
    changedAtIso: '2026-07-22T11:10:00.000Z',
  });

  assert.equal(restored.valid, true, restored.errors.join('; '));
  assert.equal(restored.scoreSheet?.scoreOverrides?.length, 2);
  assert.equal(restored.scoreSheet?.appliedGameResult?.leaderboard.find((entry) => entry.playerId === 'A')?.totalScore, originalTotal);
});

test('browser shell returns override validation errors without persisting changes', () => {
  const { shell, id } = createCompletedSheet();
  const result = shell.overrideRoundScores(id, {
    roundNumber: 1,
    overridesByPlayerId: { A: 100 },
    reason: '',
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Override reason is required.']);
  assert.equal(shell.openSession(id).scoreSheet?.scoreOverrides, undefined);
});
