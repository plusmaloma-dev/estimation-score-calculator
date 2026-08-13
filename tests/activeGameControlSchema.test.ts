import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const schema = readFileSync(
  'supabase/migrations/202607250007_active_game_control.sql',
  'utf8',
);
const rpc = readFileSync(
  'supabase/migrations/202607250008_active_game_control_rpc.sql',
  'utf8',
);

test('active-control schema defines control, seat, and idempotent command entities', () => {
  for (const table of [
    'gameplay_active_controls',
    'gameplay_active_seat_controls',
    'gameplay_active_control_commands',
  ]) {
    assert.match(schema, new RegExp(`create table public\\.${table}\\b`, 'i'), `Missing ${table}`);
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(schema, /table_id uuid primary key references public\.gameplay_tables\(id\)/i);
  assert.doesNotMatch(schema, /alter table public\.games/i);
});

test('schema constrains lifecycle, timers, seats, control ownership, and command identity', () => {
  assert.match(schema, /lifecycle[^;]*in \('active', 'paused', 'terminated'\)/is);
  assert.match(schema, /turn_timer_seconds[^;]*in \(20, 30, 45, 60, 90\)/is);
  assert.match(schema, /disconnect_grace_seconds[^;]*in \(30, 60, 90, 120\)/is);
  assert.match(schema, /seat_number smallint[^;]*between 1 and 4/is);
  assert.match(schema, /control_owner[^;]*in \('human', 'temporary-bot', 'permanent-bot'\)/is);
  assert.match(schema, /seat_kind = 'human'[\s\S]*human_user_id is not null[\s\S]*bot_id is null/i);
  assert.match(schema, /seat_kind = 'bot'[\s\S]*human_user_id is null[\s\S]*bot_id is not null/i);
  assert.match(schema, /unique \(table_id, command_id\)/i);
  assert.match(schema, /directives jsonb not null default '\[\]'::jsonb/i);
});

test('RLS allows scoped reads and grants no direct authenticated writes', () => {
  assert.match(schema, /using \(public\.can_view_gameplay_table\(table_id\)\)/i);
  assert.match(schema, /using \(public\.can_audit_gameplay_table\(table_id\)\)/i);
  assert.match(schema, /grant select on public\.gameplay_active_controls/i);
  assert.doesNotMatch(schema, /grant\s+(insert|update|delete|all)[^;]*gameplay_active_/i);
  assert.match(schema, /alter publication supabase_realtime add table public\.gameplay_active_controls/i);
  assert.match(schema, /alter publication supabase_realtime add table public\.gameplay_active_seat_controls/i);
});

test('authoritative migration exposes every approved active-control RPC', () => {
  for (const functionName of [
    'initialize_active_game_control',
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
    'get_active_game_control_snapshot',
  ]) {
    assert.match(rpc, new RegExp(`function public\\.${functionName}\\b`, 'i'), `Missing ${functionName}`);
  }
});

test('security-definer RPCs bind actor identity and use fixed search paths', () => {
  assert.match(rpc, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(rpc, /auth\.uid\(\) is distinct from p_actor_user_id/i);
  assert.match(rpc, /revoke all on function public\./i);
  assert.match(rpc, /grant execute on function public\./i);
  assert.doesNotMatch(rpc, /service_role|supabase_service|eyJ[a-zA-Z0-9_-]{20,}/i);
});

test('mutating RPCs enforce expected versions, command idempotency, lifecycle, and host authority', () => {
  assert.match(rpc, /expected active control version[^;]*does not match current version/i);
  assert.match(rpc, /gameplay_active_control_commands[\s\S]*command_id/i);
  assert.match(rpc, /already used with a different payload/i);
  assert.match(rpc, /control_row\.lifecycle = 'terminated'/i);
  assert.match(rpc, /control_row\.host_user_id is distinct from p_actor_user_id/i);
  assert.match(rpc, /version = version \+ 1/i);
  assert.match(rpc, /status = 'assistant-pending'/i);
  assert.match(rpc, /bot-action:%s:%s:%s/i);
});

test('connection and continuity SQL records host transfer, takeover, and reclaim rules', () => {
  assert.match(rpc, /order by seat\.connected_at, seat\.joined_at, seat\.seat_number/i);
  assert.match(rpc, /control_owner = 'temporary-bot'/i);
  assert.match(rpc, /reclaim_pending = true/i);
  assert.match(rpc, /event_type[^;]*host\.transferred/i);
  assert.match(rpc, /event_type[^;]*seat\.takeover/i);
  assert.match(rpc, /event_type[^;]*seat\.reclaimed/i);
});

test('safe snapshots and directives expose control metadata without card or deal secrets', () => {
  for (const key of [
    'tableId',
    'lifecycle',
    'hostUserId',
    'turnTimerSeconds',
    'disconnectGraceSeconds',
    'version',
    'turn',
    'seats',
    'pausedAt',
    'terminatedAt',
    'terminatedBy',
  ]) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'), `Snapshot missing ${key}`);
  }
  for (const key of ['directiveId', 'turnId', 'seat', 'actionKind', 'source', 'issuedAt']) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'), `Directive missing ${key}`);
  }
  assert.doesNotMatch(rpc, /'hands'|'seed'|'seedHex'|'shuffledDeck'|'futureCards'|'deckOrder'|'botDecision'/i);
  assert.match(rpc, /order by seat\.seat_number/i);
});
