import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('supabase/migrations/202607230001_online_uat_schema.sql', 'utf8');
const rls = readFileSync('supabase/migrations/202607230002_online_uat_rls.sql', 'utf8');
const rpc = readFileSync('supabase/migrations/202607230003_online_uat_rpc.sql', 'utf8');
const rpcColumnFix = readFileSync('supabase/migrations/202607230004_fix_rpc_column_ambiguity.sql', 'utf8');

test('games persist the approved draft/finalized lifecycle and actor metadata', () => {
  assert.match(schema, /status text not null default 'draft' check \(status in \('draft', 'finalized'\)\)/i);
  assert.match(schema, /finalized_at timestamptz/i);
  assert.match(schema, /finalized_by uuid references auth\.users\(id\)/i);
  assert.doesNotMatch(schema, /status in \([^)]*'completed'/i);
});

test('transactional RPC migration defines game, snapshot, round, lifecycle, override, and lock operations', () => {
  for (const functionName of [
    'create_game', 'get_game_snapshot', 'save_game_round', 'override_round_scores', 'finalize_game', 'reopen_game',
    'acquire_game_lock', 'heartbeat_game_lock', 'release_game_lock', 'force_release_game_lock',
  ]) {
    assert.match(rpc, new RegExp(`function public\\.${functionName}\\b`, 'i'), `Missing RPC ${functionName}`);
  }
});

test('the game snapshot returns complete game, lifecycle, score, and override history', () => {
  assert.match(rpc, /function public\.get_game_snapshot[\s\S]*jsonb_build_object\([\s\S]*'game'/i);
  for (const key of ['players', 'rounds', 'bids', 'actuals', 'scores', 'overrides']) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'), `Snapshot is missing ${key}`);
  }
  for (const column of [
    'status', 'version', 'created_at', 'created_by', 'updated_at', 'updated_by',
    'finalized_at', 'finalized_by', 'calculated_score', 'applied_score',
  ]) {
    assert.match(rpc, new RegExp(`\\b${column}\\b`, 'i'), `Snapshot is missing ${column}`);
  }
  assert.match(rpc, /order by game_player\.seat_number/i);
  assert.match(rpc, /order by round_row\.round_number/i);
  assert.match(rpc, /order by score_override\.changed_at,\s*score_override\.id/i);
});

test('security-definer RPCs bind actor to auth.uid and fix their search path', () => {
  assert.match(rpc, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(rpc, /auth\.uid\(\) is distinct from p_actor_user_id/i);
  assert.match(rpc, /revoke all on function public\./i);
  assert.match(rpc, /grant execute on function public\./i);
});

test('completed writes and lifecycle transitions enforce locks, versions, and round 18', () => {
  assert.match(rpc, /game_row\.status <> 'draft'/i);
  assert.match(rpc, /game_row\.version <> p_expected_version/i);
  assert.match(rpc, /assert_active_game_lock/i);
  assert.match(rpc, /round_result->'scoreResult'->>'roundType'/i);
  assert.match(rpc, /count\(\*\)[\s\S]*from public\.rounds[\s\S]*< 18/i);
  assert.match(rpc, /game\.finalized/i);
  assert.match(rpc, /game\.reopened/i);
});

test('locks expire after 15 minutes and only Admins can force release', () => {
  assert.match(rpc, /interval '15 minutes'/i);
  assert.match(rpc, /has_workspace_role\([^)]*array\['admin'\]/i);
  assert.match(rpc, /get diagnostics released_count = row_count/i);
  assert.match(rpc, /jsonb_build_object\('released', released_count > 0\)/i);
  assert.match(rls, /game_locks_holder_delete/i);
});

test('game creation snapshots canonical directory names instead of trusting the client', () => {
  assert.match(rpc, /select display_name into canonical_player_name[\s\S]*from public\.players/i);
  assert.match(rpc, /player_name_snapshot\)[\s\S]*canonical_player_name/i);
  assert.doesNotMatch(rpc, /trim\(player_item->>'player_name_snapshot'\)/i);
});

test('round and override RPCs reject malformed or cross-game player payloads', () => {
  assert.match(rpc, /function public\.assert_exact_game_player_set/i);
  for (const payloadName of ['bids', 'actualResults']) {
    assert.match(
      rpc,
      new RegExp(`assert_exact_game_player_set\\([\\s\\S]*round_input->'${payloadName}'`, 'i'),
      `Missing exact game-player validation for ${payloadName}`,
    );
  }
  assert.match(rpc, /assert_exact_game_player_set\([\s\S]*score_items/i);
  assert.match(rpc, /withTargetPlayerId[\s\S]*Selected player is not part of this game/i);
  assert.match(rpc, /jsonb_typeof\(p_override_payload->'overridesByPlayerId'\)[\s\S]*At least one score override is required/i);
  assert.match(rpc, /current_score\.applied_score = override_entry\.value::integer[\s\S]*must change the applied score/i);
});

test('follow-up migration qualifies RPC columns that collide with table return names', () => {
  assert.match(
    rpcColumnFix,
    /function public\.acquire_game_lock[\s\S]*on conflict on constraint game_edit_locks_pkey/i,
  );
  assert.match(
    rpcColumnFix,
    /function public\.heartbeat_game_lock[\s\S]*where public\.game_edit_locks\.game_id = p_game_id[\s\S]*public\.game_edit_locks\.holder_user_id = p_actor_user_id/i,
  );
  assert.match(
    rpcColumnFix,
    /function public\.save_game_round[\s\S]*max\(existing_round\.round_number\)[\s\S]*existing_round\.game_id = p_game_id/i,
  );
  assert.match(
    rpcColumnFix,
    /function public\.finalize_game[\s\S]*from public\.rounds existing_round[\s\S]*existing_round\.game_id = p_game_id/i,
  );
  assert.doesNotMatch(rpcColumnFix, /on conflict \(game_id\)/i);
});
