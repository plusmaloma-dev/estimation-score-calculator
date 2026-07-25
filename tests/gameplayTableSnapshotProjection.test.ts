import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayTableSnapshotProjector,
  type GameplayTableProjectionViewer,
} from '../src/online/gameplay/GameplayTableSnapshotProjector.js';
import type { OnlineGameplayTableSnapshot } from '../src/online/gameplay/types.js';

function snapshot(): OnlineGameplayTableSnapshot {
  return {
    tableId: 'table-1',
    workspaceId: 'workspace-1',
    name: 'Friday Table',
    visibility: 'public',
    joinPolicy: 'approval-required',
    lifecycle: 'lobby',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    settingsLocked: false,
    occupiedSeatCount: 2,
    version: 4,
    createdAt: '2026-07-25T20:00:00.000Z',
    seats: [
      {
        seat: 0,
        kind: 'human',
        userId: 'host-user',
        displayName: 'Host Name',
        joinedAt: '2026-07-25T20:00:00.000Z',
      },
      {
        seat: 2,
        kind: 'human',
        userId: 'member-user',
        displayName: 'Member Name',
        joinedAt: '2026-07-25T20:01:00.000Z',
      },
    ],
    joinRequests: [
      {
        requestId: 'request-member',
        userId: 'member-user',
        displayName: 'Member Name',
        requestedSeat: 2,
        requestedAt: '2026-07-25T19:59:00.000Z',
        status: 'accepted',
        resolvedAt: '2026-07-25T20:01:00.000Z',
        resolvedBy: 'host-user',
      },
      {
        requestId: 'request-pending',
        userId: 'waiting-user',
        displayName: 'Waiting Name',
        requestedSeat: 1,
        requestedAt: '2026-07-25T20:02:00.000Z',
        status: 'pending',
      },
    ],
  };
}

function keys(value: object): string[] {
  return Object.keys(value).sort();
}

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'hands',
    'seed',
    'seedHex',
    'shuffledDeck',
    'futureCards',
    'deckOrder',
    'privateCode',
    'botDecision',
    'unpublishedDecision',
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `Projection leaked forbidden field ${forbidden}`,
    );
  }
}

test('public lobby projection exposes only the approved card fields', () => {
  const projector = new GameplayTableSnapshotProjector();

  const card = projector.projectLobbyCard(snapshot());

  assert.deepEqual(keys(card), [
    'disconnectGraceSeconds',
    'hostDisplayName',
    'joinPolicy',
    'lifecycle',
    'name',
    'occupiedSeatCount',
    'tableId',
    'turnTimerSeconds',
    'version',
  ]);
  assert.equal(card.hostDisplayName, 'Host Name');
  assert.equal(card.occupiedSeatCount, 2);
  assertNoSecrets(card);
});

test('seated member projection includes settings, seats, own request history, and no host-only controls', () => {
  const projector = new GameplayTableSnapshotProjector();
  const viewer: GameplayTableProjectionViewer = {
    userId: 'member-user',
    workspaceRole: 'tester',
  };

  const projected = projector.projectMemberSnapshot(snapshot(), viewer);

  assert.deepEqual(keys(projected), [
    'disconnectGraceSeconds',
    'hostUserId',
    'joinPolicy',
    'joinRequests',
    'lifecycle',
    'name',
    'occupiedSeatCount',
    'permissions',
    'seats',
    'settingsLocked',
    'tableId',
    'turnTimerSeconds',
    'version',
    'visibility',
  ]);
  assert.deepEqual(projected.joinRequests.map((request) => request.requestId), ['request-member']);
  assert.deepEqual(projected.permissions, {
    isHost: false,
    isSeated: true,
    canManageRequests: false,
    canStart: false,
    canUpdateSettings: false,
  });
  assertNoSecrets(projected);
});

test('host projection includes pending requests and lobby management controls', () => {
  const projector = new GameplayTableSnapshotProjector();

  const projected = projector.projectMemberSnapshot(snapshot(), {
    userId: 'host-user',
    workspaceRole: 'tester',
  });

  assert.deepEqual(
    projected.joinRequests.map((request) => request.requestId),
    ['request-member', 'request-pending'],
  );
  assert.deepEqual(projected.permissions, {
    isHost: true,
    isSeated: true,
    canManageRequests: true,
    canStart: false,
    canUpdateSettings: true,
  });
});

test('workspace Admin may inspect requests but does not gain host Start or settings powers', () => {
  const projector = new GameplayTableSnapshotProjector();

  const projected = projector.projectMemberSnapshot(snapshot(), {
    userId: 'admin-user',
    workspaceRole: 'admin',
  });

  assert.equal(projected.joinRequests.length, 2);
  assert.deepEqual(projected.permissions, {
    isHost: false,
    isSeated: false,
    canManageRequests: true,
    canStart: false,
    canUpdateSettings: false,
  });
});

test('host can start only when the lobby has no pending requests', () => {
  const projector = new GameplayTableSnapshotProjector();
  const clean = {
    ...snapshot(),
    joinRequests: snapshot().joinRequests.map((request) => request.status === 'pending'
      ? {
          ...request,
          status: 'rejected' as const,
          resolvedAt: '2026-07-25T20:03:00.000Z',
          resolvedBy: 'host-user',
        }
      : request),
  };

  const projected = projector.projectMemberSnapshot(clean, {
    userId: 'host-user',
    workspaceRole: 'tester',
  });

  assert.equal(projected.permissions.canStart, true);
});

test('allow-list projections discard malicious extra private fields', () => {
  const projector = new GameplayTableSnapshotProjector();
  const malicious = {
    ...snapshot(),
    privateCode: 'secret-code',
    hands: [{ seat: 0, cards: ['AS'] }],
    seedHex: 'ff'.repeat(32),
    shuffledDeck: ['AS'],
    futureCards: ['KH'],
    botDecision: { card: 'AS' },
    seats: snapshot().seats.map((seat) => ({
      ...seat,
      hand: ['AS'],
      privateReconnectToken: 'reconnect-secret',
    })),
    joinRequests: snapshot().joinRequests.map((request) => ({
      ...request,
      hiddenModerationNote: 'private',
    })),
  } as unknown as OnlineGameplayTableSnapshot;

  const lobby = projector.projectLobbyCard(malicious);
  const member = projector.projectMemberSnapshot(malicious, {
    userId: 'host-user',
    workspaceRole: 'tester',
  });

  assertNoSecrets(lobby);
  assertNoSecrets(member);
  assert.deepEqual(keys(member.seats[0]!), [
    'displayName',
    'joinedAt',
    'kind',
    'seat',
    'userId',
  ]);
  assert.deepEqual(keys(member.joinRequests[0]!), [
    'displayName',
    'requestId',
    'requestedAt',
    'requestedSeat',
    'resolvedAt',
    'resolvedBy',
    'status',
    'userId',
  ]);
});
