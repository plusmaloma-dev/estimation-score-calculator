import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LifecycleBrowserUiShellService,
  InMemoryScoreSheetRepository,
  type ScoringProfile,
  type UiRoundEntryInput,
} from '../src/index.js';

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

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Bassem' },
  { id: 'C', name: 'Cairo' },
  { id: 'D', name: 'Dina' },
] as const;

function round(roundNumber: number): UiRoundEntryInput {
  return {
    roundNumber,
    profile,
    bidOwnerPlayerId: 'A',
    riskPlayerId: 'D',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 4 },
      { playerId: 'C', bidType: 'normal', tricks: 4 },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 2 },
    ],
  };
}

function createGameWithRounds(roundCount: number) {
  const shell = new LifecycleBrowserUiShellService(new InMemoryScoreSheetRepository());
  const created = shell.createScoreSheet({
    name: 'Lifecycle Game',
    players,
    nowIso: '2026-07-23T10:00:00.000Z',
  });
  assert.equal(created.valid, true, created.errors.join('; '));
  const scoreSheetId = created.scoreSheet?.id ?? '';

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const saved = shell.saveRound(
      scoreSheetId,
      round(roundNumber),
      `2026-07-23T10:${String(roundNumber).padStart(2, '0')}:00.000Z`,
    );
    assert.equal(saved.valid, true, saved.errors.join('; '));
  }

  return { shell, scoreSheetId };
}

test('game cannot be finalized before 18 saved rounds', () => {
  const { shell, scoreSheetId } = createGameWithRounds(17);

  const result = shell.finalizeGame(scoreSheetId, 'tester-1', '2026-07-23T11:00:00.000Z');

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /18 saved rounds/i);
  assert.equal(shell.openSession(scoreSheetId).scoreSheet?.status, 'draft');
});

test('finalized game blocks score writes and can be reopened without losing history', () => {
  const { shell, scoreSheetId } = createGameWithRounds(18);

  const finalized = shell.finalizeGame(scoreSheetId, 'tester-1', '2026-07-23T11:00:00.000Z');
  assert.equal(finalized.valid, true, finalized.errors.join('; '));
  assert.equal(finalized.scoreSheet?.status, 'finalized');
  assert.equal(finalized.scoreSheet?.finalizedBy, 'tester-1');
  assert.equal(finalized.scoreSheet?.finalizedAtIso, '2026-07-23T11:00:00.000Z');
  assert.deepEqual(finalized.scoreSheet?.lifecycleAudit, [{
    action: 'game.finalized',
    actorId: 'tester-1',
    occurredAtIso: '2026-07-23T11:00:00.000Z',
  }]);

  const blockedRound = shell.saveRound(scoreSheetId, round(19), '2026-07-23T11:05:00.000Z');
  assert.equal(blockedRound.valid, false);
  assert.match(blockedRound.errors.join(' '), /completed game/i);

  const blockedOverride = shell.overrideRoundScores(scoreSheetId, {
    roundNumber: 1,
    overridesByPlayerId: { A: 99 },
    reason: 'Must be blocked while completed.',
    actorId: 'tester-1',
    changedAtIso: '2026-07-23T11:06:00.000Z',
  });
  assert.equal(blockedOverride.valid, false);
  assert.match(blockedOverride.errors.join(' '), /completed game/i);

  const reopened = shell.reopenGame(scoreSheetId, 'admin-1', '2026-07-23T11:10:00.000Z');
  assert.equal(reopened.valid, true, reopened.errors.join('; '));
  assert.equal(reopened.scoreSheet?.status, 'draft');
  assert.equal(reopened.scoreSheet?.finalizedBy, undefined);
  assert.equal(reopened.scoreSheet?.finalizedAtIso, undefined);
  assert.equal(reopened.scoreSheet?.roundCount, 18);
  assert.equal(reopened.scoreSheet?.gameInput.rounds.length, 18);
  assert.deepEqual(reopened.scoreSheet?.lifecycleAudit, [
    {
      action: 'game.finalized',
      actorId: 'tester-1',
      occurredAtIso: '2026-07-23T11:00:00.000Z',
    },
    {
      action: 'game.reopened',
      actorId: 'admin-1',
      occurredAtIso: '2026-07-23T11:10:00.000Z',
    },
  ]);

  const savedRound19 = shell.saveRound(scoreSheetId, round(19), '2026-07-23T11:15:00.000Z');
  assert.equal(savedRound19.valid, true, savedRound19.errors.join('; '));
  assert.equal(savedRound19.scoreSheet?.roundCount, 19);
});
