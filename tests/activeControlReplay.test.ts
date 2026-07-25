import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveControlCommandProcessor,
  ActiveControlReplayService,
  ActiveGameControlEngine,
  GameplayTableEngine,
  type ActiveControlCommandEnvelope,
  type ActiveControlCommandRecord,
  type ActiveGameControlState,
} from '../src/index.js';

function initialState(): ActiveGameControlState {
  const tableEngine = new GameplayTableEngine();
  let table = tableEngine.create({
    tableId: 'control-replay-table',
    workspaceId: 'workspace-1',
    name: 'Control replay table',
    visibility: 'private',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T23:10:00.000Z',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });
  table = tableEngine.joinOpenTable(table, {
    userId: 'guest-user',
    displayName: 'Guest',
    requestedSeat: 2,
    joinedAt: '2026-07-25T23:10:30.000Z',
    privateAccessGranted: true,
  }).state;
  table = tableEngine.start(table, 'host-user', '2026-07-25T23:11:00.000Z').state;
  return new ActiveGameControlEngine().createFromStartedTable(
    table,
    '2026-07-25T23:11:00.000Z',
  );
}

function recordedSequence(): {
  readonly initial: ActiveGameControlState;
  readonly state: ActiveGameControlState;
  readonly version: number;
  readonly records: readonly ActiveControlCommandRecord[];
} {
  const processor = new ActiveControlCommandProcessor();
  const initial = initialState();
  let state = initial;
  let version = 0;
  let records: readonly ActiveControlCommandRecord[] = [];
  const commands: readonly ActiveControlCommandEnvelope[] = [
    {
      commandId: 'start-turn', expectedVersion: 0, actorUserId: 'host-user',
      occurredAt: '2026-07-25T23:12:00.000Z',
      command: { type: 'START_TURN', turnId: 'turn-1', seat: 0, actionKind: 'bid' },
    },
    {
      commandId: 'deadline', expectedVersion: 1, actorUserId: 'host-user',
      occurredAt: '2026-07-25T23:12:45.000Z',
      command: { type: 'EVALUATE_DEADLINE' },
    },
    {
      commandId: 'begin-bot', expectedVersion: 2, actorUserId: 'host-user',
      occurredAt: '2026-07-25T23:12:46.000Z',
      command: { type: 'BEGIN_BOT_ACTION', seat: 0, turnId: 'turn-1' },
    },
    {
      commandId: 'boundary', expectedVersion: 3, actorUserId: 'host-user',
      occurredAt: '2026-07-25T23:12:47.000Z',
      command: {
        type: 'COMPLETE_ACTION_BOUNDARY',
        nextTurn: { turnId: 'turn-2', seat: 1, actionKind: 'bid' },
      },
    },
  ];

  for (const envelope of commands) {
    const result = processor.process(state, version, records, envelope);
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
    version = result.version;
    records = result.records;
  }
  return { initial, state, version, records };
}

test('replay rebuilds the exact state, version, events, and directives', () => {
  const source = recordedSequence();

  const replay = new ActiveControlReplayService().replay(source.initial, source.records);

  assert.equal(replay.valid, true, replay.errors.join('\n'));
  assert.deepEqual(replay.state, source.state);
  assert.equal(replay.version, source.version);
  assert.equal(replay.recordsReplayed, source.records.length);
});

test('replay rejects an expected-version gap', () => {
  const source = recordedSequence();
  const tampered = source.records.map((record, index) => index === 2
    ? { ...record, expectedVersion: 9 }
    : record);

  const replay = new ActiveControlReplayService().replay(source.initial, tampered);

  assert.equal(replay.valid, false);
  assert.ok(replay.errors.some((error) => error.includes(
    'Control replay expected version 9 does not match replay version 2',
  )));
});

test('replay rejects duplicate accepted resulting versions', () => {
  const source = recordedSequence();
  const tampered = source.records.map((record, index) => index === 2
    ? { ...record, resultingVersion: 2 }
    : record);

  const replay = new ActiveControlReplayService().replay(source.initial, tampered);

  assert.equal(replay.valid, false);
  assert.ok(replay.errors.some((error) => error.includes(
    'Accepted control command begin-bot must advance replay version to 3',
  )));
});

test('replay detects altered transition state, events, or directives', () => {
  const source = recordedSequence();
  const alteredTransition = source.records.map((record, index) => index === 1
    ? {
        ...record,
        transition: {
          ...record.transition,
          state: {
            ...record.transition.state,
            turn: record.transition.state.turn === undefined
              ? undefined
              : { ...record.transition.state.turn, status: 'running' as const },
          },
        },
      }
    : record);
  const alteredEvents = source.records.map((record, index) => index === 1
    ? { ...record, events: [] }
    : record);
  const alteredDirectives = source.records.map((record, index) => index === 1
    ? { ...record, directives: [] }
    : record);

  for (const records of [alteredTransition, alteredEvents, alteredDirectives]) {
    const replay = new ActiveControlReplayService().replay(source.initial, records);
    assert.equal(replay.valid, false);
    assert.ok(replay.errors.some((error) => error.includes(
      'does not match the deterministic replay outcome',
    )));
  }
});

test('replay validates rejected command outcomes without advancing version', () => {
  const processor = new ActiveControlCommandProcessor();
  const initial = initialState();
  const rejected = processor.process(initial, 0, [], {
    commandId: 'non-host-pause',
    expectedVersion: 0,
    actorUserId: 'guest-user',
    occurredAt: '2026-07-25T23:12:00.000Z',
    command: { type: 'PAUSE' },
  });
  assert.equal(rejected.valid, false);

  const replay = new ActiveControlReplayService().replay(initial, rejected.records);

  assert.equal(replay.valid, true, replay.errors.join('\n'));
  assert.equal(replay.version, 0);
  assert.deepEqual(replay.state, initial);
});
