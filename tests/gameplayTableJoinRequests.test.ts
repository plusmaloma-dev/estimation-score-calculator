import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayTableEngine,
  type CreateGameplayTableInput,
  type GameplayTableState,
} from '../src/index.js';

function input(
  overrides: Partial<CreateGameplayTableInput> = {},
): CreateGameplayTableInput {
  return {
    tableId: 'approval-table',
    workspaceId: 'workspace-1',
    name: 'Approval table',
    visibility: 'public',
    joinPolicy: 'approval-required',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T18:00:00.000Z',
    ...overrides,
  };
}

function state(
  overrides: Partial<CreateGameplayTableInput> = {},
): GameplayTableState {
  return new GameplayTableEngine().create(input(overrides));
}

test('host accepts a pending request and atomically seats the player in the requested seat', () => {
  const engine = new GameplayTableEngine();
  const lobby = state();
  const requested = engine.requestJoin(lobby, {
    requestId: 'request-1',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedSeat: 2,
    requestedAt: '2026-07-25T18:01:00.000Z',
  });

  assert.equal(requested.valid, true, requested.errors.join('\n'));
  assert.equal(requested.state.seats.length, 1);
  assert.equal(requested.state.joinRequests.length, 1);
  assert.equal(requested.state.joinRequests[0]?.status, 'pending');

  const accepted = engine.respondToJoinRequest(
    requested.state,
    'host-user',
    'request-1',
    'accept',
    '2026-07-25T18:02:00.000Z',
  );

  assert.equal(accepted.valid, true, accepted.errors.join('\n'));
  assert.equal(accepted.state.seats.find((seat) => seat.userId === 'guest-1')?.seat, 2);
  assert.deepEqual(accepted.state.joinRequests[0], {
    requestId: 'request-1',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedSeat: 2,
    requestedAt: '2026-07-25T18:01:00.000Z',
    status: 'accepted',
    resolvedAt: '2026-07-25T18:02:00.000Z',
    resolvedBy: 'host-user',
  });
});

test('join requests are accepted only by public approval-required lobby tables', () => {
  const engine = new GameplayTableEngine();

  const openResult = engine.requestJoin(state({ joinPolicy: 'open' }), {
    requestId: 'open-request',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedAt: '2026-07-25T18:01:00.000Z',
  });
  assert.equal(openResult.valid, false);
  assert.ok(openResult.errors.includes('This table does not use approval-required joining.'));

  const privateResult = engine.requestJoin(state({ visibility: 'private' }), {
    requestId: 'private-request',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedAt: '2026-07-25T18:01:00.000Z',
  });
  assert.equal(privateResult.valid, false);
  assert.ok(privateResult.errors.includes('Join requests are available only for public tables.'));
});

test('a user can have only one pending join request', () => {
  const engine = new GameplayTableEngine();
  const first = engine.requestJoin(state(), {
    requestId: 'request-1',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedAt: '2026-07-25T18:01:00.000Z',
  });

  const duplicate = engine.requestJoin(first.state, {
    requestId: 'request-2',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedAt: '2026-07-25T18:02:00.000Z',
  });

  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.state, first.state);
  assert.ok(duplicate.errors.includes('User guest-1 already has a pending join request.'));
});

test('only the current host can decide requests and rejection remains in history', () => {
  const engine = new GameplayTableEngine();
  const requested = engine.requestJoin(state(), {
    requestId: 'request-1',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedAt: '2026-07-25T18:01:00.000Z',
  });

  const deniedActor = engine.respondToJoinRequest(
    requested.state,
    'other-user',
    'request-1',
    'reject',
    '2026-07-25T18:02:00.000Z',
  );
  assert.equal(deniedActor.valid, false);
  assert.equal(deniedActor.state, requested.state);
  assert.ok(deniedActor.errors.includes('Only the current host can respond to join requests.'));

  const rejected = engine.respondToJoinRequest(
    requested.state,
    'host-user',
    'request-1',
    'reject',
    '2026-07-25T18:03:00.000Z',
  );
  assert.equal(rejected.valid, true, rejected.errors.join('\n'));
  assert.equal(rejected.state.seats.length, 1);
  assert.equal(rejected.state.joinRequests[0]?.status, 'rejected');
  assert.equal(rejected.state.joinRequests[0]?.resolvedBy, 'host-user');
});

test('accepting a request fails without partial mutation when its requested seat became occupied', () => {
  const engine = new GameplayTableEngine();
  const requested = engine.requestJoin(state(), {
    requestId: 'request-1',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedSeat: 2,
    requestedAt: '2026-07-25T18:01:00.000Z',
  });
  const opened = engine.updateSettings(requested.state, 'host-user', {
    joinPolicy: 'open',
  });
  const occupied = engine.joinOpenTable(opened.state, {
    userId: 'guest-2',
    displayName: 'Guest Two',
    requestedSeat: 2,
    joinedAt: '2026-07-25T18:02:00.000Z',
  });
  const approvalRestored = engine.updateSettings(occupied.state, 'host-user', {
    joinPolicy: 'approval-required',
  });

  const result = engine.respondToJoinRequest(
    approvalRestored.state,
    'host-user',
    'request-1',
    'accept',
    '2026-07-25T18:03:00.000Z',
  );

  assert.equal(result.valid, false);
  assert.equal(result.state, approvalRestored.state);
  assert.equal(result.state.seats.some((seat) => seat.userId === 'guest-1'), false);
  assert.equal(result.state.joinRequests[0]?.status, 'pending');
  assert.ok(result.errors.includes('Requested seat 2 is no longer available.'));
});

test('start is rejected until all pending requests are resolved', () => {
  const engine = new GameplayTableEngine();
  const requested = engine.requestJoin(state(), {
    requestId: 'request-1',
    userId: 'guest-1',
    displayName: 'Guest One',
    requestedAt: '2026-07-25T18:01:00.000Z',
  });

  const result = engine.start(
    requested.state,
    'host-user',
    '2026-07-25T18:02:00.000Z',
  );

  assert.equal(result.valid, false);
  assert.equal(result.state, requested.state);
  assert.ok(result.errors.includes('All pending join requests must be resolved before Start.'));
});
