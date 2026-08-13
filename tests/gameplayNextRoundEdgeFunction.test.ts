import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const copies = [
  'supabase/functions/gameplay-round-command',
  'supabase-gameplay/supabase/functions/gameplay-round-command',
] as const;

for (const directory of copies) {
  test(`next-round Edge command dispatches the authenticated handler in ${directory}`, () => {
    const index = readFileSync(`${directory}/index.ts`, 'utf8');
    const handlerPath = `${directory}/nextRoundHandler.ts`;

    assert.equal(existsSync(handlerPath), true, 'Missing next-round handler source.');
    assert.match(index, /start-next-round/);
    assert.match(index, /handleStartNextRound/);
    assert.match(index, /auth\.getUser\(\)/);
  });
}

test('next-round public request accepts only public concurrency identity', () => {
  const handler = readFileSync(
    'supabase/functions/gameplay-round-command/nextRoundHandler.ts',
    'utf8',
  );
  const match = handler.match(/export interface NextRoundRequest\s*\{([\s\S]*?)\n\}/i);
  assert.ok(match, 'Missing next-round public request contract.');
  assert.match(match[1], /expectedRoundNumber\?: number/);
  assert.match(match[1], /expectedRoundVersion\?: number/);
  assert.match(match[1], /expectedControlVersion\?: number/);
  assert.doesNotMatch(match[1], /(aggregate|hand|card|deck|seed|nonce|deal|host|user)/i);
});
