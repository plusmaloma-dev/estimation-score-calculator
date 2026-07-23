import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const runbook = readFileSync('docs/UAT_DEPLOYMENT.md', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  readonly framework?: string;
  readonly installCommand?: string;
  readonly buildCommand?: string;
  readonly outputDirectory?: string;
  readonly rewrites?: readonly { readonly source?: string; readonly destination?: string }[];
  readonly headers?: readonly {
    readonly source?: string;
    readonly headers?: readonly { readonly key?: string; readonly value?: string }[];
  }[];
};
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');

function tomlSection(name: string): string {
  const marker = `[${name}]`;
  const start = supabaseConfig.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${marker}`);
  const remainder = supabaseConfig.slice(start + marker.length);
  const nextSection = remainder.search(/^\[/m);
  return nextSection === -1 ? remainder : remainder.slice(0, nextSection);
}

test('Vercel builds the Vite SPA reproducibly and preserves client-side routes', () => {
  assert.equal(vercel.framework, 'vite');
  assert.equal(vercel.installCommand, 'npm ci');
  assert.equal(vercel.buildCommand, 'npm run build');
  assert.equal(vercel.outputDirectory, 'dist-app');
  assert.deepEqual(vercel.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);

  const responseHeaders = vercel.headers?.flatMap((rule) => rule.headers ?? []) ?? [];
  for (const requiredHeader of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options']) {
    assert.ok(responseHeaders.some((header) => header.key === requiredHeader), `Missing ${requiredHeader}`);
  }
});

test('the UAT runbook covers linking, migrations, workspace bootstrap, Admin membership, and branch deployment', () => {
  for (const command of [
    'npx supabase login',
    'npx supabase link --project-ref',
    'npx supabase db push --dry-run',
    'npx supabase db push',
    'npx vercel login',
    'npx vercel link',
    'npx vercel env add VITE_SUPABASE_URL preview',
    'npx vercel env add VITE_SUPABASE_ANON_KEY preview',
    'npx vercel env add VITE_UAT_WORKSPACE_SLUG preview',
    'npx vercel deploy',
  ]) {
    assert.match(runbook, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing command: ${command}`);
  }

  assert.match(runbook, /insert into public\.workspaces[\s\S]*on conflict \(slug\)/i);
  assert.match(runbook, /insert into public\.workspace_memberships[\s\S]*on conflict \(workspace_id, user_id\)/i);
  assert.match(runbook, /Authentication\s*>\s*Users[\s\S]*Add user/i);
  assert.match(runbook, /feature\/react-vite-frontend-prototype/i);
  assert.match(runbook, /Never[\s\S]*service_role/i);
});

test('timestamped Supabase migrations have deterministic one-way deployment ordering', () => {
  const migrations = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert.deepEqual(migrations, [
    '202607230001_online_uat_schema.sql',
    '202607230002_online_uat_rls.sql',
    '202607230003_online_uat_rpc.sql',
    '202607230004_fix_rpc_column_ambiguity.sql',
  ]);
  assert.match(runbook, /supabase_migrations\.schema_migrations/i);
  assert.match(runbook, /Do not edit a migration after it has been applied/i);
});

test('the committed Supabase project configuration keeps public registration disabled', () => {
  assert.match(supabaseConfig, /project_id = "estimation-score-calculator"/i);
  assert.match(tomlSection('db.migrations'), /\benabled = true\b/i);
  assert.match(tomlSection('db.seed'), /\benabled = false\b/i);
  assert.match(tomlSection('auth'), /\benable_signup = false\b/i);
  assert.match(tomlSection('auth.email'), /\benable_signup = false\b/i);
});

test('hosted CI installs the committed dependency lock exactly', () => {
  assert.match(workflow, /\brun:\s+npm ci\b/i);
  assert.doesNotMatch(workflow, /\brun:\s+npm install\b/i);
});
