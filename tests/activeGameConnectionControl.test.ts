import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveGameControlEngine,
  GameplayTableEngine,
  type ActiveGameControlState,
  type GameplayTableState,
} from '../src/index.js';

function startedTable(humanCount: 1 | 2 | 3 = 3): GameplayTableState {
  const tableEngine = new GameplayTableEngine();
  let table = tableEngine.create({
    tableId: 'connection-table',
    workspaceId: 'workspace-1',
    name: 'Connection table',
    visibility: 'private',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T21:00:00.000Z',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });
  if (humanCount >= 2) {
    table = tableEngine.joinOpenTable(table, {
      userId: 'guest-early',
      displayName: 'Guest Early',
      joinedAt: '2026-07-25T21:00:30.000Z',
      requestedSeat: 2,
      privateAccessGranted: true,
    }).state;
  }
  if (humanCount >= 3) {
    table = tableEngine.joinOpenTable(table, {
      userId: 'guest-late',
      displayName: 'Guest Late',
      joinedAt: '2026-07-25T21:01:00.000Z',
      requestedSeat: 3,
      privateAccessGranted: true,
    }).state;
  }
  return tableEngine.start(table, 'host-user', '2026-07-25T21:02:00.000Z').state;
}

function controlState(humanCount: 1 | 2 | 3 = 3): ActiveGameControlState {
  return new ActiveGameControlEngine().createFromStartedTable(
    startedTable(humanCount),
    '2026-07-25T21:02:00.000Z',
  );
}

test('disconnect starts grace once and records the human seat event', () => {
  const engine = new ActiveGameControlEngine();
  const state = controlState();

  const result = engine.disconnect(
    state,
    'guest-early',
    '2026-07-25T21:03:00.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.seats[2].connection, 'disconnected');
  assert.equal(result.state.seats[2].controlOwner, 'human');
  assert.equal(result.state.seats[2].disconnectedAt, '2026-07-25T21:03:00.000Z');
  assert.equal(result.state.seats[2].graceDeadlineAt, '2026-07-25T21:04:00.000Z');
  assert.equal(result.events[0]?.type, 'seat.disconnected');

  const duplicate = engine.disconnect(
    result.state,
    'guest-early',
    '2026-07-25T21:03:10.000Z',
  );
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.state, result.state);
  assert.ok(duplicate.errors.includes('User guest-early is already disconnected.'));
});

test('active host disconnect transfers immediately to the longest-connected human', () => {
  const engine = new ActiveGameControlEngine();
  const state = controlState();
  const connected = state.seats.map((seat) => {
    if (seat.humanUserId === 'guest-early') {
      return { ...seat, connectedAt: '2026-07-25T21:00:30.000Z' };
    }
    if (seat.humanUserId === 'guest-late') {
      return { ...seat, connectedAt: '2026-07-25T21:01:00.000Z' };
    }
    return seat;
  });
  const orderedState: ActiveGameControlState = {
    ...state,
    seats: [connected[0]!, connected[1]!, connected[2]!, connected[3]!],
  };

  const result = engine.disconnect(
    orderedState,
    'host-user',
    '2026-07-25T21:03:00.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.hostUserId, 'guest-early');
  assert.deepEqual(result.events.map((event) => event.type), [
    'seat.disconnected',
    'host.transferred',
  ]);

  const reconnected = engine.reconnect(
    result.state,
    'host-user',
    '2026-07-25T21:03:20.000Z',
  );
  assert.equal(reconnected.state.hostUserId, 'guest-early');
});

test('last human disconnect keeps host identity while starting seat grace', () => {
  const engine = new ActiveGameControlEngine();
  const state = controlState(1);

  const result = engine.disconnect(
    state,
    'host-user',
    '2026-07-25T21:03:00.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.hostUserId, 'host-user');
  assert.equal(result.state.seats[0].connection, 'disconnected');
  assert.equal(result.events.some((event) => event.type === 'host.transferred'), false);
});

test('grace expiry transfers temporary control to a Standard bot', () => {
  const engine = new ActiveGameControlEngine();
  const disconnected = engine.disconnect(
    controlState(),
    'guest-early',
    '2026-07-25T21:03:00.000Z',
  ).state;

  const before = engine.evaluateGrace(
    disconnected,
    '2026-07-25T21:03:59.999Z',
  );
  assert.equal(before.valid, true);
  assert.equal(before.state, disconnected);
  assert.deepEqual(before.events, []);

  const expired = engine.evaluateGrace(
    disconnected,
    '2026-07-25T21:04:00.000Z',
  );
  assert.equal(expired.valid, true, expired.errors.join('\n'));
  assert.equal(expired.state.seats[2].controlOwner, 'temporary-bot');
  assert.equal(expired.state.seats[2].graceDeadlineAt, undefined);
  assert.equal(expired.events[0]?.type, 'seat.takeover');
  assert.equal(expired.events[0]?.seat, 2);
});

test('reconnect during grace cancels takeover and restores connected human state', () => {
  const engine = new ActiveGameControlEngine();
  const disconnected = engine.disconnect(
    controlState(),
    'guest-early',
    '2026-07-25T21:03:00.000Z',
  ).state;

  const result = engine.reconnect(
    disconnected,
    'guest-early',
    '2026-07-25T21:03:30.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.seats[2].connection, 'connected');
  assert.equal(result.state.seats[2].controlOwner, 'human');
  assert.equal(result.state.seats[2].reclaimPending, false);
  assert.equal(result.state.seats[2].graceDeadlineAt, undefined);
  assert.equal(result.state.seats[2].disconnectedAt, undefined);
  assert.equal(result.events[0]?.type, 'seat.reconnected');
});

test('reconnect after takeover waits for the next safe uncommitted boundary', () => {
  const engine = new ActiveGameControlEngine();
  let state = engine.disconnect(
    controlState(),
    'guest-early',
    '2026-07-25T21:03:00.000Z',
  ).state;
  state = engine.evaluateGrace(state, '2026-07-25T21:04:00.000Z').state;
  state = {
    ...state,
    turn: {
      turnId: 'turn-current',
      seat: 2,
      actionKind: 'card',
      startedAt: '2026-07-25T21:04:00.000Z',
      deadlineAt: '2026-07-25T21:04:45.000Z',
      status: 'assistant-pending',
    },
  };
  state = engine.beginBotAction(
    state,
    2,
    'turn-current',
    '2026-07-25T21:04:01.000Z',
  ).state;

  const reconnected = engine.reconnect(
    state,
    'guest-early',
    '2026-07-25T21:04:02.000Z',
  );
  assert.equal(reconnected.state.seats[2].connection, 'connected');
  assert.equal(reconnected.state.seats[2].controlOwner, 'temporary-bot');
  assert.equal(reconnected.state.seats[2].reclaimPending, true);
  assert.equal(reconnected.state.turn?.status, 'bot-processing');

  const otherSeatBoundary = engine.completeActionBoundary(
    reconnected.state,
    {
      turnId: 'turn-other',
      seat: 3,
      actionKind: 'card',
      occurredAt: '2026-07-25T21:04:03.000Z',
    },
    '2026-07-25T21:04:03.000Z',
  );
  assert.equal(otherSeatBoundary.state.seats[2].controlOwner, 'temporary-bot');
  assert.equal(otherSeatBoundary.state.seats[2].reclaimPending, true);

  const reclaimBoundary = engine.completeActionBoundary(
    otherSeatBoundary.state,
    {
      turnId: 'turn-reclaim',
      seat: 2,
      actionKind: 'card',
      occurredAt: '2026-07-25T21:04:10.000Z',
    },
    '2026-07-25T21:04:10.000Z',
  );
  assert.equal(reclaimBoundary.state.seats[2].controlOwner, 'human');
  assert.equal(reclaimBoundary.state.seats[2].reclaimPending, false);
  assert.equal(reclaimBoundary.state.turn?.seat, 2);
  assert.equal(reclaimBoundary.state.turn?.status, 'running');
  assert.equal(reclaimBoundary.events.some((event) => event.type === 'seat.reclaimed'), true);
});

test('permanent bot seats cannot disconnect, reconnect, or be reclaimed', () => {
  const engine = new ActiveGameControlEngine();
  const state = controlState();

  const disconnect = engine.disconnect(
    state,
    'standard-bot:connection-table:1',
    '2026-07-25T21:03:00.000Z',
  );
  const reconnect = engine.reconnect(
    state,
    'standard-bot:connection-table:1',
    '2026-07-25T21:03:00.000Z',
  );

  assert.equal(disconnect.valid, false);
  assert.equal(reconnect.valid, false);
  assert.ok(disconnect.errors.includes('Human user standard-bot:connection-table:1 is not seated.'));
  assert.ok(reconnect.errors.includes('Human user standard-bot:connection-table:1 is not seated.'));
});
