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
const nextRoundMigrationPath = 'supabase-gameplay/supabase/migrations/202607290011_active_round_next_round.sql';

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
    'npm run ci:isolation',
    'Do not merge',
  ]) {
    assert.match(runbook, expectText(phrase), `Missing isolation phrase: ${phrase}`);
  }
  assert.match(runbook, /never run.*score checkout/is);
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

test('next-round activation remains an additive database-only service boundary', () => {
  assert.equal(existsSync(nextRoundMigrationPath), true, 'Missing next-round activation migration.');
  const migration = readFileSync(nextRoundMigrationPath, 'utf8');

  assert.match(migration, /create or replace function public\.start_next_gameplay_round/i);
  assert.doesNotMatch(migration, /create table public\.gameplay_/i);
  assert.doesNotMatch(migration, /service_role.*key|authorization\s*:/i);
});

test('runbook verifies only the isolated gameplay migration workspace and guarded Functions', () => {
  assert.match(runbook, /npm run deploy:gameplay-migrations/i);
  assert.doesNotMatch(runbook, /^\s*npx\s+supabase\s+(?:--workdir\s+supabase-gameplay\s+)?db\s+push/im);
  assert.match(runbook, /migrations[\s\S]*gameplay-round-command[\s\S]*legalAuctionActions[\s\S]*legalBidOptions[\s\S]*frontend[\s\S]*fresh UAT table/is);
  assert.match(runbook, /gameplay-target-guard\.mjs[\s\S]*supabase \$newGameplayRef/i);
  assert.match(runbook, /supabase --workdir supabase-gameplay migration list --linked/i);
  assert.match(runbook, /deploy-gameplay-function\.mjs[\s\S]*gameplay-start/i);
  assert.match(runbook, /deploy-gameplay-function\.mjs[\s\S]*gameplay-round-command/i);
  assert.doesNotMatch(runbook, /^\s*npx\s+supabase\s+db\s+push/im);
  assert.doesNotMatch(runbook, /^\s*npx\s+supabase[^\r\n]*functions\s+deploy/im);

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
    '202607280010_fix_gameplay_start_seat_number_ambiguity.sql',
    '202607290011_active_round_next_round.sql',
    '202608080012_fix_gameplay_round_table_id_ambiguity.sql',
    '202608100013_contract_auction.sql',
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

test('runbook uses the separate Vercel project and guarded canonical-UAT deployment', () => {
  assert.match(runbook, /project inspect estimation-gameplay-uat/i);
  assert.match(runbook, /gameplay-target-guard\.mjs[\s\S]*vercel/i);
  assert.match(runbook, /npm run deploy:gameplay-vercel/i);
  assert.match(runbook, /GAMEPLAY_UAT_PUBLISHABLE_KEY/);
  assert.match(runbook, /--dry-run/);
  assert.match(runbook, /canonical-UAT|canonical UAT/i);
  assert.match(runbook, /--prod/);
  assert.doesNotMatch(runbook, /^\s*npx\s+vercel\s+env\s+run\b/im);
  assert.doesNotMatch(runbook, /^\s*npx\s+vercel\s+build\s+--local-config\b/im);
  assert.doesNotMatch(runbook, /^\s*npx\s+vercel\s+deploy\b/im);

  for (const variable of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_UAT_WORKSPACE_SLUG',
  ]) {
    assert.match(exampleEnvironment, new RegExp(`^${variable}=`, 'm'));
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
    'contract auction',
    'three consecutive post-contract passes',
    'four opening passes',
    'remaining three seats estimate',
    '52 card actions',
    'scored round',
    'separate browser profile',
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
  assert.match(runbook, /Never record passwords, tokens,[^\n]*database credentials/i);
});
