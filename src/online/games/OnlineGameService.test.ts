import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../auth/types.js';
import { OnlineGameService, type OnlineGameDatabase } from './OnlineGameService.js';

const session: AuthSessionState = {
  user: { id: 'user-1', email: 'tester@example.com' },
  membership: { workspaceId: 'workspace-1', workspaceSlug: 'estimation-uat', role: 'tester' },
};

type RpcResponse = Awaited<ReturnType<OnlineGameDatabase['rpc']>>;

function rpcClient(responses: Readonly<Record<string, readonly RpcResponse[]>>): OnlineGameDatabase & { rpc: ReturnType<typeof vi.fn> } {
  const calls = new Map<string, number>();
  const rpc = vi.fn(async (name: string, _args: Readonly<Record<string, unknown>>): Promise<RpcResponse> => {
    const index = calls.get(name) ?? 0;
    calls.set(name, index + 1);
    return responses[name]?.[index]
      ?? responses[name]?.[0]
      ?? { data: null, error: { message: `No fake response for ${name}` } };
  });
  return { rpc };
}

describe('OnlineGameService', () => {
  it('allows duplicate game names while preserving distinct immutable IDs', async () => {
    const client = rpcClient({
      create_game: [
        { data: { game_id: 'game-1' }, error: null },
        { data: { game_id: 'game-2' }, error: null },
      ],
    });
    const service = new OnlineGameService(client, session);
    const input = {
      name: 'Thursday Table',
      ruleSet: 'HOUSE_RULES_V1' as const,
      players: [
        { id: 'p1', name: 'Ahmed' },
        { id: 'p2', name: 'Mona' },
        { id: 'p3', name: 'Rami' },
        { id: 'p4', name: 'Dina' },
      ],
    };

    const first = await service.createGame(input);
    const second = await service.createGame(input);

    expect(first.value?.gameId).toBe('game-1');
    expect(second.value?.gameId).toBe('game-2');
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'create_game', expect.objectContaining({
      p_workspace_id: 'workspace-1',
      p_name: 'Thursday Table',
    }));
  });

  it('persists a fully calculated round through one transactional RPC', async () => {
    const client = rpcClient({
      save_game_round: [{ data: { game_id: 'game-1', round_number: 18, version: 19 }, error: null }],
    });
    const service = new OnlineGameService(client, session);
    const payload = {
      roundNumber: 18,
      roundInput: { bids: [], actualResults: [] },
      roundResult: { valid: true, playerScores: [] },
      expectedVersion: 18,
    };

    const result = await service.saveRound('game-1', payload);

    expect(result.valid).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('save_game_round', {
      p_game_id: 'game-1',
      p_workspace_id: 'workspace-1',
      p_actor_user_id: 'user-1',
      p_expected_version: 18,
      p_round_payload: payload,
    });
  });

  it('serializes the validated round type at the RPC payload boundary', async () => {
    const client = rpcClient({
      save_game_round: [{ data: { game_id: 'game-1', round_number: 1, version: 2 }, error: null }],
    });
    const service = new OnlineGameService(client, session);

    await service.saveRound('game-1', {
      roundNumber: 1,
      roundInput: { bids: [], actualResults: [] },
      roundResult: {
        valid: true,
        bidValidation: { valid: true, errors: [], totalEstimatedTricks: 14, roundType: 'over' },
        scoreResult: { valid: true, errors: [], playerScores: [] },
      },
      expectedVersion: 1,
    });

    expect(client.rpc).toHaveBeenCalledWith('save_game_round', expect.objectContaining({
      p_round_payload: expect.objectContaining({
        roundResult: expect.objectContaining({ roundType: 'over' }),
      }),
    }));
  });

  it('finalizes and reopens through audited lifecycle RPCs', async () => {
    const client = rpcClient({
      finalize_game: [{ data: { game_id: 'game-1', status: 'finalized' }, error: null }],
      reopen_game: [{ data: { game_id: 'game-1', status: 'draft' }, error: null }],
    });
    const service = new OnlineGameService(client, session);

    const finalized = await service.finalizeGame('game-1', 19);
    const reopened = await service.reopenGame('game-1', 20);

    expect(finalized.value?.status).toBe('finalized');
    expect(reopened.value?.status).toBe('draft');
    expect(client.rpc).toHaveBeenCalledWith('finalize_game', expect.objectContaining({
      p_game_id: 'game-1', p_actor_user_id: 'user-1', p_expected_version: 19,
    }));
    expect(client.rpc).toHaveBeenCalledWith('reopen_game', expect.objectContaining({
      p_game_id: 'game-1', p_actor_user_id: 'user-1', p_expected_version: 20,
    }));
  });

  it('never reports a failed database write as successful', async () => {
    const client = rpcClient({
      finalize_game: [{ data: null, error: { message: 'Game edit lock is required.' } }],
    });
    const service = new OnlineGameService(client, session);

    const result = await service.finalizeGame('game-1', 19);

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.errors).toEqual(['Game edit lock is required.']);
  });
});
