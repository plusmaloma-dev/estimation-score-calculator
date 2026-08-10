import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const wrapper = resolve('scripts/isolation/deploy-gameplay-migrations.mjs');
const guard = resolve('scripts/isolation/gameplay-target-guard.mjs');
const gameplayRef = 'stedjwppoanbmhxsfhcg';
const scoreRef = 'lexewcehptnmikwfizhj';
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
  '202607290011_active_round_next_round.sql',
  '202608080012_fix_gameplay_round_table_id_ambiguity.sql',
];

function version(name) {
  return name.slice(0, 12);
}

function migrationList(remoteVersions) {
  const remote = new Set(remoteVersions);
  return [
    'Local | Remote | Time (UTC)',
    '------|--------|-----------',
    ...expectedMigrations.map((name) => `${version(name)} | ${remote.has(version(name)) ? version(name) : ''} |`),
  ].join('\n');
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function createFakeNpx(bin) {
  const fake = join(bin, 'fake-npx.mjs');
  writeFileSync(fake, `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const statePath = process.env.GAMEPLAY_MIGRATION_FAKE_STATE;
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
appendFileSync(state.log, JSON.stringify(args) + '\\n');
const action = args.includes('migration') ? 'list' : args.includes('db') ? 'push' : 'unknown';
const response = state.responses.shift();
writeFileSync(statePath, JSON.stringify(state));
if (response?.action !== action) process.exit(91);
if (response?.stdout) process.stdout.write(response.stdout);
if (response?.stderr) process.stderr.write(response.stderr);
process.exit(response?.status ?? 0);
`);
  writeFileSync(join(bin, 'npx.cmd'), `@echo off\r\nnode "${fake}" %*\r\n`);
}

function createFixture(responses) {
  const parent = mkdtempSync(join(tmpdir(), 'gameplay-migration-deploy-'));
  const root = join(parent, 'estimation-gameplay-uat');
  const bin = join(parent, 'bin');
  mkdirSync(root);
  mkdirSync(join(root, 'scripts', 'isolation'), { recursive: true });
  mkdirSync(join(root, 'supabase-gameplay', 'supabase', 'migrations'), { recursive: true });
  mkdirSync(join(root, 'supabase-gameplay', 'supabase', '.temp'), { recursive: true });
  mkdirSync(bin);
  cpSync(guard, join(root, 'scripts', 'isolation', 'gameplay-target-guard.mjs'));
  for (const migration of expectedMigrations) {
    writeFileSync(join(root, 'supabase-gameplay', 'supabase', 'migrations', migration), '-- fixture migration\n');
  }
  writeFileSync(join(root, 'supabase-gameplay', 'supabase', '.temp', 'project-ref'), `${gameplayRef}\n`);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, 'init');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Gameplay fixture');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  git(root, 'branch', '-M', 'feature/online-game-bot-mvp');
  const sha = git(root, 'rev-parse', 'HEAD');
  const statePath = join(parent, 'fake-state.json');
  const log = join(parent, 'fake-npx.log');
  writeFileSync(statePath, JSON.stringify({ log, responses }));
  createFakeNpx(bin);
  return {
    root,
    sha,
    log,
    run(args, extraEnvironment = {}) {
      const environment = { ...process.env, ...extraEnvironment };
      delete environment.PATH;
      delete environment.Path;
      environment.Path = `${bin};${process.env.Path ?? process.env.PATH ?? ''}`;
      return spawnSync(process.execPath, [wrapper, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...environment,
          GAMEPLAY_MIGRATION_FAKE_STATE: statePath,
        },
      });
    },
    calls() {
      try {
        return readFileSync(log, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
      } catch {
        return [];
      }
    },
    cleanup() {
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

function validResponses() {
  return [
    { action: 'list', stdout: migrationList(expectedMigrations.slice(0, 10).map(version)) },
    { action: 'push' },
    { action: 'list', stdout: migrationList(expectedMigrations.map(version)) },
  ];
}

function withFixture(responses, check) {
  const fixture = createFixture(responses);
  try {
    check(fixture);
  } finally {
    fixture.cleanup();
  }
}

test('accepts the exact gameplay ref', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('rejects the score ref', () => {
  withFixture([], (fixture) => {
    const result = fixture.run([scoreRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /prohibited|gameplay/i);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('rejects an unknown ref', () => {
  withFixture([], (fixture) => {
    const result = fixture.run(['unknown-project-ref', '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('rejects a missing project ref', () => {
  withFixture([], (fixture) => {
    const result = fixture.run(['--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('rejects a malformed expected SHA', () => {
  withFixture([], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', 'not-a-sha']);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('rejects a missing expected SHA', () => {
  withFixture([], (fixture) => {
    const result = fixture.run([gameplayRef]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('rejects an extra positional target', () => {
  withFixture([], (fixture) => {
    const result = fixture.run([gameplayRef, 'second-target', '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('rejects connection-string arguments before any command', () => {
  withFixture([], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha, '--db-url', 'postgresql://secret@example.invalid/db']);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:\/\/secret/i);
    assert.deepEqual(fixture.calls(), []);
  });
});

test('runs the target guard before migration inspection', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.indexOf('before migration inspection') < result.stdout.indexOf('Migration state inspection'));
  });
});

test('uses only the supabase-gameplay workspace', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    for (const call of fixture.calls()) {
      assert.deepEqual(call.slice(0, 3), ['supabase', '--workdir', 'supabase-gameplay']);
      assert.ok(call[3] === 'migration' || call[3] === 'db');
      assert.equal(call.includes('--db-url'), false);
    }
  });
});

test('accepts exactly pending migrations 011 and 012', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /202607290011_active_round_next_round\.sql/);
    assert.match(result.stdout, /202608080012_fix_gameplay_round_table_id_ambiguity\.sql/);
  });
});

test('rejects only migration 011 pending', () => {
  withFixture([{ action: 'list', stdout: migrationList(expectedMigrations.slice(0, 11).map(version)) }], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('rejects only migration 012 pending', () => {
  withFixture([{ action: 'list', stdout: migrationList([...expectedMigrations.slice(0, 10), expectedMigrations[11]].map(version)) }], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('rejects an extra pending migration', () => {
  withFixture([{ action: 'list', stdout: `${migrationList(expectedMigrations.slice(0, 10).map(version))}\n202608090013 | |` }], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('rejects an unexpected remote-only migration', () => {
  withFixture([{ action: 'list', stdout: `${migrationList(expectedMigrations.slice(0, 10).map(version))}\n | 202608090013 |` }], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('rejects out-of-order linked migration state', () => {
  const lines = migrationList(expectedMigrations.slice(0, 10).map(version)).split('\n');
  [lines[2], lines[3]] = [lines[3], lines[2]];
  withFixture([{ action: 'list', stdout: lines.join('\n') }], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('rejects malformed migration-list output', () => {
  withFixture([{ action: 'list', stdout: 'unparseable response' }], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('never executes db push after a failed precondition', () => {
  withFixture([{ action: 'list', stdout: 'unparseable response' }], (fixture) => {
    fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 0);
  });
});

test('executes db push exactly once after valid preflight', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 1);
  });
});

test('runs the second target guard immediately before db push', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.indexOf('before migration push') < result.stdout.indexOf('Migration push started'));
  });
});

test('requires post-push migration-list verification', () => {
  withFixture(validResponses().slice(0, 2), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.equal(fixture.calls().filter((call) => call.includes('push')).length, 1);
  });
});

test('fails when a residual pending migration remains after push', () => {
  withFixture([
    { action: 'list', stdout: migrationList(expectedMigrations.slice(0, 10).map(version)) },
    { action: 'push' },
    { action: 'list', stdout: migrationList(expectedMigrations.slice(0, 11).map(version)) },
  ], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
  });
});

test('fails when an unexpected remote migration remains after push', () => {
  withFixture([
    { action: 'list', stdout: migrationList(expectedMigrations.slice(0, 10).map(version)) },
    { action: 'push' },
    { action: 'list', stdout: `${migrationList(expectedMigrations.map(version))}\n | 202608090013 |` },
  ], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
  });
});

test('succeeds only when all reviewed migrations are applied after push', () => {
  withFixture(validResponses(), (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /all reviewed migrations are applied/i);
  });
});

test('does not leak credentials or connection strings in failure output', () => {
  withFixture([], (fixture) => {
    const secret = 'postgresql://secret-user:secret-password@example.invalid/db';
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha, '--db-url', secret]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-user|secret-password|example\.invalid/i);
  });
});

test('does not relay a Supabase push diagnostic containing a connection string', () => {
  withFixture([
    { action: 'list', stdout: migrationList(expectedMigrations.slice(0, 10).map(version)) },
    { action: 'push', status: 1, stderr: 'postgresql://secret-user:secret-password@example.invalid/db' },
  ], (fixture) => {
    const result = fixture.run([gameplayRef, '--expected-sha', fixture.sha]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-user|secret-password|example\.invalid/i);
  });
});
