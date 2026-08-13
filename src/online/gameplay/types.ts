import type { SeatIndex } from '../../gameplay/types.js';
import type {
  DisconnectGraceSeconds,
  GameplayJoinRequestDecision,
  GameplayTableJoinPolicy,
  GameplayTableLifecycle,
  GameplayTableVisibility,
  TurnTimerSeconds,
  UpdateGameplayTableSettingsPatch,
} from '../../gameplay/table/types.js';

export interface OnlineGameplayResult<T> {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly value?: T;
}

export interface OnlineGameplayLobbyCard {
  readonly tableId: string;
  readonly name: string;
  readonly visibility: GameplayTableVisibility;
  readonly joinPolicy: GameplayTableJoinPolicy;
  readonly lifecycle: GameplayTableLifecycle;
  readonly hostUserId?: string;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly disconnectGraceSeconds: DisconnectGraceSeconds;
  readonly occupiedSeatCount: number;
  readonly version: number;
}

export interface OnlineGameplayTableSeat {
  readonly seat: SeatIndex;
  readonly kind: 'human' | 'bot';
  readonly userId?: string;
  readonly botId?: string;
  readonly displayName: string;
  readonly joinedAt: string;
}

export interface OnlineGameplayJoinRequest {
  readonly requestId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly requestedSeat?: SeatIndex;
  readonly requestedAt: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
}

export interface OnlineGameplayTableSnapshot extends OnlineGameplayLobbyCard {
  readonly workspaceId: string;
  readonly settingsLocked: boolean;
  readonly createdAt: string;
  readonly seats: readonly OnlineGameplayTableSeat[];
  readonly joinRequests: readonly OnlineGameplayJoinRequest[];
}

export interface OnlineCreateGameplayTableInput {
  readonly commandId: string;
  readonly name: string;
  readonly visibility: GameplayTableVisibility;
  readonly joinPolicy: GameplayTableJoinPolicy;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly disconnectGraceSeconds: DisconnectGraceSeconds;
}

export interface OnlineJoinGameplayTableInput {
  readonly displayName: string;
  readonly requestedSeat?: SeatIndex;
  readonly privateAccessGranted?: boolean;
}

export interface OnlineRequestGameplayJoinInput {
  readonly requestId: string;
  readonly displayName: string;
  readonly requestedSeat?: SeatIndex;
}

export type OnlineGameplaySettingsPatch = UpdateGameplayTableSettingsPatch;
export type OnlineGameplayJoinDecision = GameplayJoinRequestDecision;
