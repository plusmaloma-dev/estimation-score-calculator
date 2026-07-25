import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthSessionState } from '../src/online/auth/types.js';
import {
  OnlineGameplayTableService,
  type OnlineGameplayTableDatabase,
} from '../src/online/gameplay/OnlineGameplayTableService.js';

const session: AuthSessionState = {
  user: { id: 'user-1', email: 'tester@example.com' },
  membership: {
    workspaceId: 'workspace-1',
    workspaceSlug: 'estimation-uat',
    role: 'tester',
  },
};

type RpcResponse = Awaited<ReturnType<OnlineGameplayTableDatabase['rpc']>>;

function client(responses: Readonly<Record<string, readonly RpcResponse[]>>):
  OnlineGameplayTableDatabase & {
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
    workspaceId: 'workspace-1',
    name: 'Friday table',
    visibility: 'public',
    joinPolicy: 'open',
    lifecycle: 'lobby',
    hostUserId: 'user-1',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    settingsLocked: false,
    occupiedSeatCount: 1,
    version: 0,
    createdAt: '2026-07-25T20:00:00.000Z',
    seats: [],
    joinRequests: [],
    ...overrides,
  };
}

test('createTable validates input, injects the session boundary, and parses the authoritative snapshot', async () => {
  const database = client({
    create_gameplay_table: [{ data: snapshot(), error: null }],
  });
  const service = new OnlineGameplayTableService(database, session);

  const result = await service.createTable({
    commandId: 'create-command',
    name: '  Friday table  ',
    visibility: 'public',
    joinPolicy: 'open',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.tableId, 'table-1');
  assert.deepEqual(database.calls[0], {
    name: 'create_gameplay_table',
    args: {
      p_workspace_id: 'workspace-1',
      p_actor_user_id: 'user-1',
      p_command_id: 'create-command',
      p_name: 'Friday table',
      p_visibility: 'public',
      p_join_policy: 'open',
      p_turn_timer_seconds: 45,
      p_disconnect_grace_seconds: 60,
    },
  });
});

test('listLobby parses safe public cards and openTable parses a member snapshot', async () => {
  const lobbyCard = {
    tableId: 'table-1',
    name: 'Friday table',
    visibility: 'public',
    joinPolicy: 'approval-required',
    lifecycle: 'lobby',
    hostUserId: 'user-1',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    occupiedSeatCount: 2,
    version: 3,
  };
  const database = client({
    get_gameplay_lobby: [{ data: [lobbyCard], error: null }],
    get_gameplay_table_snapshot: [{ data: snapshot({ version: 3 }), error: null }],
  });
  const service = new OnlineGameplayTableService(database, session);

  const lobby = await service.listLobby();
  const opened = await service.openTable('table-1');

  assert.equal(lobby.valid, true, lobby.errors.join('\n'));
  assert.deepEqual(lobby.value, [lobbyCard]);
  assert.equal(opened.value?.version, 3);
  assert.deepEqual(database.calls.map((call) => call.name), [
    'get_gameplay_lobby',
    'get_gameplay_table_snapshot',
  ]);
});

test('mutating methods route command ids, expected versions, workspace, and actor to their RPCs', async () => {
  const ok = { data: snapshot({ version: 2 }), error: null } as const;
  const database = client({
    update_gameplay_table_settings: [ok],
    join_gameplay_table: [ok],
    request_gameplay_table_join: [ok],
    respond_gameplay_join_request: [ok],
    leave_gameplay_table: [ok],
    start_gameplay_table: [ok],
  });
  const service = new OnlineGameplayTableService(database, session);

  await service.updateSettings('table-1', 1, { turnTimerSeconds: 60 }, 'settings-command');
  await service.joinTable('table-1', 1, { displayName: 'Guest', requestedSeat: 2 }, 'join-command');
  await service.requestJoin(
    'table-1',
    1,
    { requestId: '11111111-1111-4111-8111-111111111111', displayName: 'Guest' },
    'request-command',
  );
  await service.respondJoinRequest(
    'table-1',
    1,
    '11111111-1111-4111-8111-111111111111',
    'accept',
    'respond-command',
  );
  await service.leaveTable('table-1', 1, 'leave-command');
  await service.startTable('table-1', 1, 'start-command');

  assert.deepEqual(database.calls.map((call) => call.name), [
    'update_gameplay_table_settings',
    'join_gameplay_table',
    'request_gameplay_table_join',
    'respond_gameplay_join_request',
    'leave_gameplay_table',
    'start_gameplay_table',
  ]);
  for (const call of database.calls) {
    assert.equal(call.args.p_table_id, 'table-1');
    assert.equal(call.args.p_workspace_id, 'workspace-1');
    assert.equal(call.args.p_actor_user_id, 'user-1');
    assert.equal(call.args.p_expected_version, 1);
  }
});

test('invalid client input fails before any database call', async () => {
  const database = client({});
  const service = new OnlineGameplayTableService(database, session);

  const invalidName = await service.createTable({
    commandId: 'create-command',
    name: '   ',
    visibility: 'public',
    joinPolicy: 'open',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
  });
  const invalidVersion = await service.startTable('table-1', -1, 'start-command');
  const invalidSeat = await service.joinTable(
    'table-1',
    0,
    { displayName: 'Guest', requestedSeat: 4 as never },
    'join-command',
  );

  assert.equal(invalidName.valid, false);
  assert.equal(invalidVersion.valid, false);
  assert.equal(invalidSeat.valid, false);
  assert.equal(database.calls.length, 0);
});

test('database errors and incomplete snapshots are never reported as success', async () => {
  const database = client({
    start_gameplay_table: [
      { data: null, error: { message: 'Expected table version does not match.' } },
      { data: { valid: true, tableId: 'table-1' }, error: null },
    ],
  });
  const service = new OnlineGameplayTableService(database, session);

  const databaseFailure = await service.startTable('table-1', 1, 'start-1');
  const incomplete = await service.startTable('table-1', 1, 'start-2');

  assert.equal(databaseFailure.valid, false);
  assert.deepEqual(databaseFailure.errors, ['Expected table version does not match.']);
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.includes('Gameplay table snapshot is incomplete.'));
});

test('a domain-rejected RPC payload preserves its server errors', async () => {
  const database = client({
    start_gameplay_table: [{
      data: {
        valid: false,
        errors: ['All pending join requests must be resolved before Start.'],
        tableId: 'table-1',
        version: 1,
      },
      error: null,
    }],
  });
  const service = new OnlineGameplayTableService(database, session);

  const result = await service.startTable('table-1', 1, 'start-command');

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['All pending join requests must be resolved before Start.']);
  assert.equal(result.value, undefined);
});
