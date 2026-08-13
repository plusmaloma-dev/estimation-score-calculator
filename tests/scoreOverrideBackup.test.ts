import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  ScoreSheetBackupService,
  type PersistedScoreSheet,
  type ScoreOverrideAuditRecord,
} from '../src/index.js';

const gameInput = {
  rounds: [],
  playerOrder: ['A', 'B', 'C', 'D'],
  ruleSet: 'HOUSE_RULES_V1' as const,
};
const calculatedGameResult = new EstimationMvpService().calculateGame(gameInput);
const override: ScoreOverrideAuditRecord = {
  id: 'score-override-1',
  roundNumber: 1,
  playerId: 'A',
  calculatedScore: 14,
  previousAppliedScore: 14,
  newAppliedScore: 20,
  reason: 'Correction agreed by the table',
  changedAtIso: '2026-07-22T11:00:00.000Z',
  actorId: 'Rami',
};
const scoreSheet: PersistedScoreSheet = {
  id: 'sheet-1',
  name: 'Override backup',
  status: 'draft',
  createdAtIso: '2026-07-22T10:00:00.000Z',
  updatedAtIso: '2026-07-22T11:00:00.000Z',
  playerOrder: ['A', 'B', 'C', 'D'],
  roundCount: 0,
  gameInput,
  gameResult: calculatedGameResult,
  scoreOverrides: [override],
  appliedGameResult: calculatedGameResult,
};

test('backup export includes score override audit records and applied results', () => {
  const document = new ScoreSheetBackupService().exportScoreSheets({
    scoreSheets: [scoreSheet],
    exportedAtIso: '2026-07-22T12:00:00.000Z',
    source: 'test',
  });

  assert.deepEqual(document.scoreSheets[0]?.scoreOverrides, [override]);
  assert.deepEqual(document.scoreSheets[0]?.appliedGameResult, calculatedGameResult);
});

test('backup import round-trip preserves score override audit records and applied results', () => {
  const service = new ScoreSheetBackupService();
  const exported = service.exportScoreSheets({
    scoreSheets: [scoreSheet],
    exportedAtIso: '2026-07-22T12:00:00.000Z',
  });
  const imported = service.importScoreSheets(JSON.parse(JSON.stringify(exported)));

  assert.equal(imported.valid, true, imported.errors.join('; '));
  assert.deepEqual(imported.document?.scoreSheets[0]?.scoreOverrides, [override]);
  assert.deepEqual(imported.document?.scoreSheets[0]?.appliedGameResult, calculatedGameResult);
});
