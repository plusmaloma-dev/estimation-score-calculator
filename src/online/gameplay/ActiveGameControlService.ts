import type { AuthSessionState } from '../auth/types.js';
import type { OnlineGameplayResult } from './types.js';
import type {
  OnlineActiveControlEvent,
  OnlineActiveGameControlSnapshot,
  OnlineActiveSeatControl,
  OnlineActiveTurnClock,
  OnlineBotActionDirective,
  OnlineStartActiveTurnInput,
} from './activeControlTypes.js';

export interface ActiveGameControlDatabase {
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<{
    readonly data: unknown;
    readonly error: { readonly message: string } | null;
  }>;
}

const TURN_TIMERS = [20, 30, 45, 60, 90] as const;
const DISCONNECT_GRACES = [30, 60, 90, 120] as const;
const LIFECYCLES = ['active', 'paused', 'terminated'] as const;
const TURN_STATUSES = ['running', 'assistant-pending', 'bot-processing'] as const;
const CONNECTIONS = ['connected', 'disconnected'] as const;
const CONTROL_OWNERS = ['human', 'temporary-bot', 'permanent-bot'] as const;
const ACTION_KINDS = ['bid', 'card'] as const;
const DIRECTIVE_SOURCES = [
  'permanent-bot',
  'disconnect-substitute',
  'timeout-assistant',
] as const;
const EVENT_TYPES = [
  'control.initialized',
  'game.paused',
  'game.resumed',
  'game.terminated',
  'seat.disconnected',
  'seat.reconnected',
  'seat.takeover',
  'seat.reclaimed',
  'host.transferred',
  'turn.started',
  'turn.timeout-assistance',
  'turn.bot-directed',
  'turn.bot-processing',
  'turn.completed',
] as const;

export class ActiveGameControlService {
  constructor(
    private readonly client: ActiveGameControlDatabase,
    private readonly session: AuthSessionState,
  ) {}

  async initialize(
    tableId: string,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateIdentity(tableId, commandId, occurredAt);
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc('initialize_active_game_control', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_occurred_at: occurredAt,
    });
  }

  async getSnapshot(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    if (!tableId.trim()) return this.failure(['Gameplay table ID is required.']);
    return this.snapshotRpc('get_active_game_control_snapshot', {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
    });
  }

  async pause(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    return this.simpleMutation(
      'pause_active_game', tableId, expectedVersion, commandId, occurredAt,
    );
  }

  async resume(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    return this.simpleMutation(
      'resume_active_game', tableId, expectedVersion, commandId, occurredAt,
    );
  }

  async terminate(
    tableId: string,
    expectedVersion: number,
    confirmed: boolean,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateMutation(
      tableId, expectedVersion, commandId, occurredAt,
    );
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc('terminate_active_game', {
      ...this.mutationArgs(tableId, expectedVersion, commandId, occurredAt),
      p_confirmed: confirmed,
    });
  }

  async disconnect(
    tableId: string,
    expectedVersion: number,
    userId: string,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    return this.userMutation(
      'disconnect_active_game_user',
      tableId,
      expectedVersion,
      userId,
      commandId,
      occurredAt,
    );
  }

  async reconnect(
    tableId: string,
    expectedVersion: number,
    userId: string,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    return this.userMutation(
      'reconnect_active_game_user',
      tableId,
      expectedVersion,
      userId,
      commandId,
      occurredAt,
    );
  }

  async evaluateGrace(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    return this.simpleMutation(
      'evaluate_active_game_grace',
      tableId,
      expectedVersion,
      commandId,
      occurredAt,
    );
  }

  async evaluateDeadlines(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    return this.simpleMutation(
      'evaluate_active_game_deadlines',
      tableId,
      expectedVersion,
      commandId,
      occurredAt,
    );
  }

  async startTurn(
    tableId: string,
    expectedVersion: number,
    input: OnlineStartActiveTurnInput,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateMutation(
      tableId, expectedVersion, commandId, occurredAt,
    );
    if (!input.turnId.trim()) errors.push('Turn ID is required.');
    if (!this.validSeat(input.seat)) errors.push('Turn seat must be between 0 and 3.');
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc('start_active_game_turn', {
      ...this.mutationArgs(tableId, expectedVersion, commandId, occurredAt),
      p_turn_id: input.turnId,
      p_seat: input.seat,
      p_action_kind: input.actionKind,
    });
  }

  async beginBotAction(
    tableId: string,
    expectedVersion: number,
    turnId: string,
    seat: 0 | 1 | 2 | 3,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateMutation(
      tableId, expectedVersion, commandId, occurredAt,
    );
    if (!turnId.trim()) errors.push('Turn ID is required.');
    if (!this.validSeat(seat)) errors.push('Turn seat must be between 0 and 3.');
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc('begin_active_bot_action', {
      ...this.mutationArgs(tableId, expectedVersion, commandId, occurredAt),
      p_turn_id: turnId,
      p_seat: seat,
    });
  }

  async completeActionBoundary(
    tableId: string,
    expectedVersion: number,
    nextTurn: OnlineStartActiveTurnInput | undefined,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateMutation(
      tableId, expectedVersion, commandId, occurredAt,
    );
    if (nextTurn !== undefined) {
      if (!nextTurn.turnId.trim()) errors.push('Turn ID is required.');
      if (!this.validSeat(nextTurn.seat)) errors.push('Turn seat must be between 0 and 3.');
    }
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc('complete_active_action_boundary', {
      ...this.mutationArgs(tableId, expectedVersion, commandId, occurredAt),
      p_next_turn: nextTurn ?? null,
    });
  }

  private async simpleMutation(
    rpcName: string,
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateMutation(
      tableId, expectedVersion, commandId, occurredAt,
    );
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc(
      rpcName,
      this.mutationArgs(tableId, expectedVersion, commandId, occurredAt),
    );
  }

  private async userMutation(
    rpcName: string,
    tableId: string,
    expectedVersion: number,
    userId: string,
    commandId: string,
    occurredAt: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const errors = this.validateMutation(
      tableId, expectedVersion, commandId, occurredAt,
    );
    if (!userId.trim()) errors.push('Human user ID is required.');
    if (errors.length > 0) return this.failure(errors);
    return this.snapshotRpc(rpcName, {
      ...this.mutationArgs(tableId, expectedVersion, commandId, occurredAt),
      p_user_id: userId,
    });
  }

  private mutationArgs(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): Readonly<Record<string, unknown>> {
    return {
      p_table_id: tableId,
      p_workspace_id: this.session.membership.workspaceId,
      p_actor_user_id: this.session.user.id,
      p_command_id: commandId,
      p_expected_version: expectedVersion,
      p_occurred_at: occurredAt,
    };
  }

  private async snapshotRpc(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
    const result = await this.client.rpc(name, args);
    if (result.error !== null) return this.failure([result.error.message]);
    const row = this.object(Array.isArray(result.data) ? result.data[0] : result.data);
    if (row === undefined) return this.failure(['Active-game control snapshot is incomplete.']);
    if (row.valid === false) {
      const errors = this.stringArray(row.errors);
      return this.failure(
        errors.length > 0 ? errors : ['Active-game control command was rejected.'],
      );
    }
    const snapshot = this.parseSnapshot(row);
    return snapshot === undefined
      ? this.failure(['Active-game control snapshot is incomplete.'])
      : { valid: true, errors: [], value: snapshot };
  }

  private parseSnapshot(
    row: Readonly<Record<string, unknown>>,
  ): OnlineActiveGameControlSnapshot | undefined {
    const tableId = this.string(row.tableId);
    const hostUserId = this.string(row.hostUserId);
    const lifecycle = this.oneOf(row.lifecycle, LIFECYCLES);
    const turnTimerSeconds = this.oneOf(row.turnTimerSeconds, TURN_TIMERS);
    const disconnectGraceSeconds = this.oneOf(
      row.disconnectGraceSeconds,
      DISCONNECT_GRACES,
    );
    const version = this.nonNegativeInteger(row.version);
    if (
      tableId === undefined
      || hostUserId === undefined
      || lifecycle === undefined
      || turnTimerSeconds === undefined
      || disconnectGraceSeconds === undefined
      || version === undefined
      || !Array.isArray(row.seats)
      || row.seats.length !== 4
    ) return undefined;

    const seats: OnlineActiveSeatControl[] = [];
    for (const value of row.seats) {
      const seat = this.parseSeat(value);
      if (seat === undefined) return undefined;
      seats.push(seat);
    }

    const turn = row.turn === null || row.turn === undefined
      ? undefined
      : this.parseTurn(row.turn);
    if (row.turn !== null && row.turn !== undefined && turn === undefined) return undefined;

    const events = this.parseEvents(row.events ?? []);
    const directives = this.parseDirectives(row.directives ?? []);
    if (events === undefined || directives === undefined) return undefined;

    const pausedAt = this.optionalString(row.pausedAt);
    const terminatedAt = this.optionalString(row.terminatedAt);
    const terminatedBy = this.optionalString(row.terminatedBy);

    return {
      tableId,
      lifecycle,
      hostUserId,
      turnTimerSeconds,
      disconnectGraceSeconds,
      version,
      ...(turn === undefined ? {} : { turn }),
      seats,
      ...(pausedAt === undefined ? {} : { pausedAt }),
      ...(terminatedAt === undefined ? {} : { terminatedAt }),
      ...(terminatedBy === undefined ? {} : { terminatedBy }),
      events,
      directives,
    };
  }

  private parseTurn(value: unknown): OnlineActiveTurnClock | undefined {
    const row = this.object(value);
    if (row === undefined || !this.validSeat(row.seat)) return undefined;
    const turnId = this.string(row.turnId);
    const actionKind = this.oneOf(row.actionKind, ACTION_KINDS);
    const startedAt = this.string(row.startedAt);
    const status = this.oneOf(row.status, TURN_STATUSES);
    if (
      turnId === undefined
      || actionKind === undefined
      || startedAt === undefined
      || status === undefined
    ) return undefined;
    const deadlineAt = this.optionalString(row.deadlineAt);
    const remainingMs = row.remainingMs === null || row.remainingMs === undefined
      ? undefined : this.nonNegativeInteger(row.remainingMs);
    if (
      row.remainingMs !== null
      && row.remainingMs !== undefined
      && remainingMs === undefined
    ) return undefined;
    return {
      turnId,
      seat: row.seat,
      actionKind,
      startedAt,
      ...(deadlineAt === undefined ? {} : { deadlineAt }),
      ...(remainingMs === undefined ? {} : { remainingMs }),
      status,
    };
  }

  private parseSeat(value: unknown): OnlineActiveSeatControl | undefined {
    const row = this.object(value);
    if (row === undefined || !this.validSeat(row.seat)) return undefined;
    const seatKind = row.seatKind === 'human' || row.seatKind === 'bot'
      ? row.seatKind : undefined;
    const joinedAt = this.string(row.joinedAt);
    const connection = this.oneOf(row.connection, CONNECTIONS);
    const controlOwner = this.oneOf(row.controlOwner, CONTROL_OWNERS);
    if (
      seatKind === undefined
      || joinedAt === undefined
      || connection === undefined
      || controlOwner === undefined
      || typeof row.reclaimPending !== 'boolean'
    ) return undefined;
    const humanUserId = this.optionalString(row.humanUserId);
    const botId = this.optionalString(row.botId);
    if (
      (seatKind === 'human' && (humanUserId === undefined || botId !== undefined))
      || (seatKind === 'bot' && (botId === undefined || humanUserId !== undefined))
    ) return undefined;
    const connectedAt = this.optionalString(row.connectedAt);
    const disconnectedAt = this.optionalString(row.disconnectedAt);
    const graceDeadlineAt = this.optionalString(row.graceDeadlineAt);
    const graceRemainingMs = row.graceRemainingMs === null || row.graceRemainingMs === undefined
      ? undefined : this.nonNegativeInteger(row.graceRemainingMs);
    if (
      row.graceRemainingMs !== null
      && row.graceRemainingMs !== undefined
      && graceRemainingMs === undefined
    ) return undefined;
    return {
      seat: row.seat,
      seatKind,
      ...(humanUserId === undefined ? {} : { humanUserId }),
      ...(botId === undefined ? {} : { botId }),
      joinedAt,
      ...(connectedAt === undefined ? {} : { connectedAt }),
      connection,
      controlOwner,
      ...(disconnectedAt === undefined ? {} : { disconnectedAt }),
      ...(graceDeadlineAt === undefined ? {} : { graceDeadlineAt }),
      ...(graceRemainingMs === undefined ? {} : { graceRemainingMs }),
      reclaimPending: row.reclaimPending,
    };
  }

  private parseEvents(value: unknown): OnlineActiveControlEvent[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const events: OnlineActiveControlEvent[] = [];
    for (const item of value) {
      const row = this.object(item);
      const type = row === undefined ? undefined : this.oneOf(row.type, EVENT_TYPES);
      const occurredAt = row === undefined ? undefined : this.string(row.occurredAt);
      if (row === undefined || type === undefined || occurredAt === undefined) return undefined;
      const actorUserId = this.optionalString(row.actorUserId);
      const userId = this.optionalString(row.userId);
      if (row.seat !== null && row.seat !== undefined && !this.validSeat(row.seat)) return undefined;
      const details = row.details === null || row.details === undefined
        ? undefined : this.object(row.details);
      if (row.details !== null && row.details !== undefined && details === undefined) return undefined;
      events.push({
        type,
        occurredAt,
        ...(actorUserId === undefined ? {} : { actorUserId }),
        ...(userId === undefined ? {} : { userId }),
        ...(row.seat === null || row.seat === undefined ? {} : { seat: row.seat }),
        ...(details === undefined ? {} : { details }),
      });
    }
    return events;
  }

  private parseDirectives(value: unknown): OnlineBotActionDirective[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const directives: OnlineBotActionDirective[] = [];
    for (const item of value) {
      const row = this.object(item);
      if (row === undefined || !this.validSeat(row.seat)) return undefined;
      const directiveId = this.string(row.directiveId);
      const tableId = this.string(row.tableId);
      const turnId = this.string(row.turnId);
      const actionKind = this.oneOf(row.actionKind, ACTION_KINDS);
      const source = this.oneOf(row.source, DIRECTIVE_SOURCES);
      const issuedAt = this.string(row.issuedAt);
      if (
        directiveId === undefined
        || tableId === undefined
        || turnId === undefined
        || actionKind === undefined
        || source === undefined
        || issuedAt === undefined
      ) return undefined;
      directives.push({
        directiveId,
        tableId,
        turnId,
        seat: row.seat,
        actionKind,
        source,
        issuedAt,
      });
    }
    return directives;
  }

  private validateMutation(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    occurredAt: string,
  ): string[] {
    const errors = this.validateIdentity(tableId, commandId, occurredAt);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      errors.push('Expected active control version must be a non-negative integer.');
    }
    return errors;
  }

  private validateIdentity(
    tableId: string,
    commandId: string,
    occurredAt: string,
  ): string[] {
    const errors: string[] = [];
    if (!tableId.trim()) errors.push('Gameplay table ID is required.');
    if (!commandId.trim()) errors.push('Active control command ID is required.');
    if (!Number.isFinite(Date.parse(occurredAt))) {
      errors.push('Active control occurrence time must be a valid ISO timestamp.');
    }
    return errors;
  }

  private validSeat(value: unknown): value is 0 | 1 | 2 | 3 {
    return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 3;
  }

  private oneOf<const T extends readonly (string | number)[]>(
    value: unknown,
    values: T,
  ): T[number] | undefined {
    return values.includes(value as T[number]) ? value as T[number] : undefined;
  }

  private object(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>> : undefined;
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private optionalString(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : this.string(value);
  }

  private nonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value : undefined;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private failure<T>(errors: readonly string[]): OnlineGameplayResult<T> {
    return { valid: false, errors };
  }
}
