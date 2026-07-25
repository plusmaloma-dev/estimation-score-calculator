import { SEAT_INDICES, type SeatIndex } from '../types.js';
import {
  DISCONNECT_GRACE_VALUES,
  TURN_TIMER_VALUES,
  type CreateGameplayTableInput,
  type GameplayTableSeat,
  type GameplayTableState,
  type GameplayTableTransition,
  type JoinOpenGameplayTableInput,
  type UpdateGameplayTableSettingsPatch,
} from './types.js';

export class GameplayTableEngine {
  create(input: CreateGameplayTableInput): GameplayTableState {
    const name = input.name.trim();
    const hostDisplayName = input.hostDisplayName.trim();
    if (name.length === 0) throw new Error('Table name is required.');
    if (input.tableId.trim().length === 0) throw new Error('Table ID is required.');
    if (input.workspaceId.trim().length === 0) throw new Error('Workspace ID is required.');
    if (input.hostUserId.trim().length === 0) throw new Error('Host user ID is required.');
    if (hostDisplayName.length === 0) throw new Error('Host display name is required.');

    const turnTimerSeconds = input.turnTimerSeconds ?? 45;
    const disconnectGraceSeconds = input.disconnectGraceSeconds ?? 60;
    if (!TURN_TIMER_VALUES.includes(turnTimerSeconds)) {
      throw new Error('Turn timer must be one of 20, 30, 45, 60, or 90 seconds.');
    }
    if (!DISCONNECT_GRACE_VALUES.includes(disconnectGraceSeconds)) {
      throw new Error('Disconnect grace must be one of 30, 60, 90, or 120 seconds.');
    }

    return {
      tableId: input.tableId,
      workspaceId: input.workspaceId,
      name,
      lifecycle: 'lobby',
      visibility: input.visibility,
      joinPolicy: input.joinPolicy,
      hostUserId: input.hostUserId,
      turnTimerSeconds,
      disconnectGraceSeconds,
      settingsLocked: false,
      seats: [
        {
          seat: 0,
          kind: 'human',
          userId: input.hostUserId,
          displayName: hostDisplayName,
          joinedAt: input.createdAt,
        },
      ],
      joinRequests: [],
      createdAt: input.createdAt,
    };
  }

  updateSettings(
    state: GameplayTableState,
    actorUserId: string,
    patch: UpdateGameplayTableSettingsPatch,
  ): GameplayTableTransition {
    if (state.settingsLocked || state.lifecycle !== 'lobby') {
      return this.rejected(state, 'Table settings are locked after Start.');
    }
    if (state.hostUserId !== actorUserId) {
      return this.rejected(state, 'Only the current host can update table settings.');
    }

    const errors: string[] = [];
    const name = patch.name?.trim();
    if (patch.name !== undefined && name?.length === 0) {
      errors.push('Table name is required.');
    }
    if (
      patch.turnTimerSeconds !== undefined
      && !TURN_TIMER_VALUES.includes(patch.turnTimerSeconds)
    ) {
      errors.push('Turn timer must be one of 20, 30, 45, 60, or 90 seconds.');
    }
    if (
      patch.disconnectGraceSeconds !== undefined
      && !DISCONNECT_GRACE_VALUES.includes(patch.disconnectGraceSeconds)
    ) {
      errors.push('Disconnect grace must be one of 30, 60, 90, or 120 seconds.');
    }
    if (errors.length > 0) return { valid: false, errors, state };

    return this.accepted({
      ...state,
      ...(name === undefined ? {} : { name }),
      ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
      ...(patch.joinPolicy === undefined ? {} : { joinPolicy: patch.joinPolicy }),
      ...(patch.turnTimerSeconds === undefined
        ? {}
        : { turnTimerSeconds: patch.turnTimerSeconds }),
      ...(patch.disconnectGraceSeconds === undefined
        ? {}
        : { disconnectGraceSeconds: patch.disconnectGraceSeconds }),
    });
  }

  joinOpenTable(
    state: GameplayTableState,
    input: JoinOpenGameplayTableInput,
  ): GameplayTableTransition {
    if (state.lifecycle !== 'lobby' || state.settingsLocked) {
      return this.rejected(state, 'Players cannot join after the table has started.');
    }
    if (state.seats.some((seat) => seat.kind === 'human' && seat.userId === input.userId)) {
      return this.rejected(state, `User ${input.userId} is already seated at this table.`);
    }
    if (state.visibility === 'private' && input.privateAccessGranted !== true) {
      return this.rejected(state, 'Private table access has not been granted.');
    }
    if (state.visibility === 'public' && state.joinPolicy === 'approval-required') {
      return this.rejected(state, 'This table requires host approval before joining.');
    }
    if (state.seats.length >= 4) {
      return this.rejected(state, 'Table has no vacant seats.');
    }

    const displayName = input.displayName.trim();
    if (displayName.length === 0) {
      return this.rejected(state, 'Player display name is required.');
    }

    const seat = input.requestedSeat ?? this.firstVacantSeat(state);
    if (state.seats.some((existing) => existing.seat === seat)) {
      return this.rejected(state, `Seat ${seat} is already occupied.`);
    }

    const joinedSeat: GameplayTableSeat = {
      seat,
      kind: 'human',
      userId: input.userId,
      displayName,
      joinedAt: input.joinedAt,
    };

    return this.accepted({
      ...state,
      seats: [...state.seats, joinedSeat].sort((left, right) => left.seat - right.seat),
    });
  }

  leaveLobby(
    state: GameplayTableState,
    actorUserId: string,
    _occurredAt: string,
  ): GameplayTableTransition {
    if (state.lifecycle !== 'lobby') {
      return this.rejected(state, 'Players can leave through this command only while in the lobby.');
    }

    const leavingSeat = state.seats.find(
      (seat) => seat.kind === 'human' && seat.userId === actorUserId,
    );
    if (leavingSeat === undefined) {
      return this.rejected(state, `User ${actorUserId} is not seated at this table.`);
    }

    const seats = state.seats.filter((seat) => seat !== leavingSeat);
    const humans = seats.filter(
      (seat): seat is GameplayTableSeat & { readonly userId: string } =>
        seat.kind === 'human' && seat.userId !== undefined,
    );

    if (humans.length === 0) {
      const { hostUserId: _removedHost, ...stateWithoutHost } = state;
      return this.accepted({
        ...stateWithoutHost,
        lifecycle: 'closed',
        seats: [],
      });
    }

    if (state.hostUserId !== actorUserId) {
      return this.accepted({ ...state, seats });
    }

    const nextHost = [...humans].sort((left, right) => {
      const timeOrder = left.joinedAt.localeCompare(right.joinedAt);
      return timeOrder === 0 ? left.seat - right.seat : timeOrder;
    })[0]!;

    return this.accepted({
      ...state,
      hostUserId: nextHost.userId,
      seats,
    });
  }

  start(
    state: GameplayTableState,
    actorUserId: string,
    occurredAt: string,
  ): GameplayTableTransition {
    if (state.lifecycle !== 'lobby' || state.settingsLocked) {
      return this.rejected(state, 'This table has already started.');
    }
    if (state.hostUserId !== actorUserId) {
      return this.rejected(state, 'Only the current host can start the table.');
    }
    if (!state.seats.some((seat) => seat.kind === 'human')) {
      return this.rejected(state, 'At least one connected human is required to start.');
    }

    const occupied = new Map<SeatIndex, GameplayTableSeat>(
      state.seats.map((seat) => [seat.seat, seat]),
    );
    const seats = SEAT_INDICES.map((seat): GameplayTableSeat => {
      const existing = occupied.get(seat);
      if (existing !== undefined) return existing;
      return {
        seat,
        kind: 'bot',
        botId: `standard-bot:${state.tableId}:${seat}`,
        displayName: `Standard Bot ${seat + 1}`,
        joinedAt: occurredAt,
      };
    });

    return this.accepted({
      ...state,
      lifecycle: 'active',
      settingsLocked: true,
      seats,
    });
  }

  private firstVacantSeat(state: GameplayTableState): SeatIndex {
    const occupied = new Set(state.seats.map((seat) => seat.seat));
    const seat = SEAT_INDICES.find((candidate) => !occupied.has(candidate));
    if (seat === undefined) throw new Error('Table has no vacant seats.');
    return seat;
  }

  private accepted(state: GameplayTableState): GameplayTableTransition {
    return { valid: true, errors: [], state };
  }

  private rejected(
    state: GameplayTableState,
    ...errors: readonly string[]
  ): GameplayTableTransition {
    return { valid: false, errors, state };
  }
}
