import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.gameplay.json', 'utf8')) as {
  readonly buildCommand?: string;
  readonly outputDirectory?: string;
};
const supabase = readFileSync('supabase-gameplay/supabase/config.toml', 'utf8');
const runbook = readFileSync('docs/GAMEPLAY_UAT_DEPLOYMENT.md', 'utf8');

function script(name: string): string {
  const value = packageJson.scripts?.[name];
  if (typeof value !== 'string') {
    throw new Error(`Missing package script ${name}.`);
  }
  return value;
}

test('aggregate isolation command covers every independent boundary', () => {
  const command = script('ci:isolation');
  for (const required of [
    'ci:score-engine',
    'test:gameplay-boundary',
    'test:isolation-static',
  ]) {
    assert.match(command, new RegExp(required.replaceAll(':', '\\:')));
  }

  const staticCommand = script('test:isolation-static');
  assert.match(staticCommand, /gameplayIsolationSpecification\.test\.js/i);
  assert.match(staticCommand, /gameplaySupabaseWorkspaceIsolation\.test\.js/i);
  assert.match(staticCommand, /gameplayTargetGuard\.test\.js/i);
  assert.match(staticCommand, /scoreUatBaseline\.test\.js/i);
  assert.match(staticCommand, /scoreEngineImportBoundary\.test\.js/i);
});

test('GitHub Actions runs the isolation gate after the complete package gate', () => {
  const packageIndex = workflow.indexOf('npm run ci');
  const isolationIndex = workflow.indexOf('npm run ci:isolation');
  assert.ok(packageIndex >= 0, 'Workflow does not run npm run ci.');
  assert.ok(isolationIndex > packageIndex, 'Isolation gate must run after the complete package gate.');
  assert.match(workflow, /name:\s*Validate isolation boundaries/i);
});

test('deployment artifacts and projects remain fully isolated', () => {
  assert.equal(vercel.buildCommand, 'npm run build:gameplay');
  assert.equal(vercel.outputDirectory, 'dist-gameplay');
  assert.match(supabase, /^project_id\s*=\s*"estimation-gameplay-uat"/m);
  assert.match(supabase, /\[functions\.gameplay-start\][\s\S]*verify_jwt\s*=\s*true/i);
  assert.match(supabase, /\[functions\.gameplay-round-command\][\s\S]*verify_jwt\s*=\s*true/i);
  assert.match(runbook, /estimation-gameplay-uat/i);
  assert.match(runbook, /lexewcehptnmikwfizhj/i);
  assert.match(runbook, /C:\\Users\\rjamm\\estimation-gameplay-uat/i);
});
