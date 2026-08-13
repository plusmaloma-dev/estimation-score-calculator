import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase-gameplay/supabase/migrations/202608120014_gameplay_round_score_history.sql',
  'utf8',
);

test('score history is an append-only service-only one-row-per-round journal', () => {
  const journal = migration.slice(0, migration.indexOf('create or replace function public.record_gameplay_round_score_history_on_scored'));
  assert.match(journal, /create table public\.gameplay_round_score_history\b/i);
  assert.match(journal, /unique\s*\(\s*table_id\s*,\s*round_number\s*\)/i);
  assert.match(journal, /seat_0_delta\s+integer\s+not null/i);
  assert.match(journal, /seat_1_delta\s+integer\s+not null/i);
  assert.match(journal, /seat_2_delta\s+integer\s+not null/i);
  assert.match(journal, /seat_3_delta\s+integer\s+not null/i);
  assert.match(journal, /alter table public\.gameplay_round_score_history enable row level security/i);
  assert.match(journal, /revoke all on table public\.gameplay_round_score_history from authenticated/i);
  assert.match(journal, /grant\s+select,\s*insert\s+on table public\.gameplay_round_score_history to service_role/i);
  assert.doesNotMatch(journal, /player_id|playerId|display_name|displayName|auth_user_id|hand|seed|nonce|deck/i);
  assert.doesNotMatch(journal, /update public\.gameplay_round_score_history/i);
  assert.doesNotMatch(journal, /delete from public\.gameplay_round_score_history/i);
});

test('score history migration validates exactly four integer seat deltas', () => {
  assert.match(migration, /seat_0_delta\s+between\s+-2147483648\s+and\s+2147483647/i);
  assert.match(migration, /seat_1_delta\s+between\s+-2147483648\s+and\s+2147483647/i);
  assert.match(migration, /seat_2_delta\s+between\s+-2147483648\s+and\s+2147483647/i);
  assert.match(migration, /seat_3_delta\s+between\s+-2147483648\s+and\s+2147483647/i);
  assert.match(migration, /insert_gameplay_round_score_history/i);
  assert.match(migration, /already exists|conflict|conflicting/i);
});
