import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthSessionState } from '../src/online/auth/types.js';
import {
  ActiveGameControlService,
  type ActiveGameControlDatabase,
} from '../src/online/gameplay/ActiveGameControlService.js';

const session: AuthSessionState = {
  user: { id: 'host-user', email: 'host@example.com' },
  membership: {
    workspaceId: 'workspace-1',
    workspaceSlug: 'estimation-uat',
    role: 'tester',
  },
};

type RpcResponse = Awaited<ReturnType<ActiveGameControlDatabase['rpc']>>;

function client(responses: Readonly<Record<string, readonly RpcResponse[]>>):
  ActiveGameControlDatabase & {
    readonly calls: { readonly name: string; readonly args: Readonly<Record<string, unknown>> }[];
  } {
  const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const indexes = new Map<string, number>();
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const index = indexes.get(name) ?? 0;
      indexes.set(name, index + 1);
      return responses[name]?.[index]
        ?? responses[name]?.[0]
        ?? { data: null, error: { message: `No fake response for ${name}` } };
    },
  };
}

function snapshot(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return {
    valid: true,
    errors: [],
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 2,
    turn: null,
    pausedAt: null,
    terminatedAt: null,
    terminatedBy: null,
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'host-user',
        botId: null,
        joinedAt: '2026-07-25T23:00:00.000Z',
        connectedAt: '2026-07-25T23:01:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        disconnectedAt: null,
        graceDeadlineAt: null,
        graceRemainingMs: null,
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'bot',
        humanUserId: null,
        botId: 'standard-bot:table-1:1',
        joinedAt: '2026-07-25T23:01:00.000Z',
        connectedAt: null,
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        disconnectedAt: null,
        graceDeadlineAt: null,
        graceRemainingMs: null,
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'bot',
        humanUserId: null,
        botId: 'standard-bot:table-1:2',
        joinedAt: '2026-07-25T23:01:00.000Z',
        connectedAt: null,
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        disconnectedAt: null,
        graceDeadlineAt: null,
        graceRemainingMs: null,
        reclaimPending: false,
      },
      {
        seat: 3,
        seatKind: 'bot',
        humanUserId: null,
        botId: 'standard-bot:table-1:3',
        joinedAt: '2026-07-25T23:01:00.000Z',
        connectedAt: null,
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        disconnectedAt: null,
        graceDeadlineAt: null,
        graceRemainingMs: null,
        reclaimPending: false,
      },
    ],
    events: [],
    directives: [],
    ...overrides,
  };
}

test('initialize and getSnapshot inject workspace/actor and parse strict snapshots', async () => {
  const database = client({
    initialize_active_game_control: [{ data: snapshot({ version: 0 }), error: null }],
    get_active_game_control_snapshot: [{ data: snapshot(), error: null }],
  });
  const service = new ActiveGameControlService(database, session);

  const initialized = await service.initialize(
    'table-1',
    'initialize-command',
    '2026-07-25T23:01:00.000Z',
  );
  const opened = await service.getSnapshot('table-1');

  assert.equal(initialized.valid, true, initialized.errors.join('\n'));
  assert.equal(initialized.value?.version, 0);
  assert.equal(opened.valid, true, opened.errors.join('\n'));
  assert.equal(opened.value?.seats.length, 4);
  assert.deepEqual(database.calls, [
    {
      name: 'initialize_active_game_control',
      args: {
        p_table_id: 'table-1',
        p_workspace_id: 'workspace-1',
        p_actor_user_id: 'host-user',
        p_command_id: 'initialize-command',
        p_occurred_at: '2026-07-25T23:01:00.000Z',
      },
    },
    {
      name: 'get_active_game_control_snapshot',
      args: {
        p_table_id: 'table-1',
        p_workspace_id: 'workspace-1',
        p_actor_user_id: 'host-user',
      },
    },
  ]);
});

test('mutating methods route expected version, command identity, actor, and occurrence time', async () => {
  const ok = { data: snapshot({ version: 3 }), error: null } as const;
  const database = client({
    pause_active_game: [ok],
    resume_active_game: [ok],
    terminate_active_game: [ok],
    disconnect_active_game_user: [ok],
    reconnect_active_game_user: [ok],
    evaluate_active_game_grace: [ok],
    evaluate_active_game_deadlines: [ok],
    start_active_game_turn: [ok],
    begin_active_bot_action: [ok],
    complete_active_action_boundary: [ok],
  });
  const service = new ActiveGameControlService(database, session);
  const at = '2026-07-25T23:02:00.000Z';

  await service.pause('table-1', 2, 'pause-command', at);
  await service.resume('table-1', 2, 'resume-command', at);
  await service.terminate('table-1', 2, true, 'terminate-command', at);
  await service.disconnect('table-1', 2, 'host-user', 'disconnect-command', at);
  await service.reconnect('table-1', 2, 'host-user', 'reconnect-command', at);
  await service.evaluateGrace('table-1', 2, 'grace-command', at);
  await service.evaluateDeadlines('table-1', 2, 'deadline-command', at);
  await service.startTurn(
    'table-1', 2, { turnId: 'turn-1', seat: 0, actionKind: 'bid' }, 'turn-command', at,
  );
  await service.beginBotAction(
    'table-1', 2, 'turn-1', 0, 'bot-command', at,
  );
  await service.completeActionBoundary(
    'table-1',
    2,
    { turnId: 'turn-2', seat: 1, actionKind: 'bid' },
    'boundary-command',
    at,
  );

  assert.deepEqual(database.calls.map((call) => call.name), [
    'pause_active_game',
    'resume_active_game',
    'terminate_active_game',
    'disconnect_active_game_user',
    'reconnect_active_game_user',
    'evaluate_active_game_grace',
    'evaluate_active_game_deadlines',
    'start_active_game_turn',
    'begin_active_bot_action',
    'complete_active_action_boundary',
  ]);
  for (const call of database.calls) {
    assert.equal(call.args.p_table_id, 'table-1');
    assert.equal(call.args.p_workspace_id, 'workspace-1');
    assert.equal(call.args.p_actor_user_id, 'host-user');
    assert.equal(call.args.p_expected_version, 2);
    assert.equal(call.args.p_occurred_at, at);
  }
});

test('deadline directives and events are parsed from an authoritative mutation response', async () => {
  const database = client({
    evaluate_active_game_deadlines: [{
      data: snapshot({
        version: 3,
        turn: {
          turnId: 'turn-1',
          seat: 0,
          actionKind: 'bid',
          startedAt: '2026-07-25T23:02:00.000Z',
          deadlineAt: '2026-07-25T23:02:45.000Z',
          remainingMs: null,
          status: 'assistant-pending',
        },
        events: [{
          type: 'turn.timeout-assistance',
          occurredAt: '2026-07-25T23:02:45.000Z',
          seat: 0,
          details: { turnId: 'turn-1' },
        }],
        directives: [{
          directiveId: 'bot-action:table-1:turn-1:0',
          tableId: 'table-1',
          turnId: 'turn-1',
          seat: 0,
          actionKind: 'bid',
          source: 'timeout-assistant',
          issuedAt: '2026-07-25T23:02:45.000Z',
        }],
      }),
      error: null,
    }],
  });
  const service = new ActiveGameControlService(database, session);

  const result = await service.evaluateDeadlines(
    'table-1', 2, 'deadline-command', '2026-07-25T23:02:45.000Z',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.events[0]?.type, 'turn.timeout-assistance');
  assert.equal(result.value?.directives[0]?.source, 'timeout-assistant');
});

test('invalid inputs fail before the database boundary', async () => {
  const database = client({});
  const service = new ActiveGameControlService(database, session);

  const invalidTable = await service.pause('', 0, 'command', '2026-07-25T23:02:00.000Z');
  const invalidVersion = await service.pause('table-1', -1, 'command', '2026-07-25T23:02:00.000Z');
  const invalidTime = await service.pause('table-1', 0, 'command', 'not-a-time');
  const invalidSeat = await service.startTurn(
    'table-1', 0, { turnId: 'turn-1', seat: 4 as never, actionKind: 'bid' },
    'command', '2026-07-25T23:02:00.000Z',
  );

  assert.equal(invalidTable.valid, false);
  assert.equal(invalidVersion.valid, false);
  assert.equal(invalidTime.valid, false);
  assert.equal(invalidSeat.valid, false);
  assert.equal(database.calls.length, 0);
});

test('database errors, domain rejection, and incomplete snapshots never report success', async () => {
  const database = client({
    pause_active_game: [
      { data: null, error: { message: 'network failure' } },
      {
        data: {
          valid: false,
          errors: ['Only the current host can perform this action.'],
          tableId: 'table-1',
          version: 2,
        },
        error: null,
      },
      { data: { valid: true, tableId: 'table-1' }, error: null },
    ],
  });
  const service = new ActiveGameControlService(database, session);
  const at = '2026-07-25T23:02:00.000Z';

  const databaseFailure = await service.pause('table-1', 2, 'c1', at);
  const rejection = await service.pause('table-1', 2, 'c2', at);
  const incomplete = await service.pause('table-1', 2, 'c3', at);

  assert.deepEqual(databaseFailure.errors, ['network failure']);
  assert.deepEqual(rejection.errors, ['Only the current host can perform this action.']);
  assert.ok(incomplete.errors.includes('Active-game control snapshot is incomplete.'));
});
