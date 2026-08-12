import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase-gameplay/supabase/migrations/202608120014_gameplay_round_score_history.sql',
  'utf8',
);
const gameplayFunction = readFileSync(
  'supabase-gameplay/supabase/functions/gameplay-round-command/index.ts',
  'utf8',
);
const rootFunction = readFileSync(
  'supabase/functions/gameplay-round-command/index.ts',
  'utf8',
);

test('scored transition journals exactly once and fails closed on conflicting seat deltas', () => {
  assert.match(migration, /after update of phase, aggregate/i);
  assert.match(migration, /old\.phase = 'scored'/i);
  assert.match(migration, /insert into public\.gameplay_round_score_history/i);
  assert.match(migration, /on conflict \(table_id, round_number\) do nothing/i);
  assert.match(migration, /conflicting score history payload/i);
  assert.match(migration, /deltas\[1\].*deltas\[2\].*deltas\[3\].*deltas\[4\]/is);
});

test('service Function loads typed history and keeps both deployment source copies wired', () => {
  for (const source of [gameplayFunction, rootFunction]) {
    assert.match(source, /load_gameplay_round_for_engine/i);
    assert.match(source, /parseScoreHistory/i);
    assert.match(source, /scoreHistory/);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/i);
  }
  assert.equal(gameplayFunction.includes('scoreHistory'), true);
  assert.equal(rootFunction.includes('scoreHistory'), true);
});
