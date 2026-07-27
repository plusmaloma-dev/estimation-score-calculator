import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const runbook = readFileSync('docs/GAMEPLAY_UAT_DEPLOYMENT.md', 'utf8').replaceAll('\r\n', '\n');
const exampleEnvironment = readFileSync('.env.example', 'utf8');
const startFunctionPath = 'supabase-gameplay/supabase/functions/gameplay-start/index.ts';
const roundFunctionPath = 'supabase-gameplay/supabase/functions/gameplay-round-command/index.ts';
const startFunction = readFileSync(startFunctionPath, 'utf8');
const roundFunction = readFileSync(roundFunctionPath, 'utf8');

function expectText(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function relativeImports(source: string): readonly string[] {
  return Array.from(
    source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g),
    (match) => match[1],
  );
}

test('gameplay deployment runbook requires the dedicated checkout and complete validation gates', () => {
  for (const phrase of [
    'C:\\Users\\rjamm\\estimation-gameplay-uat',
    'feature/online-game-bot-mvp',
    'npm ci',
    'npm run ci',
    'npm run ci:score-engine',
    'npm run test:gameplay-boundary',
    'Do not merge',
  ]) {
    assert.match(runbook, expectText(phrase), `Missing isolation phrase: ${phrase}`);
  }
  assert.match(runbook, /never run.*score-calculator checkout/is);
  assert.match(runbook, /lexewcehptnmikwfizhj/i);
});

test('gameplay Functions have deployable dependency maps and resolvable local imports', () => {
  for (const functionPath of [startFunctionPath, roundFunctionPath]) {
    const functionDirectory = dirname(functionPath);
    const denoPath = resolve(functionDirectory, 'deno.json');
    assert.equal(existsSync(denoPath), true, `Missing per-Function deno.json: ${denoPath}`);

    const deno = JSON.parse(readFileSync(denoPath, 'utf8')) as {
      readonly imports?: Readonly<Record<string, string>>;
    };
    assert.match(
      deno.imports?.['@supabase/supabase-js'] ?? '',
      /^npm:@supabase\/supabase-js@2(?:\.|$)/,
      `${functionPath} must map @supabase/supabase-js to an npm specifier.`,
    );

    const source = readFileSync(functionPath, 'utf8');
    for (const specifier of relativeImports(source)) {
      const importedPath = resolve(functionDirectory, specifier);
      assert.equal(
        existsSync(importedPath),
        true,
        `${functionPath} imports missing local module ${specifier} (${importedPath}).`,
      );
    }
  }
});

test('runbook guards and applies only the gameplay migration workspace before deploying functions', () => {
  const guard = 'node scripts/isolation/gameplay-target-guard.mjs supabase';
  const dryRun = runbook.indexOf('npx supabase --workdir supabase-gameplay db push --dry-run');
  const apply = runbook.indexOf('\nnpx supabase --workdir supabase-gameplay db push\n', dryRun + 1);
  const startDeploy = runbook.indexOf('npx supabase --workdir supabase-gameplay functions deploy gameplay-start');
  const roundDeploy = runbook.indexOf('npx supabase --workdir supabase-gameplay functions deploy gameplay-round-command');

  assert.match(runbook, expectText(guard));
  assert.ok(dryRun >= 0, 'Missing gameplay migration dry-run command.');
  assert.ok(apply > dryRun, 'Gameplay migration apply must follow the dry-run.');
  assert.ok(startDeploy > apply, 'Start Function deployment must follow migration apply.');
  assert.ok(roundDeploy > apply, 'Round Function deployment must follow migration apply.');
  assert.doesNotMatch(runbook, /npx supabase db push/i);

  for (const migration of [
    '202607260001_gameplay_identity.sql',
    '202607260002_gameplay_identity_rls.sql',
    '202607260003_gameplay_tables.sql',
    '202607260004_gameplay_tables_rls.sql',
    '202607260005_gameplay_table_rpc.sql',
    '202607260006_active_game_control.sql',
    '202607260007_active_game_control_rpc.sql',
    '202607260008_gameplay_round_state.sql',
    '202607260009_gameplay_round_rpc.sql',
  ]) {
    assert.match(runbook, expectText(migration), `Missing migration ${migration}.`);
  }

  for (const forbidden of [
    '202607230001_online_uat_schema.sql',
    '202607230003_online_uat_rpc.sql',
    'create table public.players',
    'create table public.games',
  ]) {
    assert.doesNotMatch(runbook, expectText(forbidden));
  }
});

test('runbook links a separate Vercel project and exposes only browser-safe variables', () => {
  assert.match(runbook, /vercel link --project estimation-gameplay-uat/i);
  assert.match(runbook, /gameplay-target-guard\.mjs vercel/i);
  assert.match(runbook, /vercel build --local-config vercel\.gameplay\.json/i);
  assert.match(runbook, /vercel deploy --prebuilt --local-config vercel\.gameplay\.json/i);

  for (const variable of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_UAT_WORKSPACE_SLUG',
  ]) {
    assert.match(exampleEnvironment, new RegExp(`^${variable}=`, 'm'));
    assert.match(runbook, new RegExp(`vercel env add ${variable} preview`, 'i'));
  }
  assert.doesNotMatch(runbook, /vercel env add\s+VITE_[A-Z0-9_]*SERVICE/i);
  assert.doesNotMatch(runbook, /^VITE_[A-Z0-9_]*SERVICE[A-Z0-9_]*=/im);
  assert.doesNotMatch(runbook, /^\s*npx supabase[^\r\n]*--no-verify-jwt/im);
  assert.match(startFunction, /auth\.getUser\(\)/i);
  assert.match(roundFunction, /auth\.getUser\(\)/i);
});

test('runbook includes before-after protection evidence and hosted gameplay acceptance', () => {
  for (const phrase of [
    'score-uat-baseline.mjs before',
    'score-uat-baseline.mjs after',
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
