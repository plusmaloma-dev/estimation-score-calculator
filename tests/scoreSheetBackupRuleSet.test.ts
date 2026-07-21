import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEDERATION_2026,
  HOUSE_RULES_V1,
  SCORE_SHEET_BACKUP_FORMAT,
  SCORE_SHEET_BACKUP_VERSION,
  ScoreSheetBackupService,
  type PersistedScoreSheet,
} from '../src/index.js';

function federationScoreSheet(): PersistedScoreSheet {
  return {
    id: 'score-sheet-1',
    name: 'Federation Game',
    status: 'draft',
    createdAtIso: '2026-07-21T10:00:00.000Z',
    updatedAtIso: '2026-07-21T10:05:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    roundCount: 0,
    gameInput: {
      ruleSet: FEDERATION_2026,
      playerOrder: ['A', 'B', 'C', 'D'],
      rounds: [],
    },
    gameResult: {
      valid: true,
      errors: [],
      ruleSet: FEDERATION_2026,
      rounds: [],
      leaderboard: [],
    },
  };
}

test('backup export and import preserve Federation 2026 selection', () => {
  const service = new ScoreSheetBackupService();
  const exported = service.exportScoreSheets({
    scoreSheets: [federationScoreSheet()],
    exportedAtIso: '2026-07-21T11:00:00.000Z',
  });
  const imported = service.importScoreSheets(exported);

  assert.equal(imported.valid, true, imported.errors.join('; '));
  assert.equal(imported.document?.scoreSheets[0]?.gameInput.ruleSet, FEDERATION_2026);
  assert.equal(imported.document?.scoreSheets[0]?.gameResult?.ruleSet, FEDERATION_2026);
});

test('legacy backup import normalizes missing game rule set to House Rules V1', () => {
  const service = new ScoreSheetBackupService();
  const legacyDocument = {
    format: SCORE_SHEET_BACKUP_FORMAT,
    version: SCORE_SHEET_BACKUP_VERSION,
    metadata: { exportedAtIso: '2026-07-21T11:00:00.000Z' },
    scoreSheets: [
      {
        id: 'legacy-1',
        name: 'Legacy Game',
        status: 'draft',
        createdAtIso: '2026-07-20T10:00:00.000Z',
        updatedAtIso: '2026-07-20T10:00:00.000Z',
        playerOrder: ['A', 'B', 'C', 'D'],
        roundCount: 0,
        gameInput: {
          playerOrder: ['A', 'B', 'C', 'D'],
          rounds: [],
        },
      },
    ],
  };

  const imported = service.importScoreSheets(legacyDocument);

  assert.equal(imported.valid, true, imported.errors.join('; '));
  assert.equal(imported.document?.scoreSheets[0]?.gameInput.ruleSet, HOUSE_RULES_V1);
});

test('backup import rejects unsupported game rule sets', () => {
  const service = new ScoreSheetBackupService();
  const invalidDocument = JSON.parse(JSON.stringify({
    format: SCORE_SHEET_BACKUP_FORMAT,
    version: SCORE_SHEET_BACKUP_VERSION,
    metadata: { exportedAtIso: '2026-07-21T11:00:00.000Z' },
    scoreSheets: [federationScoreSheet()],
  })) as Record<string, unknown>;
  const scoreSheets = invalidDocument.scoreSheets as Array<Record<string, unknown>>;
  const gameInput = scoreSheets[0]?.gameInput as Record<string, unknown>;
  gameInput.ruleSet = 'UNSUPPORTED_RULES';

  const imported = service.importScoreSheets(invalidDocument);

  assert.equal(imported.valid, false);
  assert.ok(imported.errors.some((error) => error.includes('gameInput.ruleSet')));
});
