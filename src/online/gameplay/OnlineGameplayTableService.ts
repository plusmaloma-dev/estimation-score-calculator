import type { AuthSessionState } from '../auth/types.js';
import type {
  OnlineCreateGameplayTableInput,
  OnlineGameplayJoinDecision,
  OnlineGameplayJoinRequest,
  OnlineGameplayLobbyCard,
  OnlineGameplayResult,
  OnlineGameplaySettingsPatch,
  OnlineGameplayTableSeat,
  OnlineGameplayTableSnapshot,
  OnlineJoinGameplayTableInput,
  OnlineRequestGameplayJoinInput,
} from './types.js';

export interface OnlineGameplayTableDatabase {
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
}

const TURN_TIMERS = [20, 30, 45, 60, 90] as const;
const DISCONNECT_GRACES = [30, 60, 90, 120] as const;
const LIFECYCLES = ['lobby', 'active', 'paused', 'completed', 'terminated', 'closed'] as const;

export class OnlineGameplayTableService {
  constructor(
    private readonly client: OnlineGameplayTableDatabase,
    private readonly session: AuthSessionState,
  ) {}

  async createTable(
    input: OnlineCreateGameplayTableInput,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const errors = this.validateCommandId(input.commandId);
    const name = input.name.trim();
    if (name.length === 0) errors.push('Table name is required.');
    if (!TURN_TIMERS.includes(input.turnTimerSeconds)) errors.push('Invalid turn timer.');
    if (!DISCONNECT_GRACES.includes(input.disconnectGraceSeconds)) {
      errors.push('Invalid disconnect grace.');
    }
    if (errors.length > 0) return this.failure(errors);

    return this.snapshotRpc('create_gameplay_table', {
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: input.commandId,
      p_name: name,
      p_visibility: input.visibility,
      p_join_policy: input.joinPolicy,
      p_turn_timer_seconds: input.turnTimerSeconds,
      p_disconnect_grace_seconds: input.disconnectGraceSeconds,
    });
  }

  async listLobby(): Promise<OnlineGameplayResult<readonly OnlineGameplayLobbyCard[]>> {
    const result = await this.client.rpc('get_gameplay_lobby', {
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
    });
    if (result.error !== null) return this.failure([result.error.message]);
    if (!Array.isArray(result.data)) return this.failure(['Gameplay lobby response is incomplete.']);

    const cards: OnlineGameplayLobbyCard[] = [];
    for (const item of result.data) {
      const card = this.parseLobbyCard(item);
      if (card === undefined) return this.failure(['Gameplay lobby response is incomplete.']);
      cards.push(card);
    }
    return { valid: true, errors: [], value: cards };
  }

  async openTable(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    if (!tableId.trim()) return this.failure(['Gameplay table ID is required.']);
    return this.snapshotRpc('get_gameplay_table_snapshot', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
    });
  }

  async updateSettings(
    tableId: string,
    expectedVersion: number,
    patch: OnlineGameplaySettingsPatch,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const errors = this.validateMutation(tableId, expectedVersion, commandId);
    const name = patch.name?.trim();
    if (patch.name !== undefined && name?.length === 0) errors.push('Table name is required.');
    if (patch.turnTimerSeconds !== undefined && !TURN_TIMERS.includes(patch.turnTimerSeconds)) {
      errors.push('Invalid turn timer.');
    }
    if (
      patch.disconnectGraceSeconds !== undefined
      && !DISCONNECT_GRACES.includes(patch.disconnectGraceSeconds)
    ) {
      errors.push('Invalid disconnect grace.');
    }
    if (errors.length > 0) return this.failure(errors);

    const payload = {
      ...patch,
      ...(name === undefined ? {} : { name }),
    };
    return this.snapshotRpc('update_gameplay_table_settings', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_expected_version: expectedVersion,
      p_patch: payload,
    });
  }

  async joinTable(
    tableId: string,
    expectedVersion: number,
    input: OnlineJoinGameplayTableInput,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const errors = this.validateMutation(tableId, expectedVersion, commandId);
    const displayName = input.displayName.trim();
    if (!displayName) errors.push('Player display name is required.');
    if (input.requestedSeat !== undefined && !this.validSeat(input.requestedSeat)) {
      errors.push('Requested seat must be between 0 and 3.');
    }
    if (errors.length > 0) return this.failure(errors);

    return this.snapshotRpc('join_gameplay_table', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_expected_version: expectedVersion,
      p_join_payload: {
        displayName,
        ...(input.requestedSeat === undefined ? {} : { requestedSeat: input.requestedSeat }),
        ...(input.privateAccessGranted === undefined
          ? {}
          : { privateAccessGranted: input.privateAccessGranted }),
      },
    });
  }

  async requestJoin(
    tableId: string,
    expectedVersion: number,
    input: OnlineRequestGameplayJoinInput,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const errors = this.validateMutation(tableId, expectedVersion, commandId);
    const displayName = input.displayName.trim();
    if (!input.requestId.trim()) errors.push('Join request ID is required.');
    if (!displayName) errors.push('Player display name is required.');
    if (input.requestedSeat !== undefined && !this.validSeat(input.requestedSeat)) {
      errors.push('Requested seat must be between 0 and 3.');
    }
    if (errors.length > 0) return this.failure(errors);

    return this.snapshotRpc('request_gameplay_table_join', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_expected_version: expectedVersion,
      p_request_payload: {
        requestId: input.requestId,
        displayName,
        ...(input.requestedSeat === undefined ? {} : { requestedSeat: input.requestedSeat }),
      },
    });
  }

  async respondJoinRequest(
    tableId: string,
    expectedVersion: number,
    requestId: string,
    decision: OnlineGameplayJoinDecision,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const errors = this.validateMutation(tableId, expectedVersion, commandId);
    if (!requestId.trim()) errors.push('Join request ID is required.');
    if (errors.length > 0) return this.failure(errors);

    return this.snapshotRpc('respond_gameplay_join_request', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_expected_version: expectedVersion,
      p_request_id: requestId,
      p_decision: decision,
    });
  }

  async leaveTable(
    tableId: string,
    expectedVersion: number,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    return this.simpleMutation(
      'leave_gameplay_table', tableId, expectedVersion, commandId,
    );
  }

  async startTable(
    tableId: string,
    expectedVersion: number,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    return this.simpleMutation(
      'start_gameplay_table', tableId, expectedVersion, commandId,
    );
  }

  private async simpleMutation(
    rpcName: 'leave_gameplay_table' | 'start_gameplay_table',
    tableId: string,
    expectedVersion: number,
    commandId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const errors = this.validateMutation(tableId, expectedVersion, commandId);
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc(rpcName, {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_expected_version: expectedVersion,
    });
  }

  private async snapshotRpc(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    const result = await this.client.rpc(name, args);
    if (result.error !== null) return this.failure([result.error.message]);
    const row = this.firstObject(result.data);
    if (row === undefined) return this.failure(['Gameplay table snapshot is incomplete.']);

    if (row.valid === false) {
      const errors = this.stringArray(row.errors);
      return this.failure(errors.length > 0 ? errors : ['Gameplay table command was rejected.']);
    }

    const snapshot = this.parseSnapshot(row);
    return snapshot === undefined
      ? this.failure(['Gameplay table snapshot is incomplete.'])
      : { valid: true, errors: [], value: snapshot };
  }

  private parseSnapshot(row: Readonly<Record<string, unknown>>): OnlineGameplayTableSnapshot | undefined {
    const card = this.parseLobbyCard(row);
    const workspaceId = this.string(row.workspaceId);
    const createdAt = this.string(row.createdAt);
    if (
      card === undefined
      || workspaceId === undefined
      || createdAt === undefined
      || typeof row.settingsLocked !== 'boolean'
      || !Array.isArray(row.seats)
      || !Array.isArray(row.joinRequests)
    ) return undefined;

    const seats: OnlineGameplayTableSeat[] = [];
    for (const item of row.seats) {
      const seat = this.parseSeat(item);
      if (seat === undefined) return undefined;
      seats.push(seat);
    }
    const joinRequests: OnlineGameplayJoinRequest[] = [];
    for (const item of row.joinRequests) {
      const request = this.parseJoinRequest(item);
      if (request === undefined) return undefined;
      joinRequests.push(request);
    }

    return {
      ...card,
      workspaceId,
      settingsLocked: row.settingsLocked,
      createdAt,
      seats,
      joinRequests,
    };
  }

  private parseLobbyCard(value: unknown): OnlineGameplayLobbyCard | undefined {
    const row = this.object(value);
    if (row === undefined) return undefined;
    const tableId = this.string(row.tableId);
    const name = this.string(row.name);
    const visibility = row.visibility === 'private' || row.visibility === 'public'
      ? row.visibility : undefined;
    const joinPolicy = row.joinPolicy === 'open' || row.joinPolicy === 'approval-required'
      ? row.joinPolicy : undefined;
    const lifecycle = LIFECYCLES.includes(row.lifecycle as typeof LIFECYCLES[number])
      ? row.lifecycle as typeof LIFECYCLES[number] : undefined;
    const turnTimerSeconds = TURN_TIMERS.includes(row.turnTimerSeconds as typeof TURN_TIMERS[number])
      ? row.turnTimerSeconds as typeof TURN_TIMERS[number] : undefined;
    const disconnectGraceSeconds = DISCONNECT_GRACES.includes(
      row.disconnectGraceSeconds as typeof DISCONNECT_GRACES[number],
    ) ? row.disconnectGraceSeconds as typeof DISCONNECT_GRACES[number] : undefined;
    const occupiedSeatCount = this.nonNegativeInteger(row.occupiedSeatCount);
    const version = this.nonNegativeInteger(row.version);
    if (
      tableId === undefined || name === undefined || visibility === undefined
      || joinPolicy === undefined || lifecycle === undefined || turnTimerSeconds === undefined
      || disconnectGraceSeconds === undefined || occupiedSeatCount === undefined
      || version === undefined
    ) return undefined;
    const hostUserId = this.string(row.hostUserId);
    return {
      tableId,
      name,
      visibility,
      joinPolicy,
      lifecycle,
      ...(hostUserId === undefined ? {} : { hostUserId }),
      turnTimerSeconds,
      disconnectGraceSeconds,
      occupiedSeatCount,
      version,
    };
  }

  private parseSeat(value: unknown): OnlineGameplayTableSeat | undefined {
    const row = this.object(value);
    if (row === undefined || !this.validSeat(row.seat)) return undefined;
    const displayName = this.string(row.displayName);
    const joinedAt = this.string(row.joinedAt);
    if (displayName === undefined || joinedAt === undefined) return undefined;
    if (row.kind === 'human') {
      const userId = this.string(row.userId);
      return userId === undefined ? undefined : {
        seat: row.seat,
        kind: 'human',
        userId,
        displayName,
        joinedAt,
      };
    }
    if (row.kind === 'bot') {
      const botId = this.string(row.botId);
      return botId === undefined ? undefined : {
        seat: row.seat,
        kind: 'bot',
        botId,
        displayName,
        joinedAt,
      };
    }
    return undefined;
  }

  private parseJoinRequest(value: unknown): OnlineGameplayJoinRequest | undefined {
    const row = this.object(value);
    if (row === undefined) return undefined;
    const requestId = this.string(row.requestId);
    const userId = this.string(row.userId);
    const displayName = this.string(row.displayName);
    const requestedAt = this.string(row.requestedAt);
    const status = row.status === 'pending' || row.status === 'accepted' || row.status === 'rejected'
      ? row.status : undefined;
    if (
      requestId === undefined || userId === undefined || displayName === undefined
      || requestedAt === undefined || status === undefined
    ) return undefined;
    if (row.requestedSeat !== undefined && row.requestedSeat !== null && !this.validSeat(row.requestedSeat)) {
      return undefined;
    }
    const resolvedAt = this.string(row.resolvedAt);
    const resolvedBy = this.string(row.resolvedBy);
    return {
      requestId,
      userId,
      displayName,
      ...(row.requestedSeat === undefined || row.requestedSeat === null
        ? {}
        : { requestedSeat: row.requestedSeat }),
      requestedAt,
      status,
      ...(resolvedAt === undefined ? {} : { resolvedAt }),
      ...(resolvedBy === undefined ? {} : { resolvedBy }),
    };
  }

  private validateMutation(tableId: string, expectedVersion: number, commandId: string): string[] {
    const errors = this.validateCommandId(commandId);
    if (!tableId.trim()) errors.push('Gameplay table ID is required.');
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      errors.push('Expected table version must be a non-negative integer.');
    }
    return errors;
  }

  private validateCommandId(commandId: string): string[] {
    return commandId.trim() ? [] : ['Table command ID is required.'];
  }

  private validSeat(value: unknown): value is 0 | 1 | 2 | 3 {
    return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 3;
  }

  private firstObject(data: unknown): Readonly<Record<string, unknown>> | undefined {
    return this.object(Array.isArray(data) ? data[0] : data);
  }

  private object(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>> : undefined;
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private nonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private failure<T>(errors: readonly string[]): OnlineGameplayResult<T> {
    return { valid: false, errors };
  }
}
