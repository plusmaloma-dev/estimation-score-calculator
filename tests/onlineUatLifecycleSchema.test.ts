import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('supabase/migrations/202607230001_online_uat_schema.sql', 'utf8');
const rls = readFileSync('supabase/migrations/202607230002_online_uat_rls.sql', 'utf8');
const rpc = readFileSync('supabase/migrations/202607230003_online_uat_rpc.sql', 'utf8');

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

test('the game snapshot returns game, seats, rounds, bids, actuals, scores, and override history', () => {
  assert.match(rpc, /function public\.get_game_snapshot[\s\S]*jsonb_build_object\([\s\S]*'game'/i);
  for (const key of ['players', 'rounds', 'bids', 'actuals', 'scores', 'overrides']) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'), `Snapshot is missing ${key}`);
  }
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
  assert.match(rpc, /count\(\*\)[\s\S]*from public\.rounds[\s\S]*< 18/i);
  assert.match(rpc, /game\.finalized/i);
  assert.match(rpc, /game\.reopened/i);
});

test('locks expire after 15 minutes and only Admins can force release', () => {
  assert.match(rpc, /interval '15 minutes'/i);
  assert.match(rpc, /has_workspace_role\([^)]*array\['admin'\]/i);
  assert.match(rls, /game_locks_holder_delete/i);
});
