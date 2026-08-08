import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const edge = readFileSync('supabase/functions/gameplay-start/index.ts', 'utf8');

function compact(value: string): string {
  return value.replace(/\s+/g, ' ');
}

function requestBodyBlock(): string {
  const match = edge.match(/interface RequestBody\s*\{([\s\S]*?)\n\}/i);
  assert.ok(match, 'Missing Start request body interface.');
  return match[0];
}

test('Start Function authenticates the caller and accepts only public start identity', () => {
  assert.match(edge, /Deno\.serve/i);
  assert.match(edge, /authorization/i);
  assert.match(edge, /auth\.getUser\(\)/i);
  assert.match(edge, /tableId\?: string/i);
  assert.match(edge, /expectedVersion\?: number/i);
  assert.match(edge, /commandId\?: string/i);
  assert.doesNotMatch(requestBodyBlock(), /seedHex|hands|shuffledDeck|dealAudit/i);
});

test('Start Function generates private cryptographic deal inputs server-side', () => {
  assert.match(edge, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/i);
  assert.match(edge, /GameplaySessionBootstrapService/i);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(edge, /Math\.random|sort\([^)]*random/i);
  assert.doesNotMatch(edge, /json\([^)]*(seedHex|shuffledDeck|dealAudit|state\.hands)/i);
});

test('Start Function explicitly bootstraps the first round', () => {
  assert.match(
    compact(edge),
    /initialization:\s*\{\s*kind:\s*['"]first-round['"]\s*\}/i,
  );
});

test('Start Function uses deterministic retry-safe sub-command identities', () => {
  const normalized = compact(edge);
  assert.match(normalized, /start_gameplay_table/i);
  assert.match(normalized, /table-start:\$\{commandId\}/i);
  assert.match(normalized, /initialize_active_game_control/i);
  assert.match(normalized, /control-init:\$\{commandId\}/i);
  assert.match(normalized, /initialize_gameplay_round_state/i);
  assert.match(normalized, /start_active_game_turn/i);
  assert.match(normalized, /turn-start:\$\{commandId\}/i);
});

test('Start Function recovers existing private round state before generating another committed session', () => {
  const loadIndex = edge.indexOf("load_gameplay_round_for_engine");
  const randomIndex = edge.indexOf('crypto.getRandomValues(new Uint8Array(32))');
  assert.ok(loadIndex >= 0, 'Missing existing round lookup.');
  assert.ok(randomIndex >= 0, 'Missing secure seed generation.');
  assert.ok(loadIndex < randomIndex, 'Existing private round must be checked before secure bootstrap generation.');
  assert.match(edge, /GameplayRoundApplicationService/i);
  assert.match(edge, /getSnapshot\(/i);
});

test('Start Function maps four started seats and starts the generated first bidding turn', () => {
  assert.match(edge, /gameplay_table_seats/i);
  assert.match(edge, /seat_number/i);
  assert.match(edge, /seat_kind/i);
  assert.match(edge, /user_id/i);
  assert.match(edge, /bot_id/i);
  assert.match(edge, /firstTurn\.turnId/i);
  assert.match(edge, /firstTurn\.seat/i);
  assert.match(edge, /firstTurn\.actionKind/i);
  assert.match(edge, /p_next_turn|p_turn_id/i);
});
