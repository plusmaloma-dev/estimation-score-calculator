import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocalStorageScoreSheetRepository,
  type MvpGameInput,
  type ScoreSheetStorageLike,
} from '../src/index.js';

class FakeStorage implements ScoreSheetStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile: {
        id: 'standard-test',
        name: 'Standard Test',
        type: 'standard',
        winnerBaseBonus: 10,
      },
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 2 },
        { playerId: 'D', actualTricks: 4 },
      ],
    },
  ],
};

test('LocalStorageScoreSheetRepository saves, retrieves, lists, updates, and deletes score sheets', () => {
  const storage = new FakeStorage();
  const repository = new LocalStorageScoreSheetRepository(storage);

  const saved = repository.save({
    name: 'Friday Game',
    status: 'draft',
    gameInput,
    nowIso: '2026-06-21T09:00:00.000Z',
  });

  assert.equal(saved.id, 'score-sheet-1');
  assert.equal(saved.name, 'Friday Game');
  assert.equal(saved.status, 'draft');
  assert.deepEqual(saved.playerOrder, ['A', 'B', 'C', 'D']);
  assert.equal(saved.roundCount, 1);
  assert.deepEqual(repository.getById(saved.id), saved);

  assert.deepEqual(repository.list(), [
    {
      id: 'score-sheet-1',
      name: 'Friday Game',
      status: 'draft',
      createdAtIso: '2026-06-21T09:00:00.000Z',
      updatedAtIso: '2026-06-21T09:00:00.000Z',
      playerOrder: ['A', 'B', 'C', 'D'],
      roundCount: 1,
    },
  ]);

  const updated = repository.save({
    id: saved.id,
    name: 'Friday Game Final',
    status: 'finalized',
    gameInput: { ...gameInput, rounds: [] },
    nowIso: '2026-06-21T10:00:00.000Z',
  });

  assert.equal(updated.createdAtIso, '2026-06-21T09:00:00.000Z');
  assert.equal(updated.updatedAtIso, '2026-06-21T10:00:00.000Z');
  assert.equal(updated.name, 'Friday Game Final');
  assert.equal(updated.status, 'finalized');
  assert.equal(updated.roundCount, 0);
  assert.equal(repository.deleteById(saved.id), true);
  assert.equal(repository.deleteById(saved.id), false);
  assert.deepEqual(repository.list(), []);
});

test('LocalStorageScoreSheetRepository shares state across repository instances', () => {
  const storage = new FakeStorage();
  const firstRepository = new LocalStorageScoreSheetRepository(storage);
  const saved = firstRepository.save({ name: 'Shared Game', gameInput });

  const secondRepository = new LocalStorageScoreSheetRepository(storage);

  assert.equal(secondRepository.getById(saved.id)?.name, 'Shared Game');
  assert.equal(secondRepository.list().length, 1);
});

test('LocalStorageScoreSheetRepository handles missing and corrupt stored data safely', () => {
  const storage = new FakeStorage();
  const repository = new LocalStorageScoreSheetRepository(storage);

  assert.equal(repository.getById('missing'), undefined);
  assert.deepEqual(repository.list(), []);

  storage.setItem('egyptian-estimation:score-sheets:v1', 'not-json');

  assert.equal(repository.getById('missing'), undefined);
  assert.deepEqual(repository.list(), []);

  const saved = repository.save({ name: 'Recovered Game', gameInput });
  assert.equal(saved.id, 'score-sheet-1');
  assert.equal(repository.list().length, 1);
});

test('LocalStorageScoreSheetRepository validates required score sheet fields', () => {
  const repository = new LocalStorageScoreSheetRepository(new FakeStorage());

  assert.throws(
    () => repository.save({ id: '   ', name: 'Invalid Game', gameInput }),
    /Score sheet id is required\./,
  );

  assert.throws(
    () => repository.save({ name: '   ', gameInput }),
    /Score sheet name is required\./,
  );
});
