import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const schema = readFileSync(
  'supabase/migrations/202607250004_gameplay_tables.sql',
  'utf8',
);
const rls = readFileSync(
  'supabase/migrations/202607250005_gameplay_tables_rls.sql',
  'utf8',
);
const rpc = readFileSync(
  'supabase/migrations/202607250006_gameplay_table_rpc.sql',
  'utf8',
);

test('gameplay schema defines isolated table, seat, request, command, and event entities', () => {
  for (const table of [
    'gameplay_tables',
    'gameplay_table_seats',
    'gameplay_join_requests',
    'gameplay_table_commands',
    'gameplay_table_events',
  ]) {
    assert.match(schema, new RegExp(`create table public\\.${table}\\b`, 'i'), `Missing ${table}`);
  }
  assert.match(schema, /references public\.workspaces\(id\)/i);
  assert.doesNotMatch(schema, /alter table public\.games/i);
});

test('schema enforces four seats, approved timer values, and exactly one human or bot identifier', () => {
  assert.match(schema, /seat_number smallint[^;]*between 1 and 4/is);
  assert.match(schema, /turn_timer_seconds[^;]*in \(20, 30, 45, 60, 90\)/is);
  assert.match(schema, /disconnect_grace_seconds[^;]*in \(30, 60, 90, 120\)/is);
  assert.match(schema, /seat_kind = 'human'[\s\S]*user_id is not null[\s\S]*bot_id is null/i);
  assert.match(schema, /seat_kind = 'bot'[\s\S]*user_id is null[\s\S]*bot_id is not null/i);
  assert.match(schema, /unique \(table_id, seat_number\)/i);
  assert.match(schema, /unique \(table_id, command_id\)/i);
});

test('RLS permits scoped reads and grants no direct authenticated gameplay writes', () => {
  for (const table of [
    'gameplay_tables',
    'gameplay_table_seats',
    'gameplay_join_requests',
    'gameplay_table_commands',
    'gameplay_table_events',
  ]) {
    assert.match(rls, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(rls, /function public\.can_view_gameplay_table/i);
  assert.match(rls, /visibility = 'public'/i);
  assert.match(rls, /has_workspace_role\([^)]*array\['admin'\]/i);
  assert.match(rls, /grant select on public\.gameplay_tables/i);
  assert.doesNotMatch(rls, /grant\s+(insert|update|delete|all)[^;]*gameplay_/i);
});

test('transactional migration exposes every approved gameplay table RPC', () => {
  for (const functionName of [
    'create_gameplay_table',
    'update_gameplay_table_settings',
    'join_gameplay_table',
    'request_gameplay_table_join',
    'respond_gameplay_join_request',
    'leave_gameplay_table',
    'start_gameplay_table',
    'get_gameplay_lobby',
    'get_gameplay_table_snapshot',
  ]) {
    assert.match(rpc, new RegExp(`function public\\.${functionName}\\b`, 'i'), `Missing ${functionName}`);
  }
});

test('security-definer RPCs bind the actor, fix search paths, and expose execute only explicitly', () => {
  assert.match(rpc, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(rpc, /auth\.uid\(\) is distinct from p_actor_user_id/i);
  assert.match(rpc, /revoke all on function public\./i);
  assert.match(rpc, /grant execute on function public\./i);
  assert.doesNotMatch(rpc, /service_role|supabase_service|eyJ[a-zA-Z0-9_-]{20,}/i);
});

test('mutating RPCs enforce versions, idempotency, lobby state, host authority, and permanent bot filling', () => {
  assert.match(rpc, /expected_version[^;]*does not match current version/i);
  assert.match(rpc, /gameplay_table_commands[\s\S]*command_id/i);
  assert.match(rpc, /already used with a different payload/i);
  assert.match(rpc, /table_row\.lifecycle <> 'lobby'/i);
  assert.match(rpc, /table_row\.host_user_id is distinct from p_actor_user_id/i);
  assert.match(rpc, /standard-bot:[^']*seat_number/i);
  assert.match(rpc, /settings_locked = true/i);
  assert.match(rpc, /status = 'pending'/i);
});

test('lobby and table snapshots contain approved sections without gameplay secrets', () => {
  for (const key of [
    'tableId',
    'name',
    'visibility',
    'joinPolicy',
    'lifecycle',
    'hostUserId',
    'turnTimerSeconds',
    'disconnectGraceSeconds',
    'occupiedSeatCount',
    'version',
    'seats',
    'joinRequests',
  ]) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'), `Snapshot is missing ${key}`);
  }
  assert.doesNotMatch(rpc, /'hands'|'seed'|'shuffledDeck'|'futureCards'|'botDecision'/i);
  assert.match(rpc, /order by seat\.seat_number/i);
  assert.match(rpc, /order by request\.requested_at,\s*request\.id/i);
});
