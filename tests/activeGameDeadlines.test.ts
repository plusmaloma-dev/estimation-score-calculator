import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveGameControlEngine,
  ActiveGameDeadlineService,
  GameplayTableEngine,
  type ActiveGameControlState,
} from '../src/index.js';

function baseState(): ActiveGameControlState {
  const tableEngine = new GameplayTableEngine();
  let table = tableEngine.create({
    tableId: 'deadline-table',
    workspaceId: 'workspace-1',
    name: 'Deadline table',
    visibility: 'private',
    joinPolicy: 'open',
    hostUserId: 'host-user',
    hostDisplayName: 'Host',
    createdAt: '2026-07-25T22:00:00.000Z',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });
  table = tableEngine.joinOpenTable(table, {
    userId: 'guest-user',
    displayName: 'Guest',
    requestedSeat: 2,
    joinedAt: '2026-07-25T22:00:30.000Z',
    privateAccessGranted: true,
  }).state;
  table = tableEngine.start(table, 'host-user', '2026-07-25T22:01:00.000Z').state;
  return new ActiveGameControlEngine().createFromStartedTable(
    table,
    '2026-07-25T22:01:00.000Z',
  );
}

test('starting a turn creates the configured deadline', () => {
  const engine = new ActiveGameControlEngine();

  const result = engine.startTurn(baseState(), {
    turnId: 'turn-1',
    seat: 0,
    actionKind: 'bid',
    occurredAt: '2026-07-25T22:02:00.000Z',
  });

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.state.turn?.deadlineAt, '2026-07-25T22:02:45.000Z');
  assert.equal(result.state.turn?.status, 'running');
  assert.equal(result.events[0]?.type, 'turn.started');
});

test('evaluation before a connected human deadline emits no directive', () => {
  const engine = new ActiveGameControlEngine();
  const service = new ActiveGameDeadlineService();
  const state = engine.startTurn(baseState(), {
    turnId: 'turn-1',
    seat: 0,
    actionKind: 'bid',
    occurredAt: '2026-07-25T22:02:00.000Z',
  }).state;

  const result = service.evaluate(state, '2026-07-25T22:02:44.999Z');

  assert.equal(result.state, state);
  assert.deepEqual(result.directives, []);
  assert.deepEqual(result.events, []);
});

test('connected human expiry emits exactly one timeout-assistant directive', () => {
  const engine = new ActiveGameControlEngine();
  const service = new ActiveGameDeadlineService();
  const state = engine.startTurn(baseState(), {
    turnId: 'turn-1',
    seat: 0,
    actionKind: 'bid',
    occurredAt: '2026-07-25T22:02:00.000Z',
  }).state;

  const expired = service.evaluate(state, '2026-07-25T22:02:45.000Z');

  assert.equal(expired.state.turn?.status, 'assistant-pending');
  assert.deepEqual(expired.directives, [{
    directiveId: 'bot-action:deadline-table:turn-1:0',
    tableId: 'deadline-table',
    turnId: 'turn-1',
    seat: 0,
    actionKind: 'bid',
    source: 'timeout-assistant',
    issuedAt: '2026-07-25T22:02:45.000Z',
  }]);
  assert.equal(expired.events[0]?.type, 'turn.timeout-assistance');

  const duplicate = service.evaluate(expired.state, '2026-07-25T22:03:00.000Z');
  assert.equal(duplicate.state, expired.state);
  assert.deepEqual(duplicate.directives, []);
  assert.deepEqual(duplicate.events, []);
});

test('disconnected human during grace still receives one-turn timeout assistance', () => {
  const engine = new ActiveGameControlEngine();
  const service = new ActiveGameDeadlineService();
  let state = engine.disconnect(
    baseState(),
    'guest-user',
    '2026-07-25T22:02:00.000Z',
  ).state;
  state = engine.startTurn(state, {
    turnId: 'turn-guest',
    seat: 2,
    actionKind: 'card',
    occurredAt: '2026-07-25T22:02:05.000Z',
  }).state;

  const result = service.evaluate(state, '2026-07-25T22:02:50.000Z');

  assert.equal(result.directives[0]?.source, 'timeout-assistant');
  assert.equal(result.directives[0]?.seat, 2);
  assert.equal(result.state.seats[2].controlOwner, 'human');
});

test('temporary and permanent bot turns emit immediate source-specific directives', () => {
  const engine = new ActiveGameControlEngine();
  const service = new ActiveGameDeadlineService();
  let temporary = engine.disconnect(
    baseState(),
    'guest-user',
    '2026-07-25T22:02:00.000Z',
  ).state;
  temporary = engine.evaluateGrace(
    temporary,
    '2026-07-25T22:03:00.000Z',
  ).state;
  temporary = engine.startTurn(temporary, {
    turnId: 'turn-temporary',
    seat: 2,
    actionKind: 'card',
    occurredAt: '2026-07-25T22:03:01.000Z',
  }).state;

  const temporaryResult = service.evaluate(
    temporary,
    '2026-07-25T22:03:01.000Z',
  );
  assert.equal(temporaryResult.directives[0]?.source, 'disconnect-substitute');

  const permanent = engine.startTurn(baseState(), {
    turnId: 'turn-permanent',
    seat: 1,
    actionKind: 'card',
    occurredAt: '2026-07-25T22:03:01.000Z',
  }).state;
  const permanentResult = service.evaluate(
    permanent,
    '2026-07-25T22:03:01.000Z',
  );
  assert.equal(permanentResult.directives[0]?.source, 'permanent-bot');
  assert.equal(permanentResult.state.turn?.status, 'assistant-pending');
});

test('paused and terminated games emit no directives', () => {
  const engine = new ActiveGameControlEngine();
  const service = new ActiveGameDeadlineService();
  const running = engine.startTurn(baseState(), {
    turnId: 'turn-1',
    seat: 0,
    actionKind: 'bid',
    occurredAt: '2026-07-25T22:02:00.000Z',
  }).state;
  const paused = engine.pause(
    running,
    'host-user',
    '2026-07-25T22:02:10.000Z',
  ).state;
  const terminated = engine.terminate(
    running,
    'host-user',
    true,
    '2026-07-25T22:02:10.000Z',
  ).state;

  assert.deepEqual(service.evaluate(paused, '2026-07-25T23:00:00.000Z').directives, []);
  assert.deepEqual(service.evaluate(terminated, '2026-07-25T23:00:00.000Z').directives, []);
});

test('a timeout assistant controls one action only and the next human turn is normal', () => {
  const engine = new ActiveGameControlEngine();
  const service = new ActiveGameDeadlineService();
  let state = engine.startTurn(baseState(), {
    turnId: 'turn-timeout',
    seat: 0,
    actionKind: 'card',
    occurredAt: '2026-07-25T22:02:00.000Z',
  }).state;
  state = service.evaluate(state, '2026-07-25T22:02:45.000Z').state;
  state = engine.beginBotAction(
    state,
    0,
    'turn-timeout',
    '2026-07-25T22:02:46.000Z',
  ).state;

  const next = engine.completeActionBoundary(
    state,
    {
      turnId: 'turn-next-human',
      seat: 0,
      actionKind: 'card',
      occurredAt: '2026-07-25T22:03:00.000Z',
    },
    '2026-07-25T22:03:00.000Z',
  );

  assert.equal(next.state.seats[0].controlOwner, 'human');
  assert.equal(next.state.turn?.status, 'running');
  assert.deepEqual(
    service.evaluate(next.state, '2026-07-25T22:03:10.000Z').directives,
    [],
  );
});
