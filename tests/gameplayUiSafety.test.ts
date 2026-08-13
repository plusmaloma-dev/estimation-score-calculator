import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const gameplayCssPath = 'src/app/styles/gameplay.css';
const gameplayCss = existsSync(gameplayCssPath) ? readFileSync(gameplayCssPath, 'utf8') : '';
const lobby = readFileSync('src/app/screens/GameplayLobbyScreen.tsx', 'utf8');
const waitingRoom = readFileSync('src/app/screens/GameplayTableScreen.tsx', 'utf8');
const activeGame = readFileSync('src/app/screens/ActiveGameplayScreen.tsx', 'utf8');
const actionBanner = readFileSync('src/app/components/GameplayActionBanner.tsx', 'utf8');
const bidPanel = readFileSync('src/app/components/GameplayBidPanel.tsx', 'utf8');
const cardPanel = readFileSync('src/app/components/GameplayCardPanel.tsx', 'utf8');
const gameplayHand = readFileSync('src/app/components/GameplayHand.tsx', 'utf8');
const main = readFileSync('src/app/main.tsx', 'utf8');

const gameplaySource = `${lobby}\n${waitingRoom}\n${activeGame}\n${bidPanel}\n${cardPanel}`;

test('gameplay screens use a dedicated responsive stylesheet', () => {
  assert.equal(existsSync(gameplayCssPath), true, 'Missing dedicated gameplay stylesheet.');
  assert.match(main, /import ['"]\.\/styles\/gameplay\.css['"]/i);
  assert.match(gameplayCss, /@media\s*\(max-width:\s*48rem\)/i);
  assert.match(gameplayCss, /@media\s*\(max-width:\s*30rem\)/i);
  assert.match(gameplayCss, /\.gameplay-seat-grid/i);
  assert.match(gameplayCss, /\.active-seat-grid/i);
  assert.match(gameplayCss, /\.gameplay-bid-panel/i);
  assert.match(gameplayCss, /\.gameplay-card-panel/i);
});

test('gameplay forms and lifecycle controls retain semantic accessibility', () => {
  assert.match(lobby, /<form[\s\S]*<label[\s\S]*<input/i);
  assert.match(waitingRoom, /aria-label="Host controls"|aria-labelledby="pending-requests-heading"/i);
  assert.match(activeGame, /role="dialog"[\s\S]*aria-modal="true"/i);
  assert.match(activeGame, /<GameplayActionBanner\s+presentation=\{presentation\}/i);
  assert.match(actionBanner, /role="status"[\s\S]*aria-live="polite"/i);
  assert.match(bidPanel, /<form[\s\S]*<label[\s\S]*<select/i);
  assert.doesNotMatch(bidPanel, /Public estimates/i);
  assert.match(bidPanel, /<GameplayHand[\s\S]*mode="read-only"/i);
  assert.match(cardPanel, /<GameplayHand/i);
  assert.match(gameplayHand, /role="group"[\s\S]*aria-label=\{t\('yourHand'\)\}/i);
  assert.match(gameplaySource, /role="alert"/i);
});

test('active round status has a sticky persistence CSS contract', () => {
  assert.match(gameplayCss, /\.gameplay-round-status\s*\{[\s\S]*position:\s*sticky/i);
  assert.match(gameplayCss, /\.gameplay-round-status\s*\{[\s\S]*top:\s*[^;]+;/i);
  assert.match(gameplayCss, /\.gameplay-round-status\s*\{[\s\S]*z-index:\s*[^;]+;/i);
  assert.match(gameplayCss, /\.gameplay-round-status\s*\{[\s\S]*background:\s*[^;]+;/i);
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

test('active round delegates bidding and card commands without duplicating game rules in React', () => {
  assert.match(activeGame, /service\.submitBid\(/i);
  assert.match(activeGame, /service\.playCard\(/i);
  assert.match(activeGame, /roundSnapshot\.version/i);
  assert.match(activeGame, /service\.getSnapshot\(tableId\)/i);
  assert.match(cardPanel, /snapshot\.legalCards/i);
  assert.doesNotMatch(
    `${activeGame}\n${bidPanel}\n${cardPanel}`,
    /HouseRulesRoundEngine|LegalCardPlayService|BidValidationService|calculateRound|validateBid|legalCards\s*\(/i,
  );
  assert.doesNotMatch(bidPanel, /reduce\([^)]*tricks|totalEstimatedTricks|===\s*13/i);
});
