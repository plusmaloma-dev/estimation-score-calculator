import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  ScoreOverrideService,
  houseRulesV1ScoringProfile,
  type MvpGameInput,
  type PersistedScoreSheet,
} from '../src/index.js';

function createScoreSheet(): PersistedScoreSheet {
  const gameInput: MvpGameInput = {
    playerOrder: ['A', 'B', 'C', 'D'],
    ruleSet: 'HOUSE_RULES_V1',
    rounds: [
      {
        roundNumber: 1,
        bidValidationMode: 'round-estimates',
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
      },
      {
        roundNumber: 2,
        bidValidationMode: 'round-estimates',
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
      },
    ],
  };
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  assert.equal(gameResult.valid, true, gameResult.errors.join('; '));
  return {
    id: 'sheet-1',
    name: 'Thursday Table',
    status: 'draft',
    createdAtIso: '2026-07-22T10:00:00.000Z',
    updatedAtIso: '2026-07-22T10:05:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    roundCount: 2,
    gameInput,
    gameResult,
  };
}

test('score override preserves calculated results and rebuilds applied totals and rankings', () => {
  const sheet = createScoreSheet();
  const originalRoundScore = sheet.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score;
  assert.notEqual(originalRoundScore, undefined);
  const originalTotal = sheet.gameResult?.leaderboard.find((entry) => entry.playerId === 'A')?.totalScore;
  assert.notEqual(originalTotal, undefined);

  const result = new ScoreOverrideService().apply(sheet, {
    roundNumber: 1,
    overridesByPlayerId: { A: 100 },
    reason: 'Corrected score agreed by the table',
    changedAtIso: '2026-07-22T11:00:00.000Z',
    actorId: 'Rami',
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(sheet.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score, originalRoundScore);
  assert.equal(result.appliedGameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score, 100);
  assert.equal(result.appliedGameResult?.leaderboard.find((entry) => entry.playerId === 'A')?.totalScore, (originalTotal ?? 0) - (originalRoundScore ?? 0) + 100);
  assert.deepEqual(result.scoreOverrides, [{
    id: 'score-override-1',
    roundNumber: 1,
    playerId: 'A',
    calculatedScore: originalRoundScore,
    previousAppliedScore: originalRoundScore,
    newAppliedScore: 100,
    reason: 'Corrected score agreed by the table',
    changedAtIso: '2026-07-22T11:00:00.000Z',
    actorId: 'Rami',
  }]);
});

test('score override requires a reason, integer values, and at least one changed score', () => {
  const sheet = createScoreSheet();
  const original = sheet.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score ?? 0;
  const service = new ScoreOverrideService();

  assert.deepEqual(service.apply(sheet, {
    roundNumber: 1,
    overridesByPlayerId: { A: 10 },
    reason: '   ',
  }).errors, ['Override reason is required.']);

  assert.deepEqual(service.apply(sheet, {
    roundNumber: 1,
    overridesByPlayerId: { A: 10.5 },
    reason: 'Manual correction',
  }).errors, ['Override score for player A must be an integer.']);

  assert.deepEqual(service.apply(sheet, {
    roundNumber: 1,
    overridesByPlayerId: { A: original },
    reason: 'No real change',
  }).errors, ['At least one applied score must change.']);
});

test('restoring the calculated score appends a second audit record without deleting history', () => {
  const sheet = createScoreSheet();
  const original = sheet.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score ?? 0;
  const service = new ScoreOverrideService();
  const changed = service.apply(sheet, {
    roundNumber: 1,
    overridesByPlayerId: { A: 100 },
    reason: 'Correction',
    changedAtIso: '2026-07-22T11:00:00.000Z',
  });
  assert.equal(changed.valid, true, changed.errors.join('; '));

  const restoredSheet: PersistedScoreSheet = {
    ...sheet,
    scoreOverrides: changed.scoreOverrides,
    appliedGameResult: changed.appliedGameResult,
  };
  const restored = service.apply(restoredSheet, {
    roundNumber: 1,
    overridesByPlayerId: { A: original },
    reason: 'Restore calculated score',
    changedAtIso: '2026-07-22T11:10:00.000Z',
  });

  assert.equal(restored.valid, true, restored.errors.join('; '));
  assert.equal(restored.scoreOverrides?.length, 2);
  assert.equal(restored.scoreOverrides?.[1]?.previousAppliedScore, 100);
  assert.equal(restored.scoreOverrides?.[1]?.newAppliedScore, original);
  assert.equal(restored.appliedGameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.score, original);
});
