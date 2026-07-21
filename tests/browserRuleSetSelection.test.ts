import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserUiShellService,
  FEDERATION_2026,
  HOUSE_RULES_V1,
  InMemoryScoreSheetRepository,
  houseRulesV1ScoringProfile,
} from '../src/index.js';

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Bassem' },
  { id: 'C', name: 'Cairo' },
  { id: 'D', name: 'Dina' },
] as const;

function createUi(): BrowserUiShellService {
  return new BrowserUiShellService(new InMemoryScoreSheetRepository());
}

test('browser score-sheet creation stores an explicit Federation 2026 selection', () => {
  const created = createUi().createScoreSheet({
    name: 'Federation Game',
    players,
    ruleSet: FEDERATION_2026,
    nowIso: '2026-07-21T10:00:00.000Z',
  });

  assert.equal(created.valid, true, created.errors.join('; '));
  assert.equal(created.scoreSheet?.gameInput.ruleSet, FEDERATION_2026);
  assert.equal(created.scoreSheet?.gameResult?.ruleSet, FEDERATION_2026);
});

test('browser score-sheet creation defaults missing selection to House Rules V1', () => {
  const created = createUi().createScoreSheet({
    name: 'House Game',
    players,
    nowIso: '2026-07-21T10:00:00.000Z',
  });

  assert.equal(created.valid, true, created.errors.join('; '));
  assert.equal(created.scoreSheet?.gameInput.ruleSet, HOUSE_RULES_V1);
  assert.equal(created.scoreSheet?.gameResult?.ruleSet, HOUSE_RULES_V1);
});

test('saving a round preserves the score sheet rule set and uses it for scoring', () => {
  const ui = createUi();
  const created = ui.createScoreSheet({
    name: 'Locked Federation Game',
    players,
    ruleSet: FEDERATION_2026,
    nowIso: '2026-07-21T10:00:00.000Z',
  });
  const scoreSheetId = created.scoreSheet?.id;
  assert.ok(scoreSheetId);

  const saved = ui.saveRound(
    scoreSheetId,
    {
      roundNumber: 1,
      bidOwnerPlayerId: 'A',
      profile: houseRulesV1ScoringProfile,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 8 },
        { playerId: 'B', bidType: 'normal', tricks: 2 },
        { playerId: 'C', bidType: 'normal', tricks: 2 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 8 },
        { playerId: 'B', actualTricks: 2 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 2 },
      ],
    },
    '2026-07-21T10:05:00.000Z',
  );

  assert.equal(saved.valid, true, saved.errors.join('; '));
  assert.equal(saved.scoreSheet?.gameInput.ruleSet, FEDERATION_2026);
  assert.equal(saved.gameResult?.ruleSet, FEDERATION_2026);
  const ownerScore = saved.gameResult?.rounds[0]?.scoreResult?.playerScores.find((score) => score.playerId === 'A');
  assert.equal(ownerScore?.score, 41);
});
