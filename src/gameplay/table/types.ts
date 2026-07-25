import type { SeatIndex } from '../types.js';

export type GameplayTableVisibility = 'private' | 'public';
export type GameplayTableJoinPolicy = 'open' | 'approval-required';
export type GameplayTableLifecycle =
  | 'lobby'
  | 'active'
  | 'paused'
  | 'completed'
  | 'terminated'
  | 'closed';
export type GameplaySeatKind = 'human' | 'bot';
export type TurnTimerSeconds = 20 | 30 | 45 | 60 | 90;
export type DisconnectGraceSeconds = 30 | 60 | 90 | 120;

export const TURN_TIMER_VALUES: readonly TurnTimerSeconds[] = [20, 30, 45, 60, 90];
export const DISCONNECT_GRACE_VALUES: readonly DisconnectGraceSeconds[] = [30, 60, 90, 120];

export interface GameplayTableSeat {
  readonly seat: SeatIndex;
  readonly kind: GameplaySeatKind;
  readonly userId?: string;
  readonly botId?: string;
  readonly displayName: string;
  readonly joinedAt: string;
}

export interface GameplayJoinRequest {
  readonly requestId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly requestedSeat?: SeatIndex;
  readonly requestedAt: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
}

export interface GameplayTableState {
  readonly tableId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly lifecycle: GameplayTableLifecycle;
  readonly visibility: GameplayTableVisibility;
  readonly joinPolicy: GameplayTableJoinPolicy;
  readonly hostUserId?: string;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly disconnectGraceSeconds: DisconnectGraceSeconds;
  readonly settingsLocked: boolean;
  readonly seats: readonly GameplayTableSeat[];
  readonly joinRequests: readonly GameplayJoinRequest[];
  readonly createdAt: string;
}

export interface GameplayTableTransition {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: GameplayTableState;
}

export interface CreateGameplayTableInput {
  readonly tableId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly visibility: GameplayTableVisibility;
  readonly joinPolicy: GameplayTableJoinPolicy;
  readonly hostUserId: string;
  readonly hostDisplayName: string;
  readonly createdAt: string;
  readonly turnTimerSeconds?: TurnTimerSeconds;
  readonly disconnectGraceSeconds?: DisconnectGraceSeconds;
}

export interface UpdateGameplayTableSettingsPatch {
  readonly name?: string;
  readonly visibility?: GameplayTableVisibility;
  readonly joinPolicy?: GameplayTableJoinPolicy;
  readonly turnTimerSeconds?: TurnTimerSeconds;
  readonly disconnectGraceSeconds?: DisconnectGraceSeconds;
}

export interface JoinOpenGameplayTableInput {
  readonly userId: string;
  readonly displayName: string;
  readonly joinedAt: string;
  readonly requestedSeat?: SeatIndex;
  readonly privateAccessGranted?: boolean;
}
