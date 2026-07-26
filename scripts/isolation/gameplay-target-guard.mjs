import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const EXPECTED_DIR = 'estimation-gameplay-uat';
const EXPECTED_BRANCH = 'feature/online-game-bot-mvp';
const EXPECTED_VERCEL_PROJECT = 'estimation-gameplay-uat';
const PROHIBITED_SUPABASE_REFS = new Set(['lexewcehptnmikwfizhj']);
const ALLOWED_LINK_METADATA = [
  '.vercel/',
  'supabase-gameplay/.temp/',
];

function fail(message) {
  console.error(`Gameplay target verification failed: ${message}`);
  process.exit(1);
}

function git(cwd, ...args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    fail(`Git verification could not run: ${detail}`);
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function verifyCheckout(expectedSha) {
  const root = resolve(process.cwd());
  if (basename(root).toLowerCase() !== EXPECTED_DIR) {
    fail(`Current directory must be ${EXPECTED_DIR}; received ${root}.`);
  }

  const branch = git(root, 'branch', '--show-current');
  if (branch !== EXPECTED_BRANCH) {
    fail(`Current branch must be ${EXPECTED_BRANCH}; received ${branch || '(detached)'}.`);
  }

  const sha = git(root, 'rev-parse', 'HEAD');
  if (expectedSha === undefined || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
    fail('A tested commit SHA must be supplied with --expected-sha.');
  }
  if (sha.toLowerCase() !== expectedSha.toLowerCase()) {
    fail(`Current SHA ${sha} does not match tested SHA ${expectedSha}.`);
  }

  const statusLines = git(root, 'status', '--porcelain', '--untracked-files=all')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => {
      const path = line.slice(3).replaceAll('\\', '/');
      return !ALLOWED_LINK_METADATA.some((prefix) => path.startsWith(prefix));
    });
  if (statusLines.length > 0) {
    fail(`Gameplay checkout must be clean before deployment. Found: ${statusLines.join(', ')}`);
  }

  return { root, branch, sha };
}

function verifySupabase(root, allowedRef) {
  if (allowedRef === undefined || allowedRef.trim().length === 0) {
    fail('An explicit allow-listed Supabase project reference is required.');
  }
  const normalizedAllowedRef = allowedRef.trim();
  if (PROHIBITED_SUPABASE_REFS.has(normalizedAllowedRef)) {
    fail(`Supabase project reference ${normalizedAllowedRef} is prohibited.`);
  }

  const projectRefPath = join(root, 'supabase-gameplay', '.temp', 'project-ref');
  if (!existsSync(projectRefPath)) {
    fail(`Missing Supabase project-ref file: ${projectRefPath}.`);
  }
  const linkedRef = readFileSync(projectRefPath, 'utf8').trim();
  if (PROHIBITED_SUPABASE_REFS.has(linkedRef)) {
    fail(`Linked Supabase project reference ${linkedRef} is prohibited.`);
  }
  if (linkedRef !== normalizedAllowedRef) {
    fail(`Linked Supabase reference ${linkedRef || '(empty)'} does not match allow-listed reference ${normalizedAllowedRef}.`);
  }

  console.log(`Supabase target verified: ${linkedRef}`);
}

function verifyVercel(root) {
  const projectPath = join(root, '.vercel', 'project.json');
  if (!existsSync(projectPath)) {
    fail(`Missing Vercel project.json: ${projectPath}.`);
  }

  let project;
  try {
    project = JSON.parse(readFileSync(projectPath, 'utf8'));
  } catch {
    fail(`Vercel project.json is not valid JSON: ${projectPath}.`);
  }
  if (project?.projectName !== EXPECTED_VERCEL_PROJECT) {
    fail(`Vercel project name must be ${EXPECTED_VERCEL_PROJECT}; received ${project?.projectName ?? '(missing)'}.`);
  }
  if (typeof project.projectId !== 'string' || project.projectId.trim().length === 0) {
    fail('Vercel project ID is missing.');
  }
  if (typeof project.orgId !== 'string' || project.orgId.trim().length === 0) {
    fail('Vercel organization ID is missing.');
  }

  console.log(`Vercel target verified: ${project.projectName}`);
}

const mode = process.argv[2];
if (mode !== 'supabase' && mode !== 'vercel') {
  fail('Usage: gameplay-target-guard.mjs <supabase|vercel> [allowed-ref] --expected-sha <sha>.');
}

const expectedSha = argument('--expected-sha');
const checkout = verifyCheckout(expectedSha);
if (mode === 'supabase') verifySupabase(checkout.root, process.argv[3]);
else verifyVercel(checkout.root);

console.log(`Checkout verified: ${checkout.branch}@${checkout.sha}`);
