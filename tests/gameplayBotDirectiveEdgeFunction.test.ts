import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const edgeCopies = [
  {
    label: 'repository gameplay round command source',
    source: readFileSync('supabase/functions/gameplay-round-command/index.ts', 'utf8'),
  },
  {
    label: 'isolated gameplay deployment source',
    source: readFileSync(
      'supabase-gameplay/supabase/functions/gameplay-round-command/index.ts',
      'utf8',
    ),
  },
] as const;
const edge = edgeCopies[0].source;
const botService = readFileSync('src/gameplay/bot/GameplayBotDirectiveService.ts', 'utf8');

function compact(value: string): string {
  return value.replace(/\s+/g, ' ');
}

test('Edge Function accepts only the public bot directive identity from the browser', () => {
  assert.match(edge, /process-bot-directive/i);
  assert.match(edge, /directiveId\?: string/i);
  assert.doesNotMatch(edge, /body\.(observation|hand|legalCards|selectedAction)/i);
  assert.doesNotMatch(edge, /interface RequestBody[\s\S]*readonly (observation|hand|legalCards|selectedAction)/i);
});

test('issued directive and authoritative control state are loaded with service-role access', () => {
  assert.match(edge, /gameplay_active_control_commands/i);
  assert.match(edge, /directives/i);
  assert.match(edge, /gameplay_active_controls/i);
  assert.match(edge, /gameplay_active_seat_controls/i);
  assert.match(botService, /bot-round:\$\{directive\.directiveId\}/i);
  assert.match(edge, /directive\.turnId[\s\S]*turn_id/i);
  assert.match(edge, /directive\.seat[\s\S]*turn_seat/i);
  assert.match(edge, /directive\.actionKind[\s\S]*turn_action_kind/i);
});

for (const copy of edgeCopies) {
  test(`bot directive lookup avoids fragile JSON containment filters in the ${copy.label}`, () => {
    const source = copy.source;

    assert.doesNotMatch(source, /\.contains\(\s*['"]directives['"]/);
    assert.match(source, /\.select\(\s*['"]id,directives['"]\s*\)/);
    assert.match(source, /\.eq\(\s*['"]table_id['"],\s*tableId\s*\)/);
    assert.match(source, /\.order\(\s*['"]id['"],\s*\{\s*ascending:\s*false\s*\}\s*\)/);
    assert.match(source, /\.limit\(\s*64\s*\)/);
    assert.match(source, /flatMap\([\s\S]*parseDirective[\s\S]*directiveId/);
  });
}

test('bot execution uses deterministic active-control and round command identities', () => {
  const normalized = compact(edge);
  assert.match(normalized, /begin_active_bot_action/i);
  assert.match(normalized, /bot-begin:\$\{directiveId\}/i);
  assert.match(normalized, /GameplayBotDirectiveService/i);
  assert.match(normalized, /complete_active_action_boundary/i);
  assert.match(normalized, /bot-complete:\$\{directiveId\}/i);
  assert.match(normalized, /p_expected_version/i);
});

test('next authoritative turn is derived from the committed scoped round snapshot', () => {
  assert.match(edge, /nextBidSeat/i);
  assert.match(edge, /currentTurnSeat/i);
  assert.match(edge, /roundNumber/i);
  assert.match(edge, /actionKind/i);
  assert.match(edge, /terminal:\s*true/i);
  assert.match(edge, /terminal:\s*false/i);
});

test('service-role credentials remain server-side and bot observations are never returned', () => {
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(edge, /auth\.getUser\(\)/i);
  assert.doesNotMatch(edge, /json\([^)]*(observation|decision\.legal|state\.hands)/i);
});
