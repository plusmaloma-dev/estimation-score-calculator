import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayTableCommandProcessor,
  GameplayTableEngine,
  type GameplayTableCommandEnvelope,
  type GameplayTableCommandRecord,
  type GameplayTableState,
} from '../src/index.js';

function openTable(): GameplayTableState {
  return new GameplayTableEngine().create({
    tableId: 'command-table',
    workspaceId: 'workspace-1',
    name: 'Command table',
    visibility: 'public',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T19:00:00.000Z',
  });
}

function updateCommand(
  commandId = 'command-1',
  expectedVersion = 0,
): GameplayTableCommandEnvelope {
  return {
    commandId,
    expectedVersion,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T19:01:00.000Z',
    command: {
      type: 'UPDATE_SETTINGS',
      patch: { turnTimerSeconds: 60 },
    },
  };
}

test('accepted table command increments version once and appends an audit record', () => {
  const processor = new GameplayTableCommandProcessor();
  const state = openTable();

  const result = processor.process(state, 0, [], updateCommand());

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.duplicate, false);
  assert.equal(result.version, 1);
  assert.equal(result.state.turnTimerSeconds, 60);
  assert.equal(result.records.length, 1);
  assert.equal(result.record?.accepted, true);
  assert.equal(result.record?.resultingVersion, 1);
});

test('same table command id and envelope returns the original outcome without applying twice', () => {
  const processor = new GameplayTableCommandProcessor();
  const state = openTable();
  const envelope = updateCommand();
  const first = processor.process(state, 0, [], envelope);

  const duplicate = processor.process(first.state, first.version, first.records, envelope);

  assert.equal(duplicate.valid, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.version, 1);
  assert.equal(duplicate.state.turnTimerSeconds, 60);
  assert.equal(duplicate.records.length, 1);
  assert.deepEqual(duplicate.record, first.record);
});

test('reusing a table command id with a different payload is an integrity conflict', () => {
  const processor = new GameplayTableCommandProcessor();
  const state = openTable();
  const first = processor.process(state, 0, [], updateCommand());
  const conflicting: GameplayTableCommandEnvelope = {
    ...updateCommand(),
    command: {
      type: 'UPDATE_SETTINGS',
      patch: { turnTimerSeconds: 90 },
    },
  };

  const result = processor.process(first.state, first.version, first.records, conflicting);

  assert.equal(result.valid, false);
  assert.equal(result.version, first.version);
  assert.equal(result.state, first.state);
  assert.equal(result.records, first.records);
  assert.ok(result.errors.includes('Table command id command-1 was already used with a different envelope.'));
});

test('stale expected version is recorded without changing state or version', () => {
  const processor = new GameplayTableCommandProcessor();
  const state = openTable();
  const first = processor.process(state, 0, [], updateCommand());

  const stale = processor.process(first.state, first.version, first.records, {
    commandId: 'command-2',
    expectedVersion: 0,
    actorUserId: 'guest-1',
    occurredAt: '2026-07-25T19:02:00.000Z',
    command: {
      type: 'JOIN_OPEN',
      input: { displayName: 'Guest One', requestedSeat: 2 },
    },
  });

  assert.equal(stale.valid, false);
  assert.equal(stale.version, 1);
  assert.equal(stale.state, first.state);
  assert.equal(stale.records.length, 2);
  assert.equal(stale.record?.accepted, false);
  assert.equal(stale.record?.resultingVersion, 1);
  assert.ok(stale.errors.includes('Expected table version 0 does not match current version 1.'));
});

test('domain-rejected command is recorded and does not increment the table version', () => {
  const processor = new GameplayTableCommandProcessor();
  const state = openTable();

  const result = processor.process(state, 0, [], {
    commandId: 'non-host-settings',
    expectedVersion: 0,
    actorUserId: 'guest-1',
    occurredAt: '2026-07-25T19:01:00.000Z',
    command: {
      type: 'UPDATE_SETTINGS',
      patch: { turnTimerSeconds: 90 },
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.version, 0);
  assert.equal(result.state, state);
  assert.equal(result.records.length, 1);
  assert.equal(result.record?.accepted, false);
  assert.ok(result.errors.includes('Only the current host can update table settings.'));
});

test('processor routes join request, host response, leave, and start commands', () => {
  const processor = new GameplayTableCommandProcessor();
  const engine = new GameplayTableEngine();
  let state = engine.create({
    tableId: 'approval-command-table',
    workspaceId: 'workspace-1',
    name: 'Approval command table',
    visibility: 'public',
    joinPolicy: 'approval-required',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T19:00:00.000Z',
  });
  let version = 0;
  let records: readonly GameplayTableCommandRecord[] = [];

  const requested = processor.process(state, version, records, {
    commandId: 'request-command',
    expectedVersion: version,
    actorUserId: 'guest-1',
    occurredAt: '2026-07-25T19:01:00.000Z',
    command: {
      type: 'REQUEST_JOIN',
      input: { requestId: 'request-1', displayName: 'Guest One', requestedSeat: 2 },
    },
  });
  assert.equal(requested.valid, true, requested.errors.join('\n'));
  state = requested.state;
  version = requested.version;
  records = requested.records;

  const accepted = processor.process(state, version, records, {
    commandId: 'accept-command',
    expectedVersion: version,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T19:02:00.000Z',
    command: {
      type: 'RESPOND_JOIN_REQUEST',
      requestId: 'request-1',
      decision: 'accept',
    },
  });
  assert.equal(accepted.valid, true, accepted.errors.join('\n'));
  assert.equal(accepted.state.seats.some((seat) => seat.userId === 'guest-1'), true);
  state = accepted.state;
  version = accepted.version;
  records = accepted.records;

  const left = processor.process(state, version, records, {
    commandId: 'leave-command',
    expectedVersion: version,
    actorUserId: 'guest-1',
    occurredAt: '2026-07-25T19:03:00.000Z',
    command: { type: 'LEAVE_LOBBY' },
  });
  assert.equal(left.valid, true, left.errors.join('\n'));
  assert.equal(left.state.seats.some((seat) => seat.userId === 'guest-1'), false);
  state = left.state;
  version = left.version;
  records = left.records;

  const started = processor.process(state, version, records, {
    commandId: 'start-command',
    expectedVersion: version,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T19:04:00.000Z',
    command: { type: 'START' },
  });
  assert.equal(started.valid, true, started.errors.join('\n'));
  assert.equal(started.state.lifecycle, 'active');
  assert.equal(started.state.seats.length, 4);
  assert.equal(started.version, 4);
});
