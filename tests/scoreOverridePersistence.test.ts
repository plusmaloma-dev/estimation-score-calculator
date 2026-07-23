import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentScoreSheetRepository,
  EstimationMvpService,
  InMemoryScoreSheetRepository,
  LocalStorageScoreSheetRepository,
  type PersistedScoreSheet,
  type ScoreOverrideAuditRecord,
  type ScoreSheetDocumentStore,
  type ScoreSheetStorageLike,
} from '../src/index.js';

const gameInput = {
  rounds: [],
  playerOrder: ['A', 'B', 'C', 'D'],
  ruleSet: 'HOUSE_RULES_V1' as const,
};
const gameResult = new EstimationMvpService().calculateGame(gameInput);
const override: ScoreOverrideAuditRecord = {
  id: 'score-override-1',
  roundNumber: 1,
  playerId: 'A',
  calculatedScore: 15,
  previousAppliedScore: 15,
  newAppliedScore: 20,
  reason: 'Correction',
  changedAtIso: '2026-07-22T11:00:00.000Z',
  actorId: 'Rami',
};

class MemoryStorage implements ScoreSheetStorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class MemoryDocumentStore implements ScoreSheetDocumentStore {
  readonly values = new Map<string, PersistedScoreSheet>();
  upsert(document: PersistedScoreSheet): void { this.values.set(document.id, document); }
  getById(id: string): PersistedScoreSheet | undefined { return this.values.get(id); }
  list(): readonly PersistedScoreSheet[] { return [...this.values.values()]; }
  deleteById(id: string): boolean { return this.values.delete(id); }
}

const saveInput = {
  name: 'Override persistence',
  gameInput,
  gameResult,
  scoreOverrides: [override],
  appliedGameResult: gameResult,
  nowIso: '2026-07-22T12:00:00.000Z',
};

test('in-memory repository preserves score override audits and applied results', () => {
  const repository = new InMemoryScoreSheetRepository();
  const saved = repository.save(saveInput);
  const reopened = repository.getById(saved.id);

  assert.deepEqual(reopened?.scoreOverrides, [override]);
  assert.deepEqual(reopened?.appliedGameResult, gameResult);
});

test('local-storage repository preserves score override audits across instances', () => {
  const storage = new MemoryStorage();
  const first = new LocalStorageScoreSheetRepository(storage);
  const saved = first.save(saveInput);
  const reopened = new LocalStorageScoreSheetRepository(storage).getById(saved.id);

  assert.deepEqual(reopened?.scoreOverrides, [override]);
  assert.deepEqual(reopened?.appliedGameResult, gameResult);
});

test('document repository preserves score override audits and applied results', () => {
  const store = new MemoryDocumentStore();
  const repository = new DocumentScoreSheetRepository(store);
  const saved = repository.save(saveInput);
  const reopened = repository.getById(saved.id);

  assert.deepEqual(reopened?.scoreOverrides, [override]);
  assert.deepEqual(reopened?.appliedGameResult, gameResult);
});

test('legacy local-storage sheets without override fields still open', () => {
  const storage = new MemoryStorage();
  storage.setItem('egyptian-estimation:score-sheets:v1', JSON.stringify({
    version: 1,
    nextId: 2,
    scoreSheets: [{
      id: 'score-sheet-1',
      name: 'Legacy',
      status: 'draft',
      createdAtIso: '2026-07-22T10:00:00.000Z',
      updatedAtIso: '2026-07-22T10:00:00.000Z',
      playerOrder: ['A', 'B', 'C', 'D'],
      roundCount: 0,
      gameInput,
      gameResult,
    }],
  }));

  const reopened = new LocalStorageScoreSheetRepository(storage).getById('score-sheet-1');
  assert.equal(reopened?.name, 'Legacy');
  assert.equal(reopened?.scoreOverrides, undefined);
  assert.equal(reopened?.appliedGameResult, undefined);
});
