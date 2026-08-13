import type { AuthSessionState } from '../auth/types.js';
import type {
  OnlineCreatedGame,
  OnlineCreateGameInput,
  OnlineGameResult,
  OnlineLifecycleState,
  OnlineSavedRound,
  OnlineSaveRoundPayload,
} from './types.js';

export interface OnlineGameDatabase {
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
}

export class OnlineGameService {
  constructor(
    private readonly client: OnlineGameDatabase,
    private readonly session: AuthSessionState,
  ) {}

  async createGame(input: OnlineCreateGameInput): Promise<OnlineGameResult<OnlineCreatedGame>> {
    const name = input.name.trim();
    if (name.length === 0) return this.failure('Game name is required.');
    if (input.players.length !== 4 || new Set(input.players.map((player) => player.id)).size !== 4) {
      return this.failure('Exactly four unique players are required.');
    }

    const result = await this.client.rpc('create_game', {
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_name: name,
      p_rule_set: input.ruleSet,
      p_players: input.players.map((player, index) => ({
        player_id: player.id,
        player_name_snapshot: player.name.trim(),
        seat_number: index + 1,
      })),
    });
    if (result.error !== null) return this.failure(result.error.message);
    const row = this.firstRow(result.data);
    const gameId = this.readString(row, 'game_id');
    return gameId === undefined
      ? this.failure('Game creation returned no game ID.')
      : { valid: true, errors: [], value: { gameId } };
  }

  async saveRound(gameId: string, payload: OnlineSaveRoundPayload): Promise<OnlineGameResult<OnlineSavedRound>> {
    const rpcPayload = this.withValidatedRoundType(payload);
    const result = await this.client.rpc('save_game_round', {
      p_game_id: gameId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_expected_version: payload.expectedVersion,
      p_round_payload: rpcPayload,
    });
    if (result.error !== null) return this.failure(result.error.message);
    const row = this.firstRow(result.data);
    const savedGameId = this.readString(row, 'game_id');
    const roundNumber = this.readNumber(row, 'round_number');
    const version = this.readNumber(row, 'version');
    if (savedGameId === undefined || roundNumber === undefined || version === undefined) {
      return this.failure('Round save returned incomplete data.');
    }
    return { valid: true, errors: [], value: { gameId: savedGameId, roundNumber, version } };
  }

  private withValidatedRoundType(payload: OnlineSaveRoundPayload): OnlineSaveRoundPayload {
    if (typeof payload.roundResult !== 'object' || payload.roundResult === null || Array.isArray(payload.roundResult)) {
      return payload;
    }
    const roundResult = payload.roundResult as Readonly<Record<string, unknown>>;
    const bidValidation = roundResult.bidValidation;
    if (typeof bidValidation !== 'object' || bidValidation === null || Array.isArray(bidValidation)) {
      return payload;
    }
    const roundType = (bidValidation as Readonly<Record<string, unknown>>).roundType;
    if (roundType !== 'over' && roundType !== 'under') return payload;
    return {
      ...payload,
      roundResult: { ...roundResult, roundType },
    };
  }

  async finalizeGame(gameId: string, expectedVersion: number): Promise<OnlineGameResult<OnlineLifecycleState>> {
    return this.lifecycle('finalize_game', gameId, expectedVersion);
  }

  async reopenGame(gameId: string, expectedVersion: number): Promise<OnlineGameResult<OnlineLifecycleState>> {
    return this.lifecycle('reopen_game', gameId, expectedVersion);
  }

  async overrideRoundScores(
    gameId: string,
    expectedVersion: number,
    overridePayload: unknown,
  ): Promise<OnlineGameResult<{ readonly gameId: string; readonly version: number }>> {
    const result = await this.client.rpc('override_round_scores', {
      p_game_id: gameId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_expected_version: expectedVersion,
      p_override_payload: overridePayload,
    });
    if (result.error !== null) return this.failure(result.error.message);
    const row = this.firstRow(result.data);
    const savedGameId = this.readString(row, 'game_id');
    const version = this.readNumber(row, 'version');
    return savedGameId === undefined || version === undefined
      ? this.failure('Score override returned incomplete data.')
      : { valid: true, errors: [], value: { gameId: savedGameId, version } };
  }

  private async lifecycle(
    rpcName: 'finalize_game' | 'reopen_game',
    gameId: string,
    expectedVersion: number,
  ): Promise<OnlineGameResult<OnlineLifecycleState>> {
    const result = await this.client.rpc(rpcName, {
      p_game_id: gameId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_expected_version: expectedVersion,
    });
    if (result.error !== null) return this.failure(result.error.message);
    const row = this.firstRow(result.data);
    const savedGameId = this.readString(row, 'game_id');
    const status = this.readString(row, 'status');
    const version = this.readNumber(row, 'version');
    if (savedGameId === undefined || (status !== 'draft' && status !== 'finalized')) {
      return this.failure('Lifecycle change returned incomplete data.');
    }
    return {
      valid: true,
      errors: [],
      value: { gameId: savedGameId, status, ...(version === undefined ? {} : { version }) },
    };
  }

  private firstRow(data: unknown): Readonly<Record<string, unknown>> | undefined {
    const value = Array.isArray(data) ? data[0] : data;
    return typeof value === 'object' && value !== null
      ? value as Readonly<Record<string, unknown>>
      : undefined;
  }

  private readString(row: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
    const value = row?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readNumber(row: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
    const value = row?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private failure<T>(message: string): OnlineGameResult<T> {
    return { valid: false, errors: [message] };
  }
}
