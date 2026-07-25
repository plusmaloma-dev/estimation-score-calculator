import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayTableEngine,
  type CreateGameplayTableInput,
  type DisconnectGraceSeconds,
  type GameplayTableState,
  type TurnTimerSeconds,
} from '../src/index.js';

function tableInput(
  overrides: Partial<CreateGameplayTableInput> = {},
): CreateGameplayTableInput {
  return {
    tableId: 'table-1',
    workspaceId: 'workspace-1',
    name: 'Friday Estimation',
    visibility: 'public',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T17:00:00.000Z',
    ...overrides,
  };
}

function createdState(
  overrides: Partial<CreateGameplayTableInput> = {},
): GameplayTableState {
  return new GameplayTableEngine().create(tableInput(overrides));
}

test('host creation seats one human and applies default timers', () => {
  const state = createdState();

  assert.equal(state.lifecycle, 'lobby');
  assert.equal(state.hostUserId, 'host-user');
  assert.equal(state.turnTimerSeconds, 45);
  assert.equal(state.disconnectGraceSeconds, 60);
  assert.equal(state.settingsLocked, false);
  assert.equal(state.seats.length, 1);
  assert.deepEqual(state.seats[0], {
    seat: 0,
    kind: 'human',
    userId: 'host-user',
    displayName: 'Host',
    joinedAt: '2026-07-25T17:00:00.000Z',
  });
});

test('open joining rejects duplicate users and occupied requested seats without mutation', () => {
  const engine = new GameplayTableEngine();
  const state = engine.create(tableInput());
  const joined = engine.joinOpenTable(state, {
    userId: 'guest-1',
    displayName: 'Guest One',
    joinedAt: '2026-07-25T17:01:00.000Z',
    requestedSeat: 2,
  });
  assert.equal(joined.valid, true, joined.errors.join('\n'));
  assert.equal(joined.state.seats.length, 2);
  assert.equal(joined.state.seats.find((seat) => seat.userId === 'guest-1')?.seat, 2);

  const duplicate = engine.joinOpenTable(joined.state, {
    userId: 'guest-1',
    displayName: 'Guest One Again',
    joinedAt: '2026-07-25T17:02:00.000Z',
  });
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.state, joined.state);
  assert.ok(duplicate.errors.includes('User guest-1 is already seated at this table.'));

  const occupied = engine.joinOpenTable(joined.state, {
    userId: 'guest-2',
    displayName: 'Guest Two',
    joinedAt: '2026-07-25T17:03:00.000Z',
    requestedSeat: 2,
  });
  assert.equal(occupied.valid, false);
  assert.equal(occupied.state, joined.state);
  assert.ok(occupied.errors.includes('Seat 2 is already occupied.'));
});

test('private tables require explicit private access before joining', () => {
  const engine = new GameplayTableEngine();
  const state = engine.create(tableInput({ visibility: 'private' }));

  const denied = engine.joinOpenTable(state, {
    userId: 'guest-1',
    displayName: 'Guest One',
    joinedAt: '2026-07-25T17:01:00.000Z',
  });
  assert.equal(denied.valid, false);
  assert.equal(denied.state, state);
  assert.ok(denied.errors.includes('Private table access has not been granted.'));

  const accepted = engine.joinOpenTable(state, {
    userId: 'guest-1',
    displayName: 'Guest One',
    joinedAt: '2026-07-25T17:01:00.000Z',
    privateAccessGranted: true,
  });
  assert.equal(accepted.valid, true, accepted.errors.join('\n'));
  assert.equal(accepted.state.seats.length, 2);
});

test('approval-required public tables reject direct open joining', () => {
  const engine = new GameplayTableEngine();
  const state = engine.create(tableInput({ joinPolicy: 'approval-required' }));

  const result = engine.joinOpenTable(state, {
    userId: 'guest-1',
    displayName: 'Guest One',
    joinedAt: '2026-07-25T17:01:00.000Z',
  });

  assert.equal(result.valid, false);
  assert.equal(result.state, state);
  assert.ok(result.errors.includes('This table requires host approval before joining.'));
});

test('only the host can change lobby settings and invalid timer values are rejected', () => {
  const engine = new GameplayTableEngine();
  const state = engine.create(tableInput());

  const nonHost = engine.updateSettings(state, 'guest-1', {
    turnTimerSeconds: 60,
  });
  assert.equal(nonHost.valid, false);
  assert.equal(nonHost.state, state);
  assert.ok(nonHost.errors.includes('Only the current host can update table settings.'));

  const invalid = engine.updateSettings(state, 'host-user', {
    turnTimerSeconds: 15 as TurnTimerSeconds,
    disconnectGraceSeconds: 45 as DisconnectGraceSeconds,
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.state, state);
  assert.ok(invalid.errors.includes('Turn timer must be one of 20, 30, 45, 60, or 90 seconds.'));
  assert.ok(invalid.errors.includes('Disconnect grace must be one of 30, 60, 90, or 120 seconds.'));

  const updated = engine.updateSettings(state, 'host-user', {
    name: 'Updated table',
    visibility: 'private',
    joinPolicy: 'approval-required',
    turnTimerSeconds: 60,
    disconnectGraceSeconds: 90,
  });
  assert.equal(updated.valid, true, updated.errors.join('\n'));
  assert.equal(updated.state.name, 'Updated table');
  assert.equal(updated.state.visibility, 'private');
  assert.equal(updated.state.joinPolicy, 'approval-required');
  assert.equal(updated.state.turnTimerSeconds, 60);
  assert.equal(updated.state.disconnectGraceSeconds, 90);
  assert.equal(state.name, 'Friday Estimation');
});

test('start fills every vacant seat with deterministic Standard bots and locks the lobby', () => {
  const engine = new GameplayTableEngine();
  const lobby = engine.create(tableInput());
  const withGuest = engine.joinOpenTable(lobby, {
    userId: 'guest-1',
    displayName: 'Guest One',
    joinedAt: '2026-07-25T17:01:00.000Z',
    requestedSeat: 2,
  }).state;

  const started = engine.start(withGuest, 'host-user', '2026-07-25T17:05:00.000Z');

  assert.equal(started.valid, true, started.errors.join('\n'));
  assert.equal(started.state.lifecycle, 'active');
  assert.equal(started.state.settingsLocked, true);
  assert.equal(started.state.seats.length, 4);
  assert.deepEqual(started.state.seats.map((seat) => seat.seat), [0, 1, 2, 3]);
  assert.deepEqual(
    started.state.seats.filter((seat) => seat.kind === 'bot').map((seat) => seat.botId),
    ['standard-bot:table-1:1', 'standard-bot:table-1:3'],
  );

  const lateJoin = engine.joinOpenTable(started.state, {
    userId: 'late-user',
    displayName: 'Late User',
    joinedAt: '2026-07-25T17:06:00.000Z',
  });
  assert.equal(lateJoin.valid, false);
  assert.equal(lateJoin.state, started.state);
  assert.ok(lateJoin.errors.includes('Players cannot join after the table has started.'));

  const lateSettings = engine.updateSettings(started.state, 'host-user', {
    turnTimerSeconds: 90,
  });
  assert.equal(lateSettings.valid, false);
  assert.equal(lateSettings.state, started.state);
  assert.ok(lateSettings.errors.includes('Table settings are locked after Start.'));
});

test('host leave transfers to the earliest joined human and the last human closes the table', () => {
  const engine = new GameplayTableEngine();
  let state = engine.create(tableInput());
  state = engine.joinOpenTable(state, {
    userId: 'guest-late',
    displayName: 'Guest Late',
    joinedAt: '2026-07-25T17:03:00.000Z',
    requestedSeat: 3,
  }).state;
  state = engine.joinOpenTable(state, {
    userId: 'guest-early',
    displayName: 'Guest Early',
    joinedAt: '2026-07-25T17:02:00.000Z',
    requestedSeat: 1,
  }).state;

  const hostLeft = engine.leaveLobby(state, 'host-user', '2026-07-25T17:04:00.000Z');
  assert.equal(hostLeft.valid, true, hostLeft.errors.join('\n'));
  assert.equal(hostLeft.state.hostUserId, 'guest-early');
  assert.equal(hostLeft.state.lifecycle, 'lobby');
  assert.equal(hostLeft.state.seats.some((seat) => seat.userId === 'host-user'), false);

  const earlyLeft = engine.leaveLobby(
    hostLeft.state,
    'guest-early',
    '2026-07-25T17:05:00.000Z',
  );
  assert.equal(earlyLeft.state.hostUserId, 'guest-late');

  const lastLeft = engine.leaveLobby(
    earlyLeft.state,
    'guest-late',
    '2026-07-25T17:06:00.000Z',
  );
  assert.equal(lastLeft.valid, true, lastLeft.errors.join('\n'));
  assert.equal(lastLeft.state.lifecycle, 'closed');
  assert.equal(lastLeft.state.hostUserId, undefined);
  assert.equal(lastLeft.state.seats.length, 0);
});
