import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const expectedParameters = [
  'p_table_id',
  'p_actor_user_id',
  'p_round_number',
  'p_phase',
  'p_aggregate',
  'p_occurred_at',
] as const;

const rpcMigration = readFileSync(
  'supabase-gameplay/supabase/migrations/202607260009_gameplay_round_rpc.sql',
  'utf8',
);
const nextRoundMigrationPath = 'supabase-gameplay/supabase/migrations/202607290011_active_round_next_round.sql';
const nextRoundMigration = existsSync(nextRoundMigrationPath)
  ? readFileSync(nextRoundMigrationPath, 'utf8')
  : '';
const nextRoundParameters = [
  'p_table_id',
  'p_actor_user_id',
  'p_command_id',
  'p_expected_round_number',
  'p_expected_round_version',
  'p_expected_control_version',
  'p_first_bid_seat',
  'p_next_round_aggregate',
  'p_occurred_at',
] as const;

const nextRoundRace = {
  tableId: '10000000-0000-0000-0000-000000000200',
  hostUserId: '10000000-0000-0000-0000-000000000002',
  workspaceId: '10000000-0000-0000-0000-000000000020',
} as const;

function localDatabaseContainer(): string | undefined {
  try {
    return execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .find((name) => name.startsWith('supabase_db_estimation-gameplay-uat'));
  } catch {
    return undefined;
  }
}

async function queryLocalDatabase(container: string, query: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
    { encoding: 'utf8' },
  );
  return stdout.trim();
}

function nextRoundRaceSetupSql(): string {
  const { hostUserId, tableId, workspaceId } = nextRoundRace;
  return `
    insert into auth.users (id, is_sso_user, is_anonymous) values ('${hostUserId}', false, false);
    insert into public.profiles (user_id, display_name) values ('${hostUserId}', 'Task 6 Race Host');
    insert into public.workspaces (id, slug, name) values ('${workspaceId}', 'task-6-race', 'Task 6 Race');
    insert into public.workspace_memberships (workspace_id, user_id, role, created_by, updated_by)
      values ('${workspaceId}', '${hostUserId}', 'admin', '${hostUserId}', '${hostUserId}');
    insert into public.gameplay_tables (
      id, workspace_id, name, visibility, join_policy, lifecycle, host_user_id,
      turn_timer_seconds, disconnect_grace_seconds, settings_locked, version, created_by, updated_by
    ) values (
      '${tableId}', '${workspaceId}', 'Task 6 Race Table', 'private', 'open', 'active', '${hostUserId}',
      45, 60, true, 1, '${hostUserId}', '${hostUserId}'
    );
    insert into public.gameplay_active_controls (
      table_id, lifecycle, host_user_id, turn_timer_seconds, disconnect_grace_seconds, version, updated_by
    ) values ('${tableId}', 'active', '${hostUserId}', 45, 60, 31, '${hostUserId}');
    insert into public.gameplay_round_states (
      table_id, round_number, phase, version, aggregate, updated_by
    ) values ('${tableId}', 8, 'scored', 41, jsonb_build_object('marker', 'race-scored'), '${hostUserId}');
    insert into public.gameplay_round_invalidations (table_id, version, phase, occurred_at)
      values ('${tableId}', 41, 'scored', now());
  `;
}

function startRaceFirstProcess(container: string): ReturnType<typeof spawn> {
  const { hostUserId, tableId } = nextRoundRace;
  const query = `
    set application_name = 'task6-next-round-race-first';
    with locked as materialized (
      select 1 from public.gameplay_active_controls where table_id = '${tableId}' for update
    ), delayed as materialized (
      select pg_sleep(1.2) from locked
    )
    select public.start_next_gameplay_round(
      '${tableId}', '${hostUserId}', 'task-6-race-first', 8, 41, 31, 2,
      jsonb_build_object('marker', 'race-first'), '2026-07-29T12:10:00Z'::timestamptz
    ) from delayed;
  `;
  return spawn(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

async function waitForRaceLock(container: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const active = await queryLocalDatabase(
      container,
      "select count(*) from pg_stat_activity where application_name = 'task6-next-round-race-first' and state = 'active';",
    );
    if (active === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The first next-round transaction did not acquire its active-control lock.');
}

function waitForProcess(process: ReturnType<typeof spawn>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    process.stdout?.on('data', (value: Buffer) => { stdout += value.toString(); });
    process.stderr?.on('data', (value: Buffer) => { stderr += value.toString(); });
    process.once('error', reject);
    process.once('close', (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`The first concurrent next-round call failed with exit ${code}: ${stderr.trim()}`));
    });
  });
}

const functionCopies = [
  {
    label: 'repository gameplay Start source',
    source: readFileSync('supabase/functions/gameplay-start/index.ts', 'utf8'),
  },
  {
    label: 'isolated gameplay deployment source',
    source: readFileSync(
      'supabase-gameplay/supabase/functions/gameplay-start/index.ts',
      'utf8',
    ),
  },
] as const;

function initializeRoundBlock(source: string): string {
  const match = source.match(
    /async function initializeRound\b([\s\S]*?)(?=\nfunction firstTurnFromState\b)/,
  );
  assert.ok(match, 'Missing initializeRound implementation.');
  return match[0];
}

function rpcArgumentNames(source: string): readonly string[] {
  const match = initializeRoundBlock(source).match(
    /await rpc\(\s*client,\s*['"]initialize_gameplay_round_state['"],\s*\{([\s\S]*?)\n\s*\}\s*\)/,
  );
  assert.ok(match, 'Missing initialize_gameplay_round_state RPC call.');
  return Array.from(
    match[1].matchAll(/^\s*(p_[a-z_]+)\s*:/gm),
    (parameter) => parameter[1],
  );
}

test('gameplay Start RPC contract migration declares the expected six parameters', () => {
  const match = rpcMigration.match(
    /create or replace function public\.initialize_gameplay_round_state\s*\(([\s\S]*?)\)\s*returns jsonb/i,
  );
  assert.ok(match, 'Missing initialize_gameplay_round_state SQL signature.');
  const parameters = Array.from(
    match[1].matchAll(/^\s*(p_[a-z_]+)\s+/gm),
    (parameter) => parameter[1],
  );

  assert.deepEqual(parameters, expectedParameters);
});

test('next-round RPC migration declares the private service signature', () => {
  assert.equal(existsSync(nextRoundMigrationPath), true, 'Missing next-round RPC migration.');
  const match = nextRoundMigration.match(
    /create or replace function public\.start_next_gameplay_round\s*\(([\s\S]*?)\)\s*returns jsonb/i,
  );
  assert.ok(match, 'Missing start_next_gameplay_round SQL signature.');
  const parameters = Array.from(
    match[1].matchAll(/^\s*(p_[a-z_]+)\s+/gm),
    (parameter) => parameter[1],
  );

  assert.deepEqual(parameters, nextRoundParameters);
});

test('next-round RPC migration restricts execution to the service role', () => {
  assert.match(nextRoundMigration, /security definer/i);
  assert.match(nextRoundMigration, /set search_path = public, pg_temp/i);
  assert.match(nextRoundMigration, /revoke all on function public\.start_next_gameplay_round[\s\S]*from public/i);
  assert.match(nextRoundMigration, /revoke all on function public\.start_next_gameplay_round[\s\S]*from anon/i);
  assert.match(nextRoundMigration, /revoke all on function public\.start_next_gameplay_round[\s\S]*from authenticated/i);
  assert.match(nextRoundMigration, /grant execute on function public\.start_next_gameplay_round[\s\S]*to service_role/i);
});

test('next-round RPC serializes genuinely overlapping expected-version attempts', {
  skip: localDatabaseContainer() === undefined
    ? 'requires the disposable local Supabase database used by Task 6'
    : false,
}, async () => {
  const container = localDatabaseContainer();
  assert.ok(container, 'Local database container was not found.');
  const { hostUserId, tableId } = nextRoundRace;
  await queryLocalDatabase(container, `
    delete from public.gameplay_tables where id = '${tableId}';
    delete from public.workspace_memberships where workspace_id = '${nextRoundRace.workspaceId}';
    delete from public.workspaces where id = '${nextRoundRace.workspaceId}';
    delete from auth.users where id = '${hostUserId}';
    ${nextRoundRaceSetupSql()}
  `);

  try {
    const first = startRaceFirstProcess(container);
    const firstResult = waitForProcess(first);
    await waitForRaceLock(container);
    const secondStartedAt = Date.now();
    const second = JSON.parse(await queryLocalDatabase(container, `
      select public.start_next_gameplay_round(
        '${tableId}', '${hostUserId}', 'task-6-race-second', 8, 41, 31, 1,
        jsonb_build_object('marker', 'race-second'), '2026-07-29T12:10:01Z'::timestamptz
      );
    `)) as { readonly valid: boolean };
    const secondDurationMs = Date.now() - secondStartedAt;
    const completedFirst = await firstResult;

    assert.match(completedFirst.stdout, /"valid": true/i);
    assert.equal(second.valid, false);
    assert.ok(secondDurationMs >= 700, 'Second transaction did not wait on the first row lock.');
    assert.equal(await queryLocalDatabase(container, `
      select version from public.gameplay_round_states where table_id = '${tableId}';
    `), '42');
    assert.equal(await queryLocalDatabase(container, `
      select version from public.gameplay_active_controls where table_id = '${tableId}';
    `), '32');
    assert.equal(await queryLocalDatabase(container, `
      select count(*) from public.gameplay_round_invalidations where table_id = '${tableId}' and version = 42;
    `), '1');
    assert.equal(await queryLocalDatabase(container, `
      select count(*) from public.gameplay_active_control_commands where table_id = '${tableId}' and accepted;
    `), '1');
    assert.equal(await queryLocalDatabase(container, `
      select aggregate->>'marker' from public.gameplay_round_states where table_id = '${tableId}';
    `), 'race-first');
  } finally {
    await queryLocalDatabase(container, `
      delete from public.gameplay_tables where id = '${tableId}';
      delete from public.workspace_memberships where workspace_id = '${nextRoundRace.workspaceId}';
      delete from public.workspaces where id = '${nextRoundRace.workspaceId}';
      delete from auth.users where id = '${hostUserId}';
    `);
  }
});

for (const copy of functionCopies) {
  test(`gameplay Start RPC contract sends exactly six SQL parameters from the ${copy.label}`, () => {
    assert.deepEqual(rpcArgumentNames(copy.source), expectedParameters);
  });

  test(`gameplay Start RPC contract accepts metadata-only initialization in the ${copy.label}`, () => {
    const block = initializeRoundBlock(copy.source);

    assert.doesNotMatch(block, /initialized\.aggregate/);
    assert.match(block, /if\s*\(\s*initialized\.valid\s*!==\s*true\s*\)/);
    assert.match(block, /return bootstrap\.state;/);
  });

  test(`gameplay Start round initialization returns one consistent state shape in the ${copy.label}`, () => {
    const block = initializeRoundBlock(copy.source);

    assert.match(block, /\): Promise<HouseRulesRoundState>\s*\{/);
    assert.match(block, /if\s*\(existing !== undefined\) return existing\.state;/);
    assert.match(
      copy.source,
      /const roundState = await initializeRound\(serviceClient, body\.tableId, actor\.userId\);/,
    );
    assert.match(copy.source, /firstTurnFromState\(roundState\)/);
    assert.doesNotMatch(copy.source, /firstTurnFromState\([^)]*\.state\)/);
  });

  test(`gameplay Start RPC contract loads a persisted round before private deal generation in the ${copy.label}`, () => {
    const block = initializeRoundBlock(copy.source);
    const loadIndex = block.indexOf('repository.load(tableId)');
    const existingReturnIndex = block.indexOf(
      'if (existing !== undefined) return existing.state;',
    );
    const seatsIndex = block.indexOf('loadStartedPlayers(client, tableId)');
    const randomIndex = block.indexOf(
      'crypto.getRandomValues(new Uint8Array(32))',
    );

    assert.ok(loadIndex >= 0, 'Missing persisted round lookup.');
    assert.ok(existingReturnIndex > loadIndex, 'Missing persisted round state early return.');
    assert.ok(seatsIndex > existingReturnIndex, 'Seats loaded before persisted round return.');
    assert.ok(randomIndex > existingReturnIndex, 'Private deal generated before persisted round return.');
  });
}
