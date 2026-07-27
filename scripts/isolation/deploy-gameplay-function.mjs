import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const allowedFunctions = new Set(['gameplay-start', 'gameplay-round-command']);
const prohibitedRefs = new Set(['lexewcehptnmikwfizhj']);

function fail(message) {
  console.error(`Gameplay Function deployment failed: ${message}`);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  if (result.error !== undefined) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const functionName = process.argv[2];
const projectRef = process.argv[3]?.trim();
const expectedSha = argument('--expected-sha');

if (!allowedFunctions.has(functionName)) {
  fail('Function name must be gameplay-start or gameplay-round-command.');
}
if (projectRef === undefined || projectRef.length === 0) {
  fail('An explicit gameplay Supabase project reference is required.');
}
if (prohibitedRefs.has(projectRef)) {
  fail(`Supabase project reference ${projectRef} is prohibited.`);
}
if (expectedSha === undefined || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
  fail('A tested commit SHA must be supplied with --expected-sha.');
}

const guard = resolve('scripts/isolation/gameplay-target-guard.mjs');
const prepare = resolve('scripts/isolation/prepare-gameplay-functions.mjs');
const stagedConfig = resolve('supabase-gameplay-deploy', 'supabase', 'config.toml');
const stagedEntry = resolve(
  'supabase-gameplay-deploy',
  'supabase',
  'functions',
  functionName,
  'index.ts',
);

run(process.execPath, [guard, 'supabase', projectRef, '--expected-sha', expectedSha]);
run(process.execPath, [prepare]);
run(process.execPath, [guard, 'supabase', projectRef, '--expected-sha', expectedSha]);

if (!existsSync(stagedConfig) || !existsSync(stagedEntry)) {
  fail('Generated deployment workspace is incomplete.');
}
const config = readFileSync(stagedConfig, 'utf8');
const functionSection = new RegExp(
  `\\[functions\\.${functionName.replaceAll('-', '\\-')}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`,
  'i',
);
if (!functionSection.test(config)) {
  fail(`${functionName} must keep JWT verification enabled.`);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
run(npx, [
  'supabase',
  '--workdir',
  'supabase-gameplay-deploy',
  'functions',
  'deploy',
  functionName,
  '--project-ref',
  projectRef,
  '--use-api',
]);
