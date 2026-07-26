import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const gameplayCssPath = 'src/app/styles/gameplay.css';
const gameplayCss = existsSync(gameplayCssPath) ? readFileSync(gameplayCssPath, 'utf8') : '';
const lobby = readFileSync('src/app/screens/GameplayLobbyScreen.tsx', 'utf8');
const waitingRoom = readFileSync('src/app/screens/GameplayTableScreen.tsx', 'utf8');
const activeGame = readFileSync('src/app/screens/ActiveGameplayScreen.tsx', 'utf8');
const main = readFileSync('src/app/main.tsx', 'utf8');

const gameplaySource = `${lobby}\n${waitingRoom}\n${activeGame}`;

test('gameplay screens use a dedicated responsive stylesheet', () => {
  assert.equal(existsSync(gameplayCssPath), true, 'Missing dedicated gameplay stylesheet.');
  assert.match(main, /import ['"]\.\/styles\/gameplay\.css['"]/i);
  assert.match(gameplayCss, /@media\s*\(max-width:\s*48rem\)/i);
  assert.match(gameplayCss, /@media\s*\(max-width:\s*30rem\)/i);
  assert.match(gameplayCss, /\.gameplay-seat-grid/i);
  assert.match(gameplayCss, /\.active-seat-grid/i);
});

test('gameplay forms and lifecycle controls retain semantic accessibility', () => {
  assert.match(lobby, /<form[\s\S]*<label[\s\S]*<input/i);
  assert.match(waitingRoom, /aria-label="Host controls"|aria-labelledby="pending-requests-heading"/i);
  assert.match(activeGame, /role="dialog"[\s\S]*aria-modal="true"/i);
  assert.match(activeGame, /role="status"/i);
  assert.match(gameplaySource, /role="alert"/i);
});

test('browser gameplay projections do not reference hidden deal material or privileged credentials', () => {
  for (const prohibited of [
    /shuffle[_-]?seed/i,
    /private[_-]?hand/i,
    /deck[_-]?order/i,
    /service[_-]?role/i,
    /supabase[_-]?service/i,
  ]) {
    assert.doesNotMatch(gameplaySource, prohibited);
  }
});

test('active-game controls remain projection-only in this delivery slice', () => {
  assert.doesNotMatch(activeGame, /submitBid|playCard|legalCards|opponentHand/i);
  assert.match(activeGame, /getSnapshot\(tableId\)/i);
});
