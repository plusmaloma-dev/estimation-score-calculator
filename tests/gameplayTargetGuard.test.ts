import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const guard = resolve('scripts/isolation/gameplay-target-guard.mjs');
const expectedBranch = 'feature/online-game-bot-mvp';
const allowedRef = 'gameplayuatref12345678';
const prohibitedRef = 'lexewcehptnmikwfizhj';

interface Fixture {
  readonly root: string;
  readonly sha: string;
  cleanup(): void;
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture(name = 'estimation-gameplay-uat'): Fixture {
  const parent = mkdtempSync(join(tmpdir(), 'gameplay-guard-'));
  const root = join(parent, name);
  mkdirSync(root);
  git(root, 'init');
  git(root, 'config', 'user.email', 'guard@example.invalid');
  git(root, 'config', 'user.name', 'Gameplay Guard');
  writeFileSync(join(root, 'README.md'), 'guard fixture\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'fixture');
  git(root, 'branch', '-M', expectedBranch);
  return {
    root,
    sha: git(root, 'rev-parse', 'HEAD'),
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  };
}

function writeSupabaseRef(root: string, ref: string): void {
  const path = join(root, 'supabase-gameplay', 'supabase', '.temp');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'project-ref'), `${ref}\n`);
}

function writeVercelProject(root: string, projectName: string): void {
  const path = join(root, '.vercel');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'project.json'), JSON.stringify({
    orgId: 'team_test',
    projectId: 'prj_test',
    projectName,
  }));
}

function run(root: string, args: readonly string[]) {
  return spawnSync(process.execPath, [guard, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('guard rejects the wrong checkout directory', () => {
  const value = fixture('score-calculator-checkout');
  try {
    writeSupabaseRef(value.root, allowedRef);
    const result = run(value.root, ['supabase', allowedRef, '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /directory/i);
    assert.equal(basename(value.root), 'score-calculator-checkout');
  } finally {
    value.cleanup();
  }
});

test('guard rejects wrong branch and dirty checkout', () => {
  const value = fixture();
  try {
    writeSupabaseRef(value.root, allowedRef);
    git(value.root, 'branch', '-M', 'feature/react-vite-frontend-prototype');
    let result = run(value.root, ['supabase', allowedRef, '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /branch/i);

    git(value.root, 'branch', '-M', expectedBranch);
    writeFileSync(join(value.root, 'dirty.txt'), 'dirty');
    result = run(value.root, ['supabase', allowedRef, '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /clean/i);
  } finally {
    value.cleanup();
  }
});

test('guard rejects missing, mismatched, and prohibited Supabase references', () => {
  const value = fixture();
  try {
    let result = run(value.root, ['supabase', allowedRef, '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /project-ref/i);

    writeSupabaseRef(value.root, 'differentref123456789');
    result = run(value.root, ['supabase', allowedRef, '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /does not match/i);

    writeSupabaseRef(value.root, prohibitedRef);
    result = run(value.root, ['supabase', prohibitedRef, '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /prohibited/i);
  } finally {
    value.cleanup();
  }
});

test('guard accepts only the allow-listed gameplay Supabase reference and tested SHA', () => {
  const value = fixture();
  try {
    writeSupabaseRef(value.root, allowedRef);
    let result = run(value.root, ['supabase', allowedRef, '--expected-sha', '0000000000000000000000000000000000000000']);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /sha/i);

    result = run(value.root, ['supabase', allowedRef, '--expected-sha', value.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /supabase target verified/i);
  } finally {
    value.cleanup();
  }
});

test('guard rejects missing or wrong Vercel project and accepts the gameplay project', () => {
  const value = fixture();
  try {
    let result = run(value.root, ['vercel', '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /project\.json/i);

    writeVercelProject(value.root, 'estimation-score-calculator-uat');
    result = run(value.root, ['vercel', '--expected-sha', value.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /project name/i);

    writeVercelProject(value.root, 'estimation-gameplay-uat');
    result = run(value.root, ['vercel', '--expected-sha', value.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /vercel target verified/i);
  } finally {
    value.cleanup();
  }
});
