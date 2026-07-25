import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveControlCommandProcessor,
  ActiveGameControlEngine,
  GameplayTableEngine,
  type ActiveControlCommandEnvelope,
  type ActiveControlCommandRecord,
  type ActiveGameControlState,
} from '../src/index.js';

function initialState(): ActiveGameControlState {
  const tableEngine = new GameplayTableEngine();
  let table = tableEngine.create({
    tableId: 'control-command-table',
    workspaceId: 'workspace-1',
    name: 'Control command table',
    visibility: 'private',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T23:00:00.000Z',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });
  table = tableEngine.joinOpenTable(table, {
    userId: 'guest-user',
    displayName: 'Guest',
    requestedSeat: 2,
    joinedAt: '2026-07-25T23:00:30.000Z',
    privateAccessGranted: true,
  }).state;
  table = tableEngine.start(table, 'host-user', '2026-07-25T23:01:00.000Z').state;
  return new ActiveGameControlEngine().createFromStartedTable(
    table,
    '2026-07-25T23:01:00.000Z',
  );
}

function pauseEnvelope(
  commandId = 'pause-command',
  expectedVersion = 0,
): ActiveControlCommandEnvelope {
  return {
    commandId,
    expectedVersion,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:02:00.000Z',
    command: { type: 'PAUSE' },
  };
}

test('accepted control command increments once and records transition events', () => {
  const processor = new ActiveControlCommandProcessor();
  const state = initialState();

  const result = processor.process(state, 0, [], pauseEnvelope());

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.duplicate, false);
  assert.equal(result.version, 1);
  assert.equal(result.state.lifecycle, 'paused');
  assert.equal(result.records.length, 1);
  assert.equal(result.record?.accepted, true);
  assert.equal(result.record?.resultingVersion, 1);
  assert.deepEqual(result.record?.events.map((event) => event.type), ['game.paused']);
  assert.deepEqual(result.record?.directives, []);
});

test('same command id and envelope returns the original outcome without applying twice', () => {
  const processor = new ActiveControlCommandProcessor();
  const state = initialState();
  const envelope = pauseEnvelope();
  const first = processor.process(state, 0, [], envelope);

  const duplicate = processor.process(first.state, first.version, first.records, envelope);

  assert.equal(duplicate.valid, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.version, 1);
  assert.equal(duplicate.records.length, 1);
  assert.deepEqual(duplicate.record, first.record);
});

test('reusing a control command id with a different payload is rejected as an integrity conflict', () => {
  const processor = new ActiveControlCommandProcessor();
  const state = initialState();
  const first = processor.process(state, 0, [], pauseEnvelope());
  const conflicting: ActiveControlCommandEnvelope = {
    ...pauseEnvelope(),
    command: { type: 'TERMINATE', confirmed: true },
  };

  const result = processor.process(first.state, first.version, first.records, conflicting);

  assert.equal(result.valid, false);
  assert.equal(result.state, first.state);
  assert.equal(result.version, first.version);
  assert.equal(result.records, first.records);
  assert.ok(result.errors.includes(
    'Active control command id pause-command was already used with a different envelope.',
  ));
});

test('stale and domain-rejected commands are recorded without changing the authoritative version', () => {
  const processor = new ActiveControlCommandProcessor();
  const state = initialState();
  const paused = processor.process(state, 0, [], pauseEnvelope());

  const stale = processor.process(paused.state, paused.version, paused.records, {
    commandId: 'stale-command',
    expectedVersion: 0,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:00.000Z',
    command: { type: 'RESUME' },
  });
  assert.equal(stale.valid, false);
  assert.equal(stale.version, 1);
  assert.equal(stale.state, paused.state);
  assert.equal(stale.record?.accepted, false);
  assert.equal(stale.record?.resultingVersion, 1);
  assert.ok(stale.errors.includes(
    'Expected active control version 0 does not match current version 1.',
  ));

  const nonHost = processor.process(state, 0, [], {
    commandId: 'non-host-command',
    expectedVersion: 0,
    actorUserId: 'guest-user',
    occurredAt: '2026-07-25T23:02:00.000Z',
    command: { type: 'PAUSE' },
  });
  assert.equal(nonHost.valid, false);
  assert.equal(nonHost.version, 0);
  assert.equal(nonHost.state, state);
  assert.equal(nonHost.record?.accepted, false);
  assert.deepEqual(nonHost.record?.events, []);
  assert.ok(nonHost.errors.includes('Only the current host can perform this action.'));
});

test('deadline evaluation is a versioned exactly-once command with audited directives', () => {
  const processor = new ActiveControlCommandProcessor();
  let state = initialState();
  let version = 0;
  let records: readonly ActiveControlCommandRecord[] = [];

  const started = processor.process(state, version, records, {
    commandId: 'start-turn',
    expectedVersion: version,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:02:00.000Z',
    command: { type: 'START_TURN', turnId: 'turn-1', seat: 0, actionKind: 'bid' },
  });
  assert.equal(started.valid, true, started.errors.join('\n'));
  state = started.state;
  version = started.version;
  records = started.records;

  const evaluated = processor.process(state, version, records, {
    commandId: 'evaluate-deadline',
    expectedVersion: version,
    actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:02:45.000Z',
    command: { type: 'EVALUATE_DEADLINE' },
  });

  assert.equal(evaluated.valid, true, evaluated.errors.join('\n'));
  assert.equal(evaluated.version, 2);
  assert.equal(evaluated.state.turn?.status, 'assistant-pending');
  assert.equal(evaluated.record?.directives.length, 1);
  assert.deepEqual(evaluated.record?.directives[0], {
    directiveId: 'bot-action:control-command-table:turn-1:0',
    tableId: 'control-command-table',
    turnId: 'turn-1',
    seat: 0,
    actionKind: 'bid',
    source: 'timeout-assistant',
    issuedAt: '2026-07-25T23:02:45.000Z',
  });

  const duplicate = processor.process(
    evaluated.state,
    evaluated.version,
    evaluated.records,
    {
      commandId: 'evaluate-deadline-again',
      expectedVersion: evaluated.version,
      actorUserId: 'host-user',
      occurredAt: '2026-07-25T23:03:00.000Z',
      command: { type: 'EVALUATE_DEADLINE' },
    },
  );
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.version, 2);
  assert.deepEqual(duplicate.record?.directives, []);
  assert.ok(duplicate.errors.includes('No active deadline transition was produced.'));
});

test('processor routes connection, grace, bot-processing, boundary, resume, and termination commands', () => {
  const processor = new ActiveControlCommandProcessor();
  let state = initialState();
  let version = 0;
  let records: readonly ActiveControlCommandRecord[] = [];

  const run = (envelope: ActiveControlCommandEnvelope): void => {
    const result = processor.process(state, version, records, envelope);
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
    version = result.version;
    records = result.records;
  };

  run({
    commandId: 'disconnect', expectedVersion: 0, actorUserId: 'guest-user',
    occurredAt: '2026-07-25T23:02:00.000Z',
    command: { type: 'DISCONNECT', userId: 'guest-user' },
  });
  run({
    commandId: 'grace', expectedVersion: 1, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:00.000Z', command: { type: 'EVALUATE_GRACE' },
  });
  run({
    commandId: 'start-turn', expectedVersion: 2, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:01.000Z',
    command: { type: 'START_TURN', turnId: 'turn-guest', seat: 2, actionKind: 'card' },
  });
  run({
    commandId: 'evaluate-bot', expectedVersion: 3, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:01.000Z', command: { type: 'EVALUATE_DEADLINE' },
  });
  run({
    commandId: 'begin-bot', expectedVersion: 4, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:02.000Z',
    command: { type: 'BEGIN_BOT_ACTION', seat: 2, turnId: 'turn-guest' },
  });
  run({
    commandId: 'reconnect', expectedVersion: 5, actorUserId: 'guest-user',
    occurredAt: '2026-07-25T23:03:03.000Z',
    command: { type: 'RECONNECT', userId: 'guest-user' },
  });
  assert.equal(state.seats[2].controlOwner, 'temporary-bot');
  assert.equal(state.seats[2].reclaimPending, true);
  assert.equal(state.turn?.status, 'bot-processing');

  run({
    commandId: 'boundary', expectedVersion: 6, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:04.000Z',
    command: {
      type: 'COMPLETE_ACTION_BOUNDARY',
      nextTurn: { turnId: 'turn-next', seat: 2, actionKind: 'card' },
    },
  });
  assert.equal(state.seats[2].controlOwner, 'human');
  assert.equal(state.turn?.turnId, 'turn-next');

  run({
    commandId: 'pause', expectedVersion: 7, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:03:05.000Z', command: { type: 'PAUSE' },
  });
  run({
    commandId: 'resume', expectedVersion: 8, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:04:00.000Z', command: { type: 'RESUME' },
  });
  run({
    commandId: 'terminate', expectedVersion: 9, actorUserId: 'host-user',
    occurredAt: '2026-07-25T23:04:01.000Z',
    command: { type: 'TERMINATE', confirmed: true },
  });

  assert.equal(state.lifecycle, 'terminated');
  assert.equal(version, 10);
});
