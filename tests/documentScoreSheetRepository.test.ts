import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentScoreSheetRepository,
  type PersistedScoreSheet,
  type ScoreSheetDocumentStore,
  type MvpGameInput,
} from '../src/index.js';

class FakeDocumentStore implements ScoreSheetDocumentStore {
  private readonly documents = new Map<string, PersistedScoreSheet>();

  upsert(document: PersistedScoreSheet): void {
    this.documents.set(document.id, document);
  }

  getById(id: string): PersistedScoreSheet | undefined {
    return this.documents.get(id);
  }

  list(): readonly PersistedScoreSheet[] {
    return Array.from(this.documents.values());
  }

  deleteById(id: string): boolean {
    return this.documents.delete(id);
  }
}

const emptyGameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [],
};

test('document repository saves and retrieves score sheets through the document store', () => {
  const repository = new DocumentScoreSheetRepository(new FakeDocumentStore());

  const saved = repository.save({
    name: ' Friday Game ',
    status: 'draft',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });

  assert.equal(saved.id, 'score-sheet-1');
  assert.equal(saved.name, 'Friday Game');
  assert.equal(saved.status, 'draft');
  assert.equal(saved.roundCount, 0);
  assert.deepEqual(saved.playerOrder, ['A', 'B', 'C', 'D']);
  assert.deepEqual(repository.getById(saved.id), saved);
});

test('document repository updates existing score sheets without changing created timestamp', () => {
  const repository = new DocumentScoreSheetRepository(new FakeDocumentStore());
  const saved = repository.save({
    name: 'Draft Game',
    status: 'draft',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });

  const updated = repository.save({
    id: saved.id,
    name: 'Final Game',
    status: 'finalized',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T13:00:00.000Z',
  });

  assert.equal(updated.id, saved.id);
  assert.equal(updated.name, 'Final Game');
  assert.equal(updated.status, 'finalized');
  assert.equal(updated.createdAtIso, '2026-06-21T12:00:00.000Z');
  assert.equal(updated.updatedAtIso, '2026-06-21T13:00:00.000Z');
});

test('document repository lists metadata sorted by update timestamp', () => {
  const repository = new DocumentScoreSheetRepository(new FakeDocumentStore());
  repository.save({
    name: 'Later Game',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T13:00:00.000Z',
  });
  repository.save({
    name: 'Earlier Game',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });

  assert.deepEqual(repository.list().map((scoreSheet) => scoreSheet.name), [
    'Earlier Game',
    'Later Game',
  ]);
});

test('document repository deletes score sheets through the document store', () => {
  const repository = new DocumentScoreSheetRepository(new FakeDocumentStore());
  const saved = repository.save({
    name: 'Delete Game',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });

  assert.equal(repository.deleteById(saved.id), true);
  assert.equal(repository.deleteById(saved.id), false);
  assert.equal(repository.getById(saved.id), undefined);
});

test('document repository allocates the first available score-sheet id', () => {
  const repository = new DocumentScoreSheetRepository(new FakeDocumentStore());
  repository.save({
    id: 'score-sheet-1',
    name: 'Imported Game 1',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });
  repository.save({
    id: 'score-sheet-3',
    name: 'Imported Game 3',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });

  const saved = repository.save({
    name: 'New Game',
    gameInput: emptyGameInput,
    nowIso: '2026-06-21T12:00:00.000Z',
  });

  assert.equal(saved.id, 'score-sheet-2');
});

test('document repository validates stored score-sheet shape before upsert', () => {
  const repository = new DocumentScoreSheetRepository(new FakeDocumentStore());

  assert.throws(
    () => repository.save({ name: '   ', gameInput: emptyGameInput }),
    /Score sheet name is required/,
  );
});
