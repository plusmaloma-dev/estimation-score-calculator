import type { SeatIndex } from '../types.js';
import type {
  DisconnectGraceSeconds,
  TurnTimerSeconds,
} from '../table/types.js';

export type ActiveControlLifecycle = 'active' | 'paused' | 'terminated';
export type SeatConnectionState = 'connected' | 'disconnected';
export type SeatControlOwner = 'human' | 'temporary-bot' | 'permanent-bot';
export type ActiveTurnActionKind = 'bid' | 'card';
export type ActiveTurnStatus = 'running' | 'assistant-pending' | 'bot-processing';

export interface StartTurnInput {
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
  readonly occurredAt: string;
}

export interface ActiveSeatControl {
  readonly seat: SeatIndex;
  readonly seatKind: 'human' | 'bot';
  readonly humanUserId?: string;
  readonly botId?: string;
  readonly joinedAt: string;
  readonly connectedAt?: string;
  readonly connection: SeatConnectionState;
  readonly controlOwner: SeatControlOwner;
  readonly disconnectedAt?: string;
  readonly graceDeadlineAt?: string;
  readonly graceRemainingMs?: number;
  readonly reclaimPending: boolean;
}

export interface ActiveTurnClock {
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
  readonly startedAt: string;
  readonly deadlineAt?: string;
  readonly remainingMs?: number;
  readonly status: ActiveTurnStatus;
}

export interface ActiveGameControlState {
  readonly tableId: string;
  readonly lifecycle: ActiveControlLifecycle;
  readonly hostUserId: string;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly disconnectGraceSeconds: DisconnectGraceSeconds;
  readonly seats: readonly [
    ActiveSeatControl,
    ActiveSeatControl,
    ActiveSeatControl,
    ActiveSeatControl,
  ];
  readonly turn?: ActiveTurnClock;
  readonly pausedAt?: string;
  readonly terminatedAt?: string;
  readonly terminatedBy?: string;
}

export type ActiveControlEventType =
  | 'game.paused'
  | 'game.resumed'
  | 'game.terminated'
  | 'seat.disconnected'
  | 'seat.reconnected'
  | 'seat.takeover'
  | 'seat.reclaimed'
  | 'host.transferred'
  | 'turn.started'
  | 'turn.timeout-assistance'
  | 'turn.bot-processing'
  | 'turn.completed';

export interface ActiveControlEvent {
  readonly type: ActiveControlEventType;
  readonly occurredAt: string;
  readonly actorUserId?: string;
  readonly userId?: string;
  readonly seat?: SeatIndex;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ActiveControlTransition {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: ActiveGameControlState;
  readonly events: readonly ActiveControlEvent[];
}
