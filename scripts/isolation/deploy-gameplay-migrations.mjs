import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const GAMEPLAY_REF = 'stedjwppoanbmhxsfhcg';
const SCORE_REF = 'lexewcehptnmikwfizhj';
const WORKSPACE = 'supabase-gameplay';
const EXPECTED_MIGRATIONS = [
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
const EXPECTED_PENDING = EXPECTED_MIGRATIONS.slice(-2);

function fail(message) {
  console.error(`Gameplay migration deployment failed: ${message}`);
  process.exit(1);
}

function migrationVersion(name) {
  return name.slice(0, 12);
}

function validateArguments(argv) {
  if (argv.some((value) => /(?:--db-url(?:=|$)|database_url|postgres(?:ql)?:\/\/)/i.test(value))) {
    fail('Connection-string arguments are not accepted.');
  }
  if (argv.length !== 3 || argv[1] !== '--expected-sha') {
    fail('Usage: deploy-gameplay-migrations.mjs stedjwppoanbmhxsfhcg --expected-sha <40-character-sha>.');
  }
  const [projectRef, , expectedSha] = argv;
  if (projectRef === SCORE_REF) fail('The score Supabase project reference is prohibited.');
  if (projectRef !== GAMEPLAY_REF) fail('Only the allow-listed gameplay Supabase project reference is accepted.');
  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) fail('A tested commit SHA must be supplied with --expected-sha.');
  return { projectRef, expectedSha };
}

function run(command, args, options = {}) {
  const { failureMessage = 'A required guarded deployment command failed.', ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    ...spawnOptions,
  });
  if (result.error !== undefined || result.status !== 0) {
    fail(failureMessage);
  }
  return result.stdout ?? '';
}

function runGuard(projectRef, expectedSha, stage) {
  console.log(`Validation stage: verifying target ${stage}.`);
  run(process.execPath, [
    resolve('scripts/isolation/gameplay-target-guard.mjs'),
    'supabase',
    projectRef,
    '--expected-sha',
    expectedSha,
  ]);
}

function runNpx(args, capture = false, failureMessage = 'Supabase migration command failed.') {
  if (process.platform === 'win32') {
    return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx.cmd', ...args], { capture, failureMessage, stdio: capture ? 'pipe' : 'inherit' });
  }
  return run('npx', args, { capture, failureMessage, stdio: capture ? 'pipe' : 'inherit' });
}

function verifiedLocalInventory() {
  const directory = resolve(WORKSPACE, 'supabase', 'migrations');
  let actual;
  try {
    actual = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  } catch {
    fail('The isolated gameplay migration inventory could not be read.');
  }
  if (actual.length !== EXPECTED_MIGRATIONS.length || actual.some((name, index) => name !== EXPECTED_MIGRATIONS[index])) {
    fail('The local gameplay migration inventory does not exactly match the reviewed twelve migrations.');
  }
}

function parseMigrationList(output) {
  const rows = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.includes('|') || /^local\s*\|\s*remote\b/i.test(line) || /^[-\s|]+$/.test(line)) continue;
    const columns = line.split('|').map((column) => column.trim());
    if (columns.length < 3) fail('Linked migration state output is malformed.');
    const [local, remote] = columns;
    if ((local !== '' && !/^\d{12}$/.test(local)) || (remote !== '' && !/^\d{12}$/.test(remote))) {
      fail('Linked migration state output is malformed.');
    }
    if (local === '' && remote === '') fail('Linked migration state output is malformed.');
    rows.push({ local, remote });
  }
  if (rows.length === 0) fail('Linked migration state output is malformed.');
  return rows;
}

function inspectLinkedMigrationState() {
  console.log('Migration state inspection started.');
  const output = runNpx(['supabase', '--workdir', WORKSPACE, 'migration', 'list', '--linked'], true, 'Supabase migration inspection failed.');
  return parseMigrationList(output);
}

function assertState(rows, expectedRemoteNames, stage) {
  const expectedVersions = EXPECTED_MIGRATIONS.map(migrationVersion);
  const expectedRemote = expectedRemoteNames.map(migrationVersion);
  const local = [];
  const remote = [];
  for (const row of rows) {
    if (row.local !== '') local.push(row.local);
    if (row.remote !== '') remote.push(row.remote);
    if (row.remote !== '' && !expectedVersions.includes(row.remote)) {
      fail(`Linked migration state has an unexpected remote migration during ${stage}.`);
    }
    if (row.local !== '' && !expectedVersions.includes(row.local)) {
      fail(`Linked migration state has an unexpected local migration during ${stage}.`);
    }
  }
  if (new Set(local).size !== local.length || new Set(remote).size !== remote.length) {
    fail(`Linked migration state is ambiguous during ${stage}.`);
  }
  if (local.length !== expectedVersions.length || expectedVersions.some((value, index) => local[index] !== value)) {
    fail(`Linked migration state does not list the reviewed local migrations in order during ${stage}.`);
  }
  if (remote.length !== expectedRemote.length || expectedRemote.some((value, index) => remote[index] !== value)) {
    fail(`Linked migration state does not exactly match the reviewed remote migrations during ${stage}.`);
  }
}

function pendingNames(rows) {
  const remote = new Set(rows.map((row) => row.remote).filter(Boolean));
  return EXPECTED_MIGRATIONS.filter((name) => !remote.has(migrationVersion(name)));
}

const { projectRef, expectedSha } = validateArguments(process.argv.slice(2));
verifiedLocalInventory();
runGuard(projectRef, expectedSha, 'before migration inspection');
const before = inspectLinkedMigrationState();
assertState(before, EXPECTED_MIGRATIONS.slice(0, 10), 'pre-push verification');
const pending = pendingNames(before);
if (pending.length !== EXPECTED_PENDING.length || pending.some((name, index) => name !== EXPECTED_PENDING[index])) {
  fail('Pending gameplay migrations do not exactly match the reviewed deployment set.');
}
console.log(`Reviewed pending migrations: ${pending.join(', ')}`);
runGuard(projectRef, expectedSha, 'immediately before migration push');
console.log('Migration push started.');
runNpx(['supabase', '--workdir', WORKSPACE, 'db', 'push', '--linked'], true, 'Supabase migration push failed.');
const after = inspectLinkedMigrationState();
assertState(after, EXPECTED_MIGRATIONS, 'post-push verification');
if (pendingNames(after).length !== 0) fail('Post-push migration verification found residual pending migrations.');
console.log('Migration deployment succeeded: all reviewed migrations are applied.');
