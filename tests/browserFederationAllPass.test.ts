import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserUiShellService,
  FEDERATION_2026,
  HOUSE_RULES_V1,
  InMemoryScoreSheetRepository,
} from '../src/index.js';

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Bassem' },
  { id: 'C', name: 'Cairo' },
  { id: 'D', name: 'Dina' },
] as const;

const fourPasses = [
  { playerId: 'A', actionType: 'pass' },
  { playerId: 'B', actionType: 'pass' },
  { playerId: 'C', actionType: 'pass' },
  { playerId: 'D', actionType: 'pass' },
] as const;

function createScoreSheet(ruleSet: typeof FEDERATION_2026 | typeof HOUSE_RULES_V1) {
  const repository = new InMemoryScoreSheetRepository();
  const ui = new BrowserUiShellService(repository);
  const created = ui.createScoreSheet({
    name: 'All-Pass Game',
    ruleSet,
    players,
    nowIso: '2026-07-21T10:00:00.000Z',
  });
  const scoreSheetId = created.scoreSheet?.id;
  assert.ok(scoreSheetId);
  const scoreSheet = repository.getById(scoreSheetId);
  assert.ok(scoreSheet);
  return { repository, ui, scoreSheetId, scoreSheet };
}

test('four Federation passes require a redeal without mutating the score sheet', () => {
  const { repository, ui, scoreSheetId, scoreSheet } = createScoreSheet(FEDERATION_2026);

  const result = ui.resolveFederationAuction(scoreSheetId, {
    roundNumber: 3,
    dealerPlayerId: 'B',
    actions: fourPasses,
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'redeal-required');
  if (result.status === 'redeal-required') {
    assert.equal(result.roundNumber, 3);
    assert.equal(result.dealerPlayerId, 'B');
    assert.equal(result.nextDealerPlayerId, 'B');
  }
  assert.strictEqual(repository.getById(scoreSheetId), scoreSheet);
  assert.equal(scoreSheet.roundCount, 0);
  assert.deepEqual(scoreSheet.gameInput.rounds, []);
  assert.deepEqual(scoreSheet.gameResult?.rounds, []);
  assert.deepEqual(scoreSheet.gameResult?.leaderboard, []);
  assert.equal(scoreSheet.updatedAtIso, '2026-07-21T10:00:00.000Z');
});

test('an auction containing a bid continues without mutating the score sheet', () => {
  const { repository, ui, scoreSheetId, scoreSheet } = createScoreSheet(FEDERATION_2026);

  const result = ui.resolveFederationAuction(scoreSheetId, {
    roundNumber: 1,
    dealerPlayerId: 'A',
    actions: [
      { playerId: 'A', actionType: 'pass' },
      { playerId: 'B', actionType: 'bid' },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'continue-auction');
  assert.strictEqual(repository.getById(scoreSheetId), scoreSheet);
});

test('invalid Federation auction input does not mutate the score sheet', () => {
  const { repository, ui, scoreSheetId, scoreSheet } = createScoreSheet(FEDERATION_2026);

  const result = ui.resolveFederationAuction(scoreSheetId, {
    roundNumber: 1,
    dealerPlayerId: 'A',
    actions: [
      { playerId: 'A', actionType: 'pass' },
      { playerId: 'A', actionType: 'pass' },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid');
  assert.strictEqual(repository.getById(scoreSheetId), scoreSheet);
});

test('House Rules V1 score sheets reject Federation auction resolution', () => {
  const { repository, ui, scoreSheetId, scoreSheet } = createScoreSheet(HOUSE_RULES_V1);

  const result = ui.resolveFederationAuction(scoreSheetId, {
    roundNumber: 1,
    dealerPlayerId: 'A',
    actions: fourPasses,
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid');
  assert.ok(result.errors.includes('Federation auction resolution is only available for FEDERATION_2026 score sheets.'));
  assert.strictEqual(repository.getById(scoreSheetId), scoreSheet);
});

test('missing score sheets return an invalid Federation auction result', () => {
  const ui = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const result = ui.resolveFederationAuction('missing', {
    roundNumber: 1,
    dealerPlayerId: 'A',
    actions: fourPasses,
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.errors, ['Score sheet not found: missing.']);
});
