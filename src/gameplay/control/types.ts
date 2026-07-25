import type { BotActionSource } from '../bot/types.js';
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
  | 'turn.bot-directed'
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

export interface BotActionDirective {
  readonly directiveId: string;
  readonly tableId: string;
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
  readonly source: BotActionSource;
  readonly issuedAt: string;
}

export interface ActiveDeadlineEvaluation {
  readonly state: ActiveGameControlState;
  readonly directives: readonly BotActionDirective[];
  readonly events: readonly ActiveControlEvent[];
}

export type ActiveControlCommand =
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'TERMINATE'; readonly confirmed: boolean }
  | { readonly type: 'DISCONNECT'; readonly userId: string }
  | { readonly type: 'RECONNECT'; readonly userId: string }
  | { readonly type: 'EVALUATE_GRACE' }
  | { readonly type: 'EVALUATE_DEADLINE' }
  | {
      readonly type: 'START_TURN';
      readonly turnId: string;
      readonly seat: SeatIndex;
      readonly actionKind: ActiveTurnActionKind;
    }
  | {
      readonly type: 'BEGIN_BOT_ACTION';
      readonly seat: SeatIndex;
      readonly turnId: string;
    }
  | {
      readonly type: 'COMPLETE_ACTION_BOUNDARY';
      readonly nextTurn?: Omit<StartTurnInput, 'occurredAt'>;
    };

export interface ActiveControlCommandEnvelope {
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly command: ActiveControlCommand;
}

export interface ActiveControlCommandRecord extends ActiveControlCommandEnvelope {
  readonly accepted: boolean;
  readonly resultingVersion: number;
  readonly errors: readonly string[];
  readonly transition: ActiveControlTransition;
  readonly events: readonly ActiveControlEvent[];
  readonly directives: readonly BotActionDirective[];
}

export interface ActiveControlCommandProcessResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicate: boolean;
  readonly state: ActiveGameControlState;
  readonly version: number;
  readonly records: readonly ActiveControlCommandRecord[];
  readonly record?: ActiveControlCommandRecord;
}

export interface ActiveControlReplayResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: ActiveGameControlState;
  readonly version: number;
  readonly recordsReplayed: number;
}
