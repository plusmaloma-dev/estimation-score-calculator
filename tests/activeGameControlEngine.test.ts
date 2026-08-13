import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveGameControlEngine,
  GameplayTableEngine,
  type ActiveGameControlState,
  type GameplayTableState,
} from '../src/index.js';

function startedTable(): GameplayTableState {
  const tableEngine = new GameplayTableEngine();
  let table = tableEngine.create({
    tableId: 'active-table',
    workspaceId: 'workspace-1',
    name: 'Active table',
    visibility: 'private',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T20:00:00.000Z',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });
  table = tableEngine.joinOpenTable(table, {
    userId: 'guest-user',
    displayName: 'Guest',
    joinedAt: '2026-07-25T20:01:00.000Z',
    requestedSeat: 2,
    privateAccessGranted: true,
  }).state;
  return tableEngine.start(table, 'host-user', '2026-07-25T20:02:00.000Z').state;
}

function stateWithRunningTimers(): ActiveGameControlState {
  const engine = new ActiveGameControlEngine();
  const state = engine.createFromStartedTable(
    startedTable(),
    '2026-07-25T20:02:00.000Z',
  );
  const mapped = state.seats.map((seat) => seat.seat === 2
    ? {
        ...seat,
        connection: 'disconnected' as const,
        disconnectedAt: '2026-07-25T20:01:50.000Z',
        graceDeadlineAt: '2026-07-25T20:02:50.000Z',
      }
    : seat);

  return {
    ...state,
    turn: {
      turnId: 'turn-1',
      seat: 0,
      actionKind: 'bid',
      startedAt: '2026-07-25T20:02:00.000Z',
      deadlineAt: '2026-07-25T20:02:45.000Z',
      status: 'running',
    },
    seats: [mapped[0]!, mapped[1]!, mapped[2]!, mapped[3]!],
  };
}

test('control initialization requires a started locked four-seat table', () => {
  const control = new ActiveGameControlEngine();
  const tableEngine = new GameplayTableEngine();
  const lobby = tableEngine.create({
    tableId: 'lobby-table',
    workspaceId: 'workspace-1',
    name: 'Lobby table',
    visibility: 'public',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T20:00:00.000Z',
  });

  assert.throws(
    () => control.createFromStartedTable(lobby, '2026-07-25T20:01:00.000Z'),
    /Active control requires a started and settings-locked gameplay table/,
  );
});

test('initialization creates connected human controls and permanent bot controls', () => {
  const control = new ActiveGameControlEngine();

  const state = control.createFromStartedTable(
    startedTable(),
    '2026-07-25T20:02:00.000Z',
  );

  assert.equal(state.lifecycle, 'active');
  assert.equal(state.hostUserId, 'host-user');
  assert.equal(state.turnTimerSeconds, 45);
  assert.equal(state.disconnectGraceSeconds, 60);
  assert.deepEqual(state.seats.map((seat) => seat.seat), [0, 1, 2, 3]);
  assert.equal(state.seats[0].connection, 'connected');
  assert.equal(state.seats[0].controlOwner, 'human');
  assert.equal(state.seats[1].connection, 'disconnected');
  assert.equal(state.seats[1].controlOwner, 'permanent-bot');
  assert.equal(state.seats[1].botId, 'standard-bot:active-table:1');
  assert.equal(state.seats[2].humanUserId, 'guest-user');
  assert.equal(state.seats[3].controlOwner, 'permanent-bot');
});

test('only the active host can pause, resume, and terminate', () => {
  const control = new ActiveGameControlEngine();
  const state = control.createFromStartedTable(
    startedTable(),
    '2026-07-25T20:02:00.000Z',
  );

  const pause = control.pause(state, 'guest-user', '2026-07-25T20:03:00.000Z');
  const resume = control.resume(state, 'guest-user', '2026-07-25T20:03:00.000Z');
  const terminate = control.terminate(
    state,
    'guest-user',
    true,
    '2026-07-25T20:03:00.000Z',
  );

  for (const result of [pause, resume, terminate]) {
    assert.equal(result.valid, false);
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
    assert.ok(result.errors.includes('Only the current host can perform this action.'));
  }
});

test('pause freezes exact turn and disconnect-grace durations', () => {
  const control = new ActiveGameControlEngine();
  const state = stateWithRunningTimers();

  const result = control.pause(
    state,
    'host-user',
    '2026-07-25T20:02:10.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.lifecycle, 'paused');
  assert.equal(result.state.pausedAt, '2026-07-25T20:02:10.000Z');
  assert.equal(result.state.turn?.deadlineAt, undefined);
  assert.equal(result.state.turn?.remainingMs, 35_000);
  assert.equal(result.state.seats[2].graceDeadlineAt, undefined);
  assert.equal(result.state.seats[2].graceRemainingMs, 40_000);
  assert.equal(state.turn?.deadlineAt, '2026-07-25T20:02:45.000Z');
  assert.equal(state.seats[2].graceDeadlineAt, '2026-07-25T20:02:50.000Z');
  assert.equal(result.events[0]?.type, 'game.paused');
});

test('resume reconstructs deadlines from the exact frozen durations', () => {
  const control = new ActiveGameControlEngine();
  const paused = control.pause(
    stateWithRunningTimers(),
    'host-user',
    '2026-07-25T20:02:10.000Z',
  ).state;

  const result = control.resume(
    paused,
    'host-user',
    '2026-07-25T20:05:00.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.lifecycle, 'active');
  assert.equal(result.state.pausedAt, undefined);
  assert.equal(result.state.turn?.deadlineAt, '2026-07-25T20:05:35.000Z');
  assert.equal(result.state.turn?.remainingMs, undefined);
  assert.equal(result.state.seats[2].graceDeadlineAt, '2026-07-25T20:05:40.000Z');
  assert.equal(result.state.seats[2].graceRemainingMs, undefined);
  assert.equal(result.events[0]?.type, 'game.resumed');
});

test('termination requires confirmation, records actor and time, and stops clocks', () => {
  const control = new ActiveGameControlEngine();
  const state = stateWithRunningTimers();

  const unconfirmed = control.terminate(
    state,
    'host-user',
    false,
    '2026-07-25T20:02:10.000Z',
  );
  assert.equal(unconfirmed.valid, false);
  assert.equal(unconfirmed.state, state);
  assert.ok(unconfirmed.errors.includes('Active-game termination requires explicit confirmation.'));

  const terminated = control.terminate(
    state,
    'host-user',
    true,
    '2026-07-25T20:02:10.000Z',
  );
  assert.equal(terminated.valid, true, terminated.errors.join('\n'));
  assert.equal(terminated.state.lifecycle, 'terminated');
  assert.equal(terminated.state.terminatedAt, '2026-07-25T20:02:10.000Z');
  assert.equal(terminated.state.terminatedBy, 'host-user');
  assert.equal(terminated.state.turn, undefined);
  assert.equal(terminated.state.seats[2].graceDeadlineAt, undefined);
  assert.equal(terminated.state.seats[2].graceRemainingMs, undefined);
  assert.equal(terminated.events[0]?.type, 'game.terminated');

  const pauseAfter = control.pause(
    terminated.state,
    'host-user',
    '2026-07-25T20:03:00.000Z',
  );
  const resumeAfter = control.resume(
    terminated.state,
    'host-user',
    '2026-07-25T20:03:00.000Z',
  );
  assert.equal(pauseAfter.valid, false);
  assert.equal(resumeAfter.valid, false);
  assert.ok(pauseAfter.errors.includes('Terminated games are read-only.'));
  assert.ok(resumeAfter.errors.includes('Terminated games are read-only.'));
});
