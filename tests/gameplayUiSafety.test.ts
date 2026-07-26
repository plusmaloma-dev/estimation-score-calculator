import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const gameplayCssPath = 'src/app/styles/gameplay.css';
const gameplayCss = existsSync(gameplayCssPath) ? readFileSync(gameplayCssPath, 'utf8') : '';
const lobby = readFileSync('src/app/screens/GameplayLobbyScreen.tsx', 'utf8');
const waitingRoom = readFileSync('src/app/screens/GameplayTableScreen.tsx', 'utf8');
const activeGame = readFileSync('src/app/screens/ActiveGameplayScreen.tsx', 'utf8');
const bidPanel = readFileSync('src/app/components/GameplayBidPanel.tsx', 'utf8');
const main = readFileSync('src/app/main.tsx', 'utf8');

const gameplaySource = `${lobby}\n${waitingRoom}\n${activeGame}\n${bidPanel}`;

test('gameplay screens use a dedicated responsive stylesheet', () => {
  assert.equal(existsSync(gameplayCssPath), true, 'Missing dedicated gameplay stylesheet.');
  assert.match(main, /import ['"]\.\/styles\/gameplay\.css['"]/i);
  assert.match(gameplayCss, /@media\s*\(max-width:\s*48rem\)/i);
  assert.match(gameplayCss, /@media\s*\(max-width:\s*30rem\)/i);
  assert.match(gameplayCss, /\.gameplay-seat-grid/i);
  assert.match(gameplayCss, /\.active-seat-grid/i);
  assert.match(gameplayCss, /\.gameplay-bid-panel/i);
});

test('gameplay forms and lifecycle controls retain semantic accessibility', () => {
  assert.match(lobby, /<form[\s\S]*<label[\s\S]*<input/i);
  assert.match(waitingRoom, /aria-label="Host controls"|aria-labelledby="pending-requests-heading"/i);
  assert.match(activeGame, /role="dialog"[\s\S]*aria-modal="true"/i);
  assert.match(activeGame, /role="status"/i);
  assert.match(bidPanel, /<form[\s\S]*<label[\s\S]*<select/i);
  assert.match(bidPanel, /aria-label="Public estimates"/i);
  assert.match(gameplaySource, /role="alert"/i);
});

test('browser gameplay projections do not reference hidden deal material or privileged credentials', () => {
  for (const prohibited of [
    /shuffle[_-]?seed/i,
    /private[_-]?hand/i,
    /deck[_-]?order/i,
    /service[_-]?role/i,
    /supabase[_-]?service/i,
    /opponentHand/i,
  ]) {
    assert.doesNotMatch(gameplaySource, prohibited);
  }
});

test('active bidding uses authoritative snapshots and does not duplicate game rules in React', () => {
  assert.match(activeGame, /service\.submitBid\(/i);
  assert.match(activeGame, /roundSnapshot\.version/i);
  assert.match(activeGame, /service\.getSnapshot\(tableId\)/i);
  assert.doesNotMatch(`${activeGame}\n${bidPanel}`, /playCard|legalCards|calculateRound|validateBid/i);
  assert.doesNotMatch(bidPanel, /reduce\([^)]*tricks|totalEstimatedTricks|===\s*13/i);
});
