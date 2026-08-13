import { describe, expect, it, vi } from 'vitest';
import { PlayerDirectoryService } from './PlayerDirectoryService.js';

function thenableResult<T>(result: T) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'ilike', 'order', 'insert', 'update']) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.then = (resolve: (value: T) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

describe('PlayerDirectoryService', () => {
  it('lists only active workspace players and maps database fields', async () => {
    const query = thenableResult({
      data: [
        { id: 'p1', display_name: 'Ahmed', archived_at: null },
        { id: 'p2', display_name: 'Mona', archived_at: null },
      ],
      error: null,
    });
    const client = { from: vi.fn(() => query) };
    const service = new PlayerDirectoryService(client, 'workspace-1', 'user-1');

    const players = await service.listActivePlayers('ah');

    expect(client.from).toHaveBeenCalledWith('players');
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'workspace-1');
    expect(query.is).toHaveBeenCalledWith('archived_at', null);
    expect(query.ilike).toHaveBeenCalledWith('display_name', '%ah%');
    expect(players).toEqual([
      { id: 'p1', name: 'Ahmed', archived: false },
      { id: 'p2', name: 'Mona', archived: false },
    ]);
  });

  it('creates a normalized unique player attributed to the signed-in user', async () => {
    const query = thenableResult({
      data: { id: 'p3', display_name: 'Rami El Jammali', archived_at: null },
      error: null,
    });
    const client = { from: vi.fn(() => query) };
    const service = new PlayerDirectoryService(client, 'workspace-1', 'user-1');

    const result = await service.createPlayer('  Rami   El Jammali  ');

    expect(result.valid).toBe(true);
    expect(query.insert).toHaveBeenCalledWith({
      workspace_id: 'workspace-1',
      display_name: 'Rami El Jammali',
      created_by: 'user-1',
      updated_by: 'user-1',
    });
    expect(result.value).toEqual({ id: 'p3', name: 'Rami El Jammali', archived: false });
  });

  it('returns a friendly error for a duplicate normalized player name', async () => {
    const query = thenableResult({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    const service = new PlayerDirectoryService({ from: vi.fn(() => query) }, 'workspace-1', 'user-1');

    const result = await service.createPlayer('AHMED');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['A player with this name already exists.']);
  });
});
