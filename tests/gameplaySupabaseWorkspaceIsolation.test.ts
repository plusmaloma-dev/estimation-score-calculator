import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';

const workspace = join('supabase-gameplay', 'supabase');
const migrationsDirectory = join(workspace, 'migrations');
const configPath = join(workspace, 'config.toml');

const expectedMigrations = [
  '202607260001_gameplay_identity.sql',
  '202607260002_gameplay_identity_rls.sql',
  '202607260003_gameplay_tables.sql',
  '202607260004_gameplay_tables_rls.sql',
  '202607260005_gameplay_table_rpc.sql',
  '202607260006_active_game_control.sql',
  '202607260007_active_game_control_rpc.sql',
  '202607260008_gameplay_round_state.sql',
  '202607260009_gameplay_round_rpc.sql',
  '202607280010_fix_gameplay_start_seat_number_ambiguity.sql',
];

const forbiddenSql = [
  'create table public.players',
  'create table public.games',
  'create table public.game_players',
  'create table public.rounds',
  'create table public.round_bids',
  'create table public.round_actuals',
  'create table public.round_scores',
  'create table public.score_overrides',
  'create table public.game_edit_locks',
  'create or replace function public.create_game(',
  'create or replace function public.save_round(',
  'create or replace function public.get_game_snapshot(',
];

const requiredSql = [
  'create table public.workspaces',
  'create table public.profiles',
  'create table public.workspace_memberships',
  'create table public.gameplay_tables',
  'create table public.gameplay_table_seats',
  'create table public.gameplay_active_controls',
  'create table public.gameplay_round_states',
  'create or replace function public.start_gameplay_table',
  'create or replace function public.initialize_active_game_control',
  'create or replace function public.initialize_gameplay_round_state',
];

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').toLowerCase();
}

test('gameplay Supabase workspace has a dedicated ordered migration history', () => {
  assert.equal(existsSync(migrationsDirectory), true, 'Missing gameplay migration workspace.');
  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert.deepEqual(migrations, expectedMigrations);
});

test('gameplay migration history contains gameplay objects and excludes score-sheet persistence', () => {
  const sql = compact(expectedMigrations
    .map((name) => readFileSync(join(migrationsDirectory, name), 'utf8'))
    .join('\n'));

  for (const required of requiredSql) {
    assert.ok(sql.includes(required), `Missing required gameplay SQL: ${required}`);
  }
  for (const forbidden of forbiddenSql) {
    assert.equal(sql.includes(forbidden), false, `Forbidden score-sheet SQL: ${forbidden}`);
  }
});

test('gameplay Start migration disambiguates the bot-seat loop variable', () => {
  const correctionPath = join(
    migrationsDirectory,
    '202607280010_fix_gameplay_start_seat_number_ambiguity.sql',
  );
  assert.equal(existsSync(correctionPath), true, 'Missing gameplay Start ambiguity correction migration.');

  const sql = compact(readFileSync(correctionPath, 'utf8'));
  assert.ok(sql.includes('target_seat_number smallint'), 'Missing disambiguated Start loop variable.');
  assert.ok(sql.includes('for target_seat_number in 1..4 loop'));
  assert.ok(sql.includes('seat.seat_number = target_seat_number'));
  assert.equal(sql.includes('for seat_number in 1..4 loop'), false);
  assert.equal(sql.includes('seat.seat_number = seat_number'), false);
});

test('gameplay Supabase config is isolated and both functions require JWTs', () => {
  const config = readFileSync(configPath, 'utf8');
  assert.match(config, /^project_id\s*=\s*"estimation-gameplay-uat"/m);
  assert.match(config, /\[auth\][\s\S]*enable_signup\s*=\s*false/i);
  assert.match(config, /\[auth\][\s\S]*enable_anonymous_sign_ins\s*=\s*false/i);
  assert.match(config, /\[functions\.gameplay-start\][\s\S]*verify_jwt\s*=\s*true/i);
  assert.match(config, /\[functions\.gameplay-round-command\][\s\S]*verify_jwt\s*=\s*true/i);

  for (const path of [
    join(workspace, 'functions', 'deno.json'),
    join(workspace, 'functions', 'gameplay-start', 'index.ts'),
    join(workspace, 'functions', 'gameplay-round-command', 'index.ts'),
  ]) {
    assert.equal(existsSync(path), true, `Missing gameplay Function file: ${path}`);
  }
});
