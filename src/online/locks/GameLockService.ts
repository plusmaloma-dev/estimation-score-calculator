import type { AuthSessionState } from '../auth/types.js';

export interface GameLockDatabase {
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
}

export interface GameLockState {
  readonly gameId: string;
  readonly holderUserId: string;
  readonly expiresAtIso: string;
}

export interface GameLockResult<T> {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly value?: T;
}

export class GameLockService {
  constructor(
    private readonly client: GameLockDatabase,
    private readonly session: AuthSessionState,
  ) {}

  async acquire(gameId: string): Promise<GameLockResult<GameLockState>> {
    const result = await this.call('acquire_game_lock', gameId);
    if (!result.valid) return result;
    return this.mapLock(result.value);
  }

  async heartbeat(gameId: string): Promise<GameLockResult<GameLockState>> {
    const result = await this.call('heartbeat_game_lock', gameId);
    if (!result.valid) return result;
    return this.mapLock(result.value);
  }

  async release(gameId: string): Promise<GameLockResult<void>> {
    const result = await this.call('release_game_lock', gameId);
    return result.valid
      ? { valid: true, errors: [], value: undefined }
      : { valid: false, errors: result.errors };
  }

  async forceRelease(gameId: string): Promise<GameLockResult<void>> {
    if (this.session.membership.role !== 'admin') {
      return { valid: false, errors: ['Only an Admin can force-release a lock.'] };
    }
    const result = await this.call('force_release_game_lock', gameId);
    return result.valid
      ? { valid: true, errors: [], value: undefined }
      : { valid: false, errors: result.errors };
  }

  private async call(
    rpcName: string,
    gameId: string,
  ): Promise<GameLockResult<unknown>> {
    const result = await this.client.rpc(rpcName, {
      p_game_id: gameId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
    });
    return result.error === null
      ? { valid: true, errors: [], value: result.data }
      : { valid: false, errors: [result.error.message] };
  }

  private mapLock(data: unknown): GameLockResult<GameLockState> {
    const candidate = Array.isArray(data) ? data[0] : data;
    if (typeof candidate !== 'object' || candidate === null) {
      return { valid: false, errors: ['Lock operation returned no lock state.'] };
    }
    const row = candidate as Readonly<Record<string, unknown>>;
    const gameId = row.game_id;
    const holderUserId = row.holder_user_id;
    const expiresAtIso = row.expires_at;
    if (typeof gameId !== 'string' || typeof holderUserId !== 'string' || typeof expiresAtIso !== 'string') {
      return { valid: false, errors: ['Lock operation returned incomplete lock state.'] };
    }
    return {
      valid: true,
      errors: [],
      value: { gameId, holderUserId, expiresAtIso },
    };
  }
}
