import type { BotActionSource } from '../../gameplay/bot/types.js';
import type {
  ActiveControlEventType,
  ActiveControlLifecycle,
  ActiveTurnActionKind,
  ActiveTurnStatus,
  SeatConnectionState,
  SeatControlOwner,
} from '../../gameplay/control/types.js';
import type { SeatIndex } from '../../gameplay/types.js';
import type {
  DisconnectGraceSeconds,
  TurnTimerSeconds,
} from '../../gameplay/table/types.js';

export type { OnlineGameplayResult } from './types.js';

export interface OnlineActiveTurnClock {
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
  readonly startedAt: string;
  readonly deadlineAt?: string;
  readonly remainingMs?: number;
  readonly status: ActiveTurnStatus;
}

export interface OnlineActiveSeatControl {
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

export interface OnlineActiveControlEvent {
  readonly type: ActiveControlEventType | 'control.initialized';
  readonly occurredAt: string;
  readonly actorUserId?: string;
  readonly userId?: string;
  readonly seat?: SeatIndex;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OnlineBotActionDirective {
  readonly directiveId: string;
  readonly tableId: string;
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
  readonly source: BotActionSource;
  readonly issuedAt: string;
}

export interface OnlineActiveGameControlSnapshot {
  readonly tableId: string;
  readonly lifecycle: ActiveControlLifecycle;
  readonly hostUserId: string;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly disconnectGraceSeconds: DisconnectGraceSeconds;
  readonly version: number;
  readonly turn?: OnlineActiveTurnClock;
  readonly seats: readonly OnlineActiveSeatControl[];
  readonly pausedAt?: string;
  readonly terminatedAt?: string;
  readonly terminatedBy?: string;
  readonly events: readonly OnlineActiveControlEvent[];
  readonly directives: readonly OnlineBotActionDirective[];
}

export interface OnlineStartActiveTurnInput {
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
}
