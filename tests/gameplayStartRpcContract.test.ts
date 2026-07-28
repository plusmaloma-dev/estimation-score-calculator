import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
