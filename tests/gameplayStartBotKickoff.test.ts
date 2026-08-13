import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const startFunction = readFileSync('supabase/functions/gameplay-start/index.ts', 'utf8');
const activeScreen = readFileSync('src/app/screens/ActiveGameplayScreen.tsx', 'utf8');
const botScreenTest = readFileSync(
  'src/app/screens/ActiveGameplayBotDirectiveScreen.test.tsx',
  'utf8',
);

test('secure Start persists the generated first bidding turn before returning', () => {
  assert.match(startFunction, /firstTurn\.turnId/i);
  assert.match(startFunction, /firstTurn\.seat/i);
  assert.match(startFunction, /firstTurn\.actionKind/i);
  assert.match(startFunction, /start_active_game_turn/i);
  assert.match(startFunction, /actionKind:\s*'bid'/i);
});

test('the active screen evaluates permanent-bot opening turns immediately', () => {
  assert.match(
    activeScreen,
    /seat\.controlOwner === 'human'[\s\S]*Date\.parse[\s\S]*:\s*0;/i,
  );
  assert.match(activeScreen, /service\.evaluateDeadlines\(/i);
  assert.match(
    botScreenTest,
    /evaluates a permanent-bot turn immediately and processes the returned directive once/i,
  );
});

test('the active screen reconstructs pending opening directives after navigation or reconnect', () => {
  assert.match(activeScreen, /function recoverableDirective\(/i);
  assert.match(activeScreen, /turn\.status !== 'assistant-pending'/i);
  assert.match(activeScreen, /bot-action:\$\{snapshot\.tableId\}:\$\{turn\.turnId\}:\$\{turn\.seat\}/i);
  assert.match(
    botScreenTest,
    /recovers an assistant-pending directive from deterministic public turn state after reconnect/i,
  );
});

test('human opening turns remain governed by their configured deadline', () => {
  assert.match(
    activeScreen,
    /seat\.controlOwner === 'human'[\s\S]*Date\.parse\(turn\.deadlineAt \?\? turn\.startedAt\) - Date\.now\(\)/i,
  );
});
