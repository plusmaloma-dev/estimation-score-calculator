import type { GameplayTableState } from '../table/types.js';
import type {
  ActiveControlEvent,
  ActiveControlTransition,
  ActiveGameControlState,
  ActiveSeatControl,
  ActiveTurnClock,
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

    const seats = ordered.map((seat): ActiveSeatControl => {
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
    }) as ActiveGameControlState['seats'];

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
    const seats = state.seats.map(
      (seat) => this.freezeSeatGrace(seat, now),
    ) as ActiveGameControlState['seats'];

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
    const seats = state.seats.map(
      (seat) => this.resumeSeatGrace(seat, now),
    ) as ActiveGameControlState['seats'];
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

    const seats = state.seats.map(
      (seat) => this.stopSeatGrace(seat),
    ) as ActiveGameControlState['seats'];
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
