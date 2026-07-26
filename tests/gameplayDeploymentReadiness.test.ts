import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const runbook = readFileSync('docs/GAMEPLAY_UAT_DEPLOYMENT.md', 'utf8');
const exampleEnvironment = readFileSync('.env.example', 'utf8');
const startFunction = readFileSync('supabase/functions/gameplay-start/index.ts', 'utf8');
const roundFunction = readFileSync('supabase/functions/gameplay-round-command/index.ts', 'utf8');

function expectText(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

test('gameplay deployment runbook uses the isolated branch and full validation gate', () => {
  assert.match(runbook, /feature\/online-game-bot-mvp/i);
  for (const command of [
    'git switch feature/online-game-bot-mvp',
    'npm ci',
    'npm run ci',
  ]) {
    assert.match(runbook, expectText(command));
  }
  assert.match(runbook, /Do not merge/i);
});

test('runbook dry-runs and applies all migrations before deploying functions', () => {
  const dryRun = runbook.indexOf('npx supabase db push --dry-run');
  const apply = runbook.indexOf('\nnpx supabase db push\n', dryRun + 1);
  const startDeploy = runbook.indexOf('npx supabase functions deploy gameplay-start');
  const roundDeploy = runbook.indexOf('npx supabase functions deploy gameplay-round-command');

  assert.ok(dryRun >= 0, 'Missing migration dry-run command.');
  assert.ok(apply > dryRun, 'Migration apply must follow the dry-run.');
  assert.ok(startDeploy > apply, 'Start Function deployment must follow migration apply.');
  assert.ok(roundDeploy > apply, 'Round Function deployment must follow migration apply.');

  for (const migration of [
    '202607230001_online_uat_schema.sql',
    '202607230002_online_uat_rls.sql',
    '202607230003_online_uat_rpc.sql',
    '202607230004_fix_rpc_column_ambiguity.sql',
    '202607250004_gameplay_tables.sql',
    '202607250005_gameplay_tables_rls.sql',
    '202607250006_gameplay_table_rpc.sql',
    '202607250007_active_game_control.sql',
    '202607250008_active_game_control_rpc.sql',
    '202607260009_gameplay_round_state.sql',
    '202607260010_gameplay_round_rpc.sql',
  ]) {
    assert.match(runbook, expectText(migration), `Missing migration ${migration}.`);
  }
});

test('runbook exposes only browser-safe preview variables and preserves authenticated functions', () => {
  for (const variable of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_UAT_WORKSPACE_SLUG',
  ]) {
    assert.match(exampleEnvironment, new RegExp(`^${variable}=`, 'm'));
    assert.match(runbook, new RegExp(`vercel env add ${variable} preview`, 'i'));
  }
  assert.doesNotMatch(runbook, /vercel env add .*service.role/i);
  assert.doesNotMatch(runbook, /VITE_.*SERVICE/i);
  assert.doesNotMatch(runbook, /--no-verify-jwt/i);
  assert.match(startFunction, /auth\.getUser\(\)/i);
  assert.match(roundFunction, /auth\.getUser\(\)/i);
});

test('runbook includes solo and multi-browser acceptance evidence without recording credentials', () => {
  for (const phrase of [
    'solo-versus-three-bots',
    'Start Game',
    'four estimates',
    '52 card actions',
    'scored round',
    'second browser profile',
    'disconnect',
    'temporary bot takeover',
    'reclaim',
    'pause',
    'terminate',
    'commit SHA',
    'UTC',
  ]) {
    assert.match(runbook, new RegExp(phrase, 'i'), `Missing smoke-test phrase: ${phrase}`);
  }
  assert.match(runbook, /Do not record passwords, tokens, keys, or database credentials/i);
});
