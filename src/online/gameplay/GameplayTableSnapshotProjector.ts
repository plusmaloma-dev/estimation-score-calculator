import type { WorkspaceRole } from '../auth/types.js';
import type {
  OnlineGameplayJoinRequest,
  OnlineGameplayTableSeat,
  OnlineGameplayTableSnapshot,
} from './types.js';

export interface GameplayTableProjectionViewer {
  readonly userId: string;
  readonly workspaceRole: WorkspaceRole;
}

export interface GameplayLobbyCardProjection {
  readonly tableId: string;
  readonly name: string;
  readonly hostDisplayName: string;
  readonly occupiedSeatCount: number;
  readonly joinPolicy: OnlineGameplayTableSnapshot['joinPolicy'];
  readonly turnTimerSeconds: OnlineGameplayTableSnapshot['turnTimerSeconds'];
  readonly disconnectGraceSeconds: OnlineGameplayTableSnapshot['disconnectGraceSeconds'];
  readonly lifecycle: OnlineGameplayTableSnapshot['lifecycle'];
  readonly version: number;
}

export interface GameplayTablePermissionsProjection {
  readonly isHost: boolean;
  readonly isSeated: boolean;
  readonly canManageRequests: boolean;
  readonly canStart: boolean;
  readonly canUpdateSettings: boolean;
}

export interface GameplayTableMemberProjection {
  readonly tableId: string;
  readonly name: string;
  readonly visibility: OnlineGameplayTableSnapshot['visibility'];
  readonly joinPolicy: OnlineGameplayTableSnapshot['joinPolicy'];
  readonly lifecycle: OnlineGameplayTableSnapshot['lifecycle'];
  readonly hostUserId?: string;
  readonly turnTimerSeconds: OnlineGameplayTableSnapshot['turnTimerSeconds'];
  readonly disconnectGraceSeconds: OnlineGameplayTableSnapshot['disconnectGraceSeconds'];
  readonly settingsLocked: boolean;
  readonly occupiedSeatCount: number;
  readonly version: number;
  readonly seats: readonly OnlineGameplayTableSeat[];
  readonly joinRequests: readonly OnlineGameplayJoinRequest[];
  readonly permissions: GameplayTablePermissionsProjection;
}

export class GameplayTableSnapshotProjector {
  projectLobbyCard(snapshot: OnlineGameplayTableSnapshot): GameplayLobbyCardProjection {
    const hostDisplayName = snapshot.seats.find(
      (seat) => seat.kind === 'human' && seat.userId === snapshot.hostUserId,
    )?.displayName ?? 'Host';

    return {
      tableId: snapshot.tableId,
      name: snapshot.name,
      hostDisplayName,
      occupiedSeatCount: snapshot.occupiedSeatCount,
      joinPolicy: snapshot.joinPolicy,
      turnTimerSeconds: snapshot.turnTimerSeconds,
      disconnectGraceSeconds: snapshot.disconnectGraceSeconds,
      lifecycle: snapshot.lifecycle,
      version: snapshot.version,
    };
  }

  projectMemberSnapshot(
    snapshot: OnlineGameplayTableSnapshot,
    viewer: GameplayTableProjectionViewer,
  ): GameplayTableMemberProjection {
    const isHost = snapshot.hostUserId === viewer.userId;
    const isSeated = snapshot.seats.some(
      (seat) => seat.kind === 'human' && seat.userId === viewer.userId,
    );
    const canManageRequests = isHost || viewer.workspaceRole === 'admin';
    const pendingRequests = snapshot.joinRequests.some((request) => request.status === 'pending');
    const isOpenLobby = snapshot.lifecycle === 'lobby' && !snapshot.settingsLocked;

    return {
      tableId: snapshot.tableId,
      name: snapshot.name,
      visibility: snapshot.visibility,
      joinPolicy: snapshot.joinPolicy,
      lifecycle: snapshot.lifecycle,
      ...(snapshot.hostUserId === undefined ? {} : { hostUserId: snapshot.hostUserId }),
      turnTimerSeconds: snapshot.turnTimerSeconds,
      disconnectGraceSeconds: snapshot.disconnectGraceSeconds,
      settingsLocked: snapshot.settingsLocked,
      occupiedSeatCount: snapshot.occupiedSeatCount,
      version: snapshot.version,
      seats: snapshot.seats.map((seat) => this.projectSeat(seat)),
      joinRequests: snapshot.joinRequests
        .filter((request) => canManageRequests || request.userId === viewer.userId)
        .map((request) => this.projectJoinRequest(request)),
      permissions: {
        isHost,
        isSeated,
        canManageRequests,
        canStart: isHost && isOpenLobby && !pendingRequests,
        canUpdateSettings: isHost && isOpenLobby,
      },
    };
  }

  private projectSeat(seat: OnlineGameplayTableSeat): OnlineGameplayTableSeat {
    if (seat.kind === 'human') {
      return {
        seat: seat.seat,
        kind: 'human',
        ...(seat.userId === undefined ? {} : { userId: seat.userId }),
        displayName: seat.displayName,
        joinedAt: seat.joinedAt,
      };
    }

    return {
      seat: seat.seat,
      kind: 'bot',
      ...(seat.botId === undefined ? {} : { botId: seat.botId }),
      displayName: seat.displayName,
      joinedAt: seat.joinedAt,
    };
  }

  private projectJoinRequest(
    request: OnlineGameplayJoinRequest,
  ): OnlineGameplayJoinRequest {
    return {
      requestId: request.requestId,
      userId: request.userId,
      displayName: request.displayName,
      ...(request.requestedSeat === undefined
        ? {}
        : { requestedSeat: request.requestedSeat }),
      requestedAt: request.requestedAt,
      status: request.status,
      ...(request.resolvedAt === undefined ? {} : { resolvedAt: request.resolvedAt }),
      ...(request.resolvedBy === undefined ? {} : { resolvedBy: request.resolvedBy }),
    };
  }
}
