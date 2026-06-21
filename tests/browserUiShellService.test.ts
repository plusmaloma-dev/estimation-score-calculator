import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserUiShellService, InMemoryScoreSheetRepository, type ScoringProfile } from '../src/index.js';

const profile: ScoringProfile = {
  id: 'egyptian-estimation-local',
  name: 'Egyptian Estimation Local Rules',
  type: 'standard',
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  underDashSuccessBonus: 10,
  underDashFailurePenalty: 10,
  highContractThreshold: 8,
  highContractWinBase: 80,
  highContractWinStep: 10,
  highContractLossBasePenalty: -80,
  highContractLossStepPenalty: -10,
  dashSuccessScore: 10,
  dashCallSuccessScore: 35,
};

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Bassem' },
  { id: 'C', name: 'Cairo' },
  { id: 'D', name: 'Dina' },
] as const;

const validRound = {
  roundNumber: 1,
  profile,
  riskPlayerId: 'D',
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 3 },
    { playerId: 'B', bidType: 'normal', tricks: 3 },
    { playerId: 'C', bidType: 'normal', tricks: 3 },
    { playerId: 'D', bidType: 'normal', tricks: 2 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 3 },
    { playerId: 'B', actualTricks: 3 },
    { playerId: 'C', actualTricks: 4 },
    { playerId: 'D', actualTricks: 3 },
  ],
} as const;

test('browser UI shell validates four unique players before creating a score sheet', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const result = service.createScoreSheet({
    name: 'Friday Game',
    players: [players[0], players[1], players[2], { id: 'D', name: 'Ahmed' }],
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Player name must be unique: Ahmed.']);
});

test('browser UI shell creates a draft score sheet and lists it for a browser view', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const result = service.createScoreSheet({
    name: 'Friday Game',
    players,
    nowIso: '2026-06-21T10:00:00.000Z',
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.scoreSheet?.name, 'Friday Game');
  assert.deepEqual(result.scoreSheet?.playerOrder, ['A', 'B', 'C', 'D']);
  assert.equal(result.scoreSheet?.roundCount, 0);

  assert.deepEqual(service.listScoreSheets(), [
    {
      id: 'score-sheet-1',
      name: 'Friday Game',
      status: 'draft',
      playerOrder: ['A', 'B', 'C', 'D'],
      roundCount: 0,
      updatedAtIso: '2026-06-21T10:00:00.000Z',
    },
  ]);
});

test('browser UI shell previews validation errors before saving invalid rounds', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const result = service.previewRound({
    roundNumber: 1,
    profile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4 },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 3 },
      { playerId: 'D', bidType: 'normal', tricks: 3 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 3 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('13')));
});

test('browser UI shell saves a valid round and exposes leaderboard output', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());
  const created = service.createScoreSheet({ name: 'Friday Game', players });
  assert.equal(created.valid, true, created.errors.join('; '));

  const saved = service.saveRound(created.scoreSheet?.id ?? '', validRound, '2026-06-21T10:05:00.000Z');

  assert.equal(saved.valid, true, saved.errors.join('; '));
  assert.equal(saved.scoreSheet?.roundCount, 1);
  assert.deepEqual(
    saved.gameResult?.leaderboard.map((entry) => [entry.playerId, entry.totalScore]),
    [
      ['A', 13],
      ['B', 13],
      ['C', -1],
      ['D', -11],
    ],
  );
  assert.deepEqual(service.getLeaderboard(created.scoreSheet?.id ?? '').map((entry) => entry.playerId), ['A', 'B', 'C', 'D']);
});

test('browser UI shell exports a JSON backup for the current score sheet', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());
  const created = service.createScoreSheet({ name: 'Friday Game', players });
  assert.equal(created.valid, true, created.errors.join('; '));

  const exported = service.exportScoreSheet(created.scoreSheet?.id ?? '', '2026-06-21T10:10:00.000Z');

  assert.equal(exported.valid, true, exported.errors.join('; '));
  assert.equal(exported.document?.metadata.exportedAtIso, '2026-06-21T10:10:00.000Z');
  assert.equal(exported.document?.metadata.source, 'browser-ui-shell');
  assert.equal(exported.document?.scoreSheets[0]?.name, 'Friday Game');
});
