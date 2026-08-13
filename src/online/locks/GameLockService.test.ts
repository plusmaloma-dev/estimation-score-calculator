import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../auth/types.js';
import { GameLockService, type GameLockDatabase } from './GameLockService.js';

const testerSession: AuthSessionState = {
  user: { id: 'tester-1', email: 'tester@example.com' },
  membership: { workspaceId: 'workspace-1', workspaceSlug: 'estimation-uat', role: 'tester' },
};

const adminSession: AuthSessionState = {
  user: { id: 'admin-1', email: 'admin@example.com' },
  membership: { workspaceId: 'workspace-1', workspaceSlug: 'estimation-uat', role: 'admin' },
};

type RpcResponse = Awaited<ReturnType<GameLockDatabase['rpc']>>;

function clientWith(response: RpcResponse): GameLockDatabase & { rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async (): Promise<RpcResponse> => response);
  return { rpc };
}

describe('GameLockService', () => {
  it('acquires a 15-minute editing lock for the signed-in user', async () => {
    const client = clientWith({
      data: {
        game_id: 'game-1',
        holder_user_id: 'tester-1',
        expires_at: '2026-07-23T13:15:00.000Z',
      },
      error: null,
    });
    const service = new GameLockService(client, testerSession);

    const result = await service.acquire('game-1');

    expect(result.valid).toBe(true);
    expect(result.value?.holderUserId).toBe('tester-1');
    expect(client.rpc).toHaveBeenCalledWith('acquire_game_lock', {
      p_game_id: 'game-1',
      p_workspace_id: 'workspace-1',
      p_actor_user_id: 'tester-1',
    });
  });

  it('reports a lock conflict instead of claiming edit access', async () => {
    const client = clientWith({ data: null, error: { message: 'Game is being edited by another user.' } });
    const result = await new GameLockService(client, testerSession).acquire('game-1');

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.errors).toEqual(['Game is being edited by another user.']);
  });

  it('heartbeats and releases the current user lock', async () => {
    const client = clientWith({ data: { released: true }, error: null });
    const service = new GameLockService(client, testerSession);

    await service.heartbeat('game-1');
    await service.release('game-1');

    expect(client.rpc).toHaveBeenNthCalledWith(1, 'heartbeat_game_lock', expect.objectContaining({
      p_game_id: 'game-1', p_actor_user_id: 'tester-1',
    }));
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'release_game_lock', expect.objectContaining({
      p_game_id: 'game-1', p_actor_user_id: 'tester-1',
    }));
  });

  it('permits force release only through an Admin session', async () => {
    const testerClient = clientWith({ data: { released: true }, error: null });
    const testerResult = await new GameLockService(testerClient, testerSession).forceRelease('game-1');
    expect(testerResult.valid).toBe(false);
    expect(testerClient.rpc).not.toHaveBeenCalled();

    const adminClient = clientWith({ data: { released: true }, error: null });
    const adminResult = await new GameLockService(adminClient, adminSession).forceRelease('game-1');
    expect(adminResult.valid).toBe(true);
    expect(adminClient.rpc).toHaveBeenCalledWith('force_release_game_lock', expect.objectContaining({
      p_game_id: 'game-1', p_actor_user_id: 'admin-1',
    }));
  });
});
