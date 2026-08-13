import type { SeatIndex } from '../types.js';
import type { GameplayTableState } from '../table/types.js';
import type {
  ActiveControlEvent,
  ActiveControlTransition,
  ActiveGameControlState,
  ActiveSeatControl,
  ActiveTurnClock,
  StartTurnInput,
} from './types.js';

export class ActiveGameControlEngine {
  createFromStartedTable(
    table: GameplayTableState,
    occurredAt: string,
  ): ActiveGameControlState {
    this.timestamp(occurredAt, 'Control initialization time');
    if (
      table.lifecycle !== 'active'
      || !table.settingsLocked
      || table.seats.length !== 4
      || table.hostUserId === undefined
    ) {
      throw new Error(
        'Active control requires a started and settings-locked gameplay table with four seats.',
      );
    }

    const ordered = [...table.seats].sort((left, right) => left.seat - right.seat);
    if (ordered.some((seat, index) => seat.seat !== index)) {
      throw new Error('Active control requires exactly one seat at each index from 0 through 3.');
    }

    const seats = this.fourSeats(ordered.map((seat): ActiveSeatControl => {
      if (seat.kind === 'human') {
        if (seat.userId === undefined) {
          throw new Error(`Human seat ${seat.seat} is missing its user ID.`);
        }
        return {
          seat: seat.seat,
          seatKind: 'human',
          humanUserId: seat.userId,
          joinedAt: seat.joinedAt,
          connectedAt: occurredAt,
          connection: 'connected',
          controlOwner: 'human',
          reclaimPending: false,
        };
      }

      if (seat.botId === undefined) {
        throw new Error(`Bot seat ${seat.seat} is missing its bot ID.`);
      }
      return {
        seat: seat.seat,
        seatKind: 'bot',
        botId: seat.botId,
        joinedAt: seat.joinedAt,
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      };
    }));

    return {
      tableId: table.tableId,
      lifecycle: 'active',
      hostUserId: table.hostUserId,
      turnTimerSeconds: table.turnTimerSeconds,
      disconnectGraceSeconds: table.disconnectGraceSeconds,
      seats,
    };
  }

  pause(
    state: ActiveGameControlState,
    actorUserId: string,
    occurredAt: string,
  ): ActiveControlTransition {
    const guard = this.hostLifecycleGuard(state, actorUserId, 'active');
    if (guard !== undefined) return guard;

    const now = this.timestamp(occurredAt, 'Pause time');
    const turn = state.turn === undefined
      ? undefined
      : this.freezeTurn(state.turn, now);
    const seats = this.fourSeats(
      state.seats.map((seat) => this.freezeSeatGrace(seat, now)),
    );

    return this.accepted(
      {
        ...state,
        lifecycle: 'paused',
        pausedAt: occurredAt,
        ...(turn === undefined ? {} : { turn }),
        seats,
      },
      [{ type: 'game.paused', occurredAt, actorUserId }],
    );
  }

  resume(
    state: ActiveGameControlState,
    actorUserId: string,
    occurredAt: string,
  ): ActiveControlTransition {
    const guard = this.hostLifecycleGuard(state, actorUserId, 'paused');
    if (guard !== undefined) return guard;

    const now = this.timestamp(occurredAt, 'Resume time');
    const pausedAt = this.timestamp(state.pausedAt ?? '', 'Stored pause time');
    if (now < pausedAt) {
      return this.rejected(state, 'Resume time cannot be earlier than pause time.');
    }

    const turn = state.turn === undefined
      ? undefined
      : this.resumeTurn(state.turn, now);
    const seats = this.fourSeats(
      state.seats.map((seat) => this.resumeSeatGrace(seat, now)),
    );
    const { pausedAt: _pausedAt, ...withoutPause } = state;

    return this.accepted(
      {
        ...withoutPause,
        lifecycle: 'active',
        ...(turn === undefined ? {} : { turn }),
        seats,
      },
      [{ type: 'game.resumed', occurredAt, actorUserId }],
    );
  }

  terminate(
    state: ActiveGameControlState,
    actorUserId: string,
    confirmed: boolean,
    occurredAt: string,
  ): ActiveControlTransition {
    if (state.lifecycle === 'terminated') {
      return this.rejected(state, 'Terminated games are read-only.');
    }
    if (state.hostUserId !== actorUserId) {
      return this.rejected(state, 'Only the current host can perform this action.');
    }
    if (!confirmed) {
      return this.rejected(state, 'Active-game termination requires explicit confirmation.');
    }
    this.timestamp(occurredAt, 'Termination time');

    const seats = this.fourSeats(
      state.seats.map((seat) => this.stopSeatGrace(seat)),
    );
    const {
      turn: _turn,
      pausedAt: _pausedAt,
      terminatedAt: _terminatedAt,
      terminatedBy: _terminatedBy,
      ...rest
    } = state;

    return this.accepted(
      {
        ...rest,
        lifecycle: 'terminated',
        seats,
        terminatedAt: occurredAt,
        terminatedBy: actorUserId,
      },
      [{ type: 'game.terminated', occurredAt, actorUserId }],
    );
  }

  disconnect(
    state: ActiveGameControlState,
    userId: string,
    occurredAt: string,
  ): ActiveControlTransition {
    if (state.lifecycle === 'terminated') {
      return this.rejected(state, 'Terminated games are read-only.');
    }
    const seat = this.humanSeat(state, userId);
    if (seat === undefined) {
      return this.rejected(state, `Human user ${userId} is not seated.`);
    }
    if (seat.connection === 'disconnected') {
      return this.rejected(state, `User ${userId} is already disconnected.`);
    }

    const now = this.timestamp(occurredAt, 'Disconnect time');
    const {
      connectedAt: _connectedAt,
      disconnectedAt: _disconnectedAt,
      graceDeadlineAt: _graceDeadlineAt,
      graceRemainingMs: _graceRemainingMs,
      ...rest
    } = seat;
    const graceMs = state.disconnectGraceSeconds * 1_000;
    const disconnectedSeat: ActiveSeatControl = {
      ...rest,
      connection: 'disconnected',
      disconnectedAt: occurredAt,
      reclaimPending: false,
      ...(seat.controlOwner === 'human'
        ? state.lifecycle === 'paused'
          ? { graceRemainingMs: graceMs }
          : { graceDeadlineAt: new Date(now + graceMs).toISOString() }
        : {}),
    };
    let seats = this.replaceSeat(state.seats, disconnectedSeat);
    const events: ActiveControlEvent[] = [
      { type: 'seat.disconnected', occurredAt, userId, seat: seat.seat },
    ];
    let hostUserId = state.hostUserId;

    if (state.hostUserId === userId) {
      const nextHost = seats
        .filter((candidate) =>
          candidate.seatKind === 'human'
          && candidate.connection === 'connected'
          && candidate.humanUserId !== undefined)
        .sort((left, right) => this.compareConnectedHumans(left, right))[0];
      if (nextHost?.humanUserId !== undefined) {
        hostUserId = nextHost.humanUserId;
        events.push({
          type: 'host.transferred',
          occurredAt,
          userId: nextHost.humanUserId,
          seat: nextHost.seat,
          details: { previousHostUserId: userId, hostUserId: nextHost.humanUserId },
        });
      }
    }

    return this.accepted({ ...state, hostUserId, seats }, events);
  }

  reconnect(
    state: ActiveGameControlState,
    userId: string,
    occurredAt: string,
  ): ActiveControlTransition {
    if (state.lifecycle === 'terminated') {
      return this.rejected(state, 'Terminated games are read-only.');
    }
    const seat = this.humanSeat(state, userId);
    if (seat === undefined) {
      return this.rejected(state, `Human user ${userId} is not seated.`);
    }
    if (seat.connection === 'connected') {
      return this.rejected(state, `User ${userId} is already connected.`);
    }
    this.timestamp(occurredAt, 'Reconnect time');

    const {
      connectedAt: _connectedAt,
      disconnectedAt: _disconnectedAt,
      graceDeadlineAt: _graceDeadlineAt,
      graceRemainingMs: _graceRemainingMs,
      ...rest
    } = seat;
    const reconnectedSeat: ActiveSeatControl = {
      ...rest,
      connection: 'connected',
      connectedAt: occurredAt,
      reclaimPending: seat.controlOwner === 'temporary-bot',
    };
    const seats = this.replaceSeat(state.seats, reconnectedSeat);

    return this.accepted(
      { ...state, seats },
      [{ type: 'seat.reconnected', occurredAt, userId, seat: seat.seat }],
    );
  }

  evaluateGrace(
    state: ActiveGameControlState,
    occurredAt: string,
  ): ActiveControlTransition {
    if (state.lifecycle === 'terminated') {
      return this.rejected(state, 'Terminated games are read-only.');
    }
    if (state.lifecycle === 'paused') return this.accepted(state, []);
    const now = this.timestamp(occurredAt, 'Grace evaluation time');
    const events: ActiveControlEvent[] = [];
    const mapped = state.seats.map((seat): ActiveSeatControl => {
      if (
        seat.seatKind !== 'human'
        || seat.connection !== 'disconnected'
        || seat.controlOwner !== 'human'
        || seat.graceDeadlineAt === undefined
        || this.timestamp(seat.graceDeadlineAt, 'Disconnect grace deadline') > now
      ) return seat;

      const {
        graceDeadlineAt: _graceDeadlineAt,
        graceRemainingMs: _graceRemainingMs,
        ...rest
      } = seat;
      events.push({
        type: 'seat.takeover',
        occurredAt,
        userId: seat.humanUserId,
        seat: seat.seat,
      });
      return {
        ...rest,
        controlOwner: 'temporary-bot',
        reclaimPending: false,
      };
    });
    if (events.length === 0) return this.accepted(state, []);
    return this.accepted({ ...state, seats: this.fourSeats(mapped) }, events);
  }

  beginBotAction(
    state: ActiveGameControlState,
    seat: SeatIndex,
    turnId: string,
    occurredAt: string,
  ): ActiveControlTransition {
    if (state.lifecycle !== 'active') {
      return this.rejected(state, 'Bot actions can begin only while the game is active.');
    }
    this.timestamp(occurredAt, 'Bot action start time');
    if (state.turn === undefined || state.turn.turnId !== turnId || state.turn.seat !== seat) {
      return this.rejected(state, 'Bot action does not match the authoritative turn.');
    }
    if (state.turn.status === 'bot-processing') {
      return this.rejected(state, 'The bot action is already processing.');
    }
    const seatControl = state.seats[seat];
    if (seatControl.controlOwner === 'human' && state.turn.status !== 'assistant-pending') {
      return this.rejected(state, 'The active seat is currently controlled by its human.');
    }

    return this.accepted(
      { ...state, turn: { ...state.turn, status: 'bot-processing' } },
      [{ type: 'turn.bot-processing', occurredAt, seat }],
    );
  }

  completeActionBoundary(
    state: ActiveGameControlState,
    nextTurn: StartTurnInput | undefined,
    occurredAt: string,
  ): ActiveControlTransition {
    if (state.lifecycle !== 'active') {
      return this.rejected(state, 'Action boundaries can advance only while the game is active.');
    }
    this.timestamp(occurredAt, 'Action boundary time');
    const events: ActiveControlEvent[] = [];
    if (state.turn !== undefined) {
      events.push({
        type: 'turn.completed',
        occurredAt,
        seat: state.turn.seat,
        details: { turnId: state.turn.turnId },
      });
    }

    let seats = state.seats;
    if (nextTurn !== undefined) {
      const nextSeat = seats[nextTurn.seat];
      if (
        nextSeat.seatKind === 'human'
        && nextSeat.connection === 'connected'
        && nextSeat.controlOwner === 'temporary-bot'
        && nextSeat.reclaimPending
      ) {
        seats = this.replaceSeat(seats, {
          ...nextSeat,
          controlOwner: 'human',
          reclaimPending: false,
        });
        events.push({
          type: 'seat.reclaimed',
          occurredAt,
          userId: nextSeat.humanUserId,
          seat: nextSeat.seat,
        });
      }
    }

    const { turn: _turn, ...withoutTurn } = state;
    if (nextTurn === undefined) {
      return this.accepted({ ...withoutTurn, seats }, events);
    }
    const turn = this.createTurnClock(state, nextTurn);
    events.push({
      type: 'turn.started',
      occurredAt: nextTurn.occurredAt,
      seat: nextTurn.seat,
      details: { turnId: nextTurn.turnId, actionKind: nextTurn.actionKind },
    });
    return this.accepted({ ...withoutTurn, seats, turn }, events);
  }

  private hostLifecycleGuard(
    state: ActiveGameControlState,
    actorUserId: string,
    requiredLifecycle: 'active' | 'paused',
  ): ActiveControlTransition | undefined {
    if (state.lifecycle === 'terminated') {
      return this.rejected(state, 'Terminated games are read-only.');
    }
    if (state.hostUserId !== actorUserId) {
      return this.rejected(state, 'Only the current host can perform this action.');
    }
    if (state.lifecycle !== requiredLifecycle) {
      const action = requiredLifecycle === 'active' ? 'paused' : 'resumed';
      return this.rejected(
        state,
        `Game must be ${requiredLifecycle} before it can be ${action}.`,
      );
    }
    return undefined;
  }

  private createTurnClock(
    state: ActiveGameControlState,
    input: StartTurnInput,
  ): ActiveTurnClock {
    if (!input.turnId.trim()) throw new Error('Turn ID is required.');
    const started = this.timestamp(input.occurredAt, 'Turn start');
    return {
      turnId: input.turnId,
      seat: input.seat,
      actionKind: input.actionKind,
      startedAt: input.occurredAt,
      deadlineAt: new Date(started + state.turnTimerSeconds * 1_000).toISOString(),
      status: 'running',
    };
  }

  private humanSeat(
    state: ActiveGameControlState,
    userId: string,
  ): ActiveSeatControl | undefined {
    return state.seats.find(
      (seat) => seat.seatKind === 'human' && seat.humanUserId === userId,
    );
  }

  private compareConnectedHumans(
    left: ActiveSeatControl,
    right: ActiveSeatControl,
  ): number {
    const leftConnected = this.timestamp(left.connectedAt ?? left.joinedAt, 'Connected time');
    const rightConnected = this.timestamp(right.connectedAt ?? right.joinedAt, 'Connected time');
    if (leftConnected !== rightConnected) return leftConnected - rightConnected;
    const leftJoined = this.timestamp(left.joinedAt, 'Join time');
    const rightJoined = this.timestamp(right.joinedAt, 'Join time');
    if (leftJoined !== rightJoined) return leftJoined - rightJoined;
    return left.seat - right.seat;
  }

  private replaceSeat(
    seats: ActiveGameControlState['seats'],
    replacement: ActiveSeatControl,
  ): ActiveGameControlState['seats'] {
    return this.fourSeats(
      seats.map((seat) => seat.seat === replacement.seat ? replacement : seat),
    );
  }

  private freezeTurn(turn: ActiveTurnClock, now: number): ActiveTurnClock {
    if (turn.deadlineAt === undefined) return turn;
    const deadline = this.timestamp(turn.deadlineAt, 'Turn deadline');
    const started = this.timestamp(turn.startedAt, 'Turn start');
    if (now < started) throw new Error('Pause time cannot be earlier than turn start.');
    const { deadlineAt: _deadlineAt, remainingMs: _remainingMs, ...rest } = turn;
    return {
      ...rest,
      remainingMs: Math.max(0, deadline - now),
    };
  }

  private resumeTurn(turn: ActiveTurnClock, now: number): ActiveTurnClock {
    if (turn.remainingMs === undefined) return turn;
    const { remainingMs, deadlineAt: _deadlineAt, ...rest } = turn;
    return {
      ...rest,
      deadlineAt: new Date(now + remainingMs).toISOString(),
    };
  }

  private freezeSeatGrace(seat: ActiveSeatControl, now: number): ActiveSeatControl {
    if (seat.graceDeadlineAt === undefined) return seat;
    const deadline = this.timestamp(seat.graceDeadlineAt, 'Disconnect grace deadline');
    const disconnected = this.timestamp(seat.disconnectedAt ?? '', 'Disconnect time');
    if (now < disconnected) throw new Error('Pause time cannot be earlier than disconnect time.');
    const {
      graceDeadlineAt: _graceDeadlineAt,
      graceRemainingMs: _graceRemainingMs,
      ...rest
    } = seat;
    return {
      ...rest,
      graceRemainingMs: Math.max(0, deadline - now),
    };
  }

  private resumeSeatGrace(seat: ActiveSeatControl, now: number): ActiveSeatControl {
    if (seat.graceRemainingMs === undefined) return seat;
    const {
      graceRemainingMs,
      graceDeadlineAt: _graceDeadlineAt,
      ...rest
    } = seat;
    return {
      ...rest,
      graceDeadlineAt: new Date(now + graceRemainingMs).toISOString(),
    };
  }

  private stopSeatGrace(seat: ActiveSeatControl): ActiveSeatControl {
    const {
      graceDeadlineAt: _graceDeadlineAt,
      graceRemainingMs: _graceRemainingMs,
      ...rest
    } = seat;
    return rest;
  }

  private fourSeats(
    seats: readonly ActiveSeatControl[],
  ): ActiveGameControlState['seats'] {
    if (seats.length !== 4) {
      throw new Error('Active control requires exactly four seat controls.');
    }
    return [seats[0]!, seats[1]!, seats[2]!, seats[3]!];
  }

  private timestamp(value: string, label: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid ISO timestamp.`);
    return parsed;
  }

  private accepted(
    state: ActiveGameControlState,
    events: readonly ActiveControlEvent[],
  ): ActiveControlTransition {
    return { valid: true, errors: [], state, events };
  }

  private rejected(
    state: ActiveGameControlState,
    ...errors: readonly string[]
  ): ActiveControlTransition {
    return { valid: false, errors, state, events: [] };
  }
}
