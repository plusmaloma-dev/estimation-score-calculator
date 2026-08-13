import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const schema = readFileSync(
  'supabase/migrations/202607260009_gameplay_round_state.sql',
  'utf8',
);
const rpc = readFileSync(
  'supabase/migrations/202607260010_gameplay_round_rpc.sql',
  'utf8',
);
const auctionMigration = readFileSync(
  'supabase/migrations/202608100013_contract_auction.sql',
  'utf8',
);
const edge = readFileSync(
  'supabase/functions/gameplay-round-command/index.ts',
  'utf8',
);
const denoConfig = readFileSync('supabase/functions/deno.json', 'utf8');
const browserServices = readFileSync('src/app/services/createBrowserServices.ts', 'utf8');

function functionBlock(name: string): string {
  const match = rpc.match(new RegExp(
    `create or replace function public\\.${name}\\b([\\s\\S]*?)(?=create or replace function public\\.|$)`,
    'i',
  ));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}

test('round schema stores private aggregate, append-only commands, and public invalidations separately', () => {
  for (const table of [
    'gameplay_round_states',
    'gameplay_round_commands',
    'gameplay_round_invalidations',
  ]) {
    assert.match(schema, new RegExp(`create table public\\.${table}\\b`, 'i'));
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }

  assert.match(schema, /aggregate jsonb not null/i);
  assert.match(schema, /phase text not null[^;]*in \('bidding', 'playing', 'scored'\)/is);
  assert.match(schema, /unique \(table_id, command_id\)/i);
  assert.match(schema, /expected_version integer not null/i);
  assert.match(schema, /resulting_version integer not null/i);
  assert.match(schema, /accepted boolean not null/i);
  assert.match(schema, /errors jsonb not null default '\[\]'::jsonb/i);
  assert.match(schema, /transition jsonb not null default '\{\}'::jsonb/i);
});

test('private aggregate and command ledger have no authenticated read or write grant', () => {
  assert.doesNotMatch(schema, /create policy[\s\S]*gameplay_round_states/is);
  assert.doesNotMatch(schema, /create policy[\s\S]*gameplay_round_commands/is);
  assert.doesNotMatch(schema, /grant\s+(select|insert|update|delete|all)[^;]*gameplay_round_states/i);
  assert.doesNotMatch(schema, /grant\s+(select|insert|update|delete|all)[^;]*gameplay_round_commands/i);
  assert.match(schema, /gameplay_round_invalidations_scoped_select[\s\S]*can_view_gameplay_table\(table_id\)/i);
  assert.match(schema, /grant select on public\.gameplay_round_invalidations/i);
  assert.match(schema, /alter publication supabase_realtime add table public\.gameplay_round_invalidations/i);
});

test('private engine RPCs are security-definer, fixed-path, and service-role only', () => {
  for (const name of [
    'initialize_gameplay_round_state',
    'load_gameplay_round_for_engine',
    'commit_gameplay_round_command',
  ]) {
    const block = functionBlock(name);
    assert.match(block, /security definer/i);
    assert.match(block, /set search_path = public, pg_temp/i);
    assert.match(block, new RegExp(`revoke all on function public\\.${name}`, 'i'));
    assert.match(block, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`, 'i'));
    assert.doesNotMatch(block, /to authenticated/i);
  }
});

test('atomic commit enforces row locking, versions, idempotency, and accepted-only state mutation', () => {
  const commit = functionBlock('commit_gameplay_round_command');
  assert.match(commit, /for update/i);
  assert.match(commit, /gameplay_round_commands[\s\S]*command_id/i);
  assert.match(commit, /already used with a different payload/i);
  assert.match(commit, /current_state\.version is distinct from p_base_version/i);
  assert.match(commit, /p_resulting_version <> p_base_version \+ 1/i);
  assert.match(commit, /p_resulting_version <> p_base_version/i);
  assert.match(commit, /if p_accepted then[\s\S]*update public\.gameplay_round_states/i);
  assert.match(commit, /insert into public\.gameplay_round_invalidations/i);
});

test('Edge Function authenticates the user and keeps service-role access server-side', () => {
  assert.match(edge, /Deno\.serve/i);
  assert.match(edge, /authorization/i);
  assert.match(edge, /auth\.getUser\(\)/i);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(edge, /GameplayRoundApplicationService/i);
  assert.match(edge, /load_gameplay_round_for_engine/i);
  assert.match(edge, /commit_gameplay_round_auction_command/i);
  assert.match(auctionMigration, /commit_gameplay_round_auction_command[\s\S]*commit_gameplay_round_command/i);
  for (const action of ['snapshot', 'submit-auction-action', 'submit-bid', 'play-card']) {
    assert.match(edge, new RegExp(`['"]${action}['"]`, 'i'));
  }
  assert.doesNotMatch(browserServices, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('forward-only auction migration adds explicit public lifecycle phases without weakening private command isolation', () => {
  assert.match(auctionMigration, /phase in \('auction', 'estimate', 'bidding', 'playing', 'scored'\)/i);
  assert.match(auctionMigration, /initialize_gameplay_auction_round_state/i);
  assert.match(auctionMigration, /commit_gameplay_round_auction_command/i);
  assert.match(auctionMigration, /revoke all on function public\.commit_gameplay_round_auction_command/i);
  assert.match(auctionMigration, /grant execute on function public\.commit_gameplay_round_auction_command[\s\S]*to service_role/i);
});

test('Deno function configuration enables TypeScript engine import compatibility', () => {
  assert.match(denoConfig, /sloppy-imports/i);
  assert.match(denoConfig, /npm:@supabase\/supabase-js@2/i);
});
