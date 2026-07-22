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
    { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
    { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
    { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
    { playerId: 'D', bidType: 'dash', tricks: 0 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 4 },
    { playerId: 'B', actualTricks: 4 },
    { playerId: 'C', actualTricks: 3 },
    { playerId: 'D', actualTricks: 2 },
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

test('browser UI shell returns empty session history safely', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  assert.deepEqual(service.getSessionHistory(), { sessions: [] });
});

test('browser UI shell lists session history newest first with readable player names', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const friday = service.createScoreSheet({ name: 'Friday Game', players, nowIso: '2026-06-21T10:00:00.000Z' });
  const sunday = service.createScoreSheet({ name: 'Sunday Game', players, nowIso: '2026-06-23T18:30:00.000Z' });
  assert.equal(friday.valid, true, friday.errors.join('; '));
  assert.equal(sunday.valid, true, sunday.errors.join('; '));

  const savedFriday = service.saveRound(friday.scoreSheet?.id ?? '', validRound, '2026-06-21T10:05:00.000Z');
  assert.equal(savedFriday.valid, true, savedFriday.errors.join('; '));

  assert.deepEqual(service.getSessionHistory().sessions.map((session) => [
    session.name,
    session.players.join(','),
    session.roundCount,
    session.updatedAtLabel,
  ]), [
    ['Sunday Game', 'Ahmed,Bassem,Cairo,Dina', 0, '2026-06-23 18:30'],
    ['Friday Game', 'Ahmed,Bassem,Cairo,Dina', 1, '2026-06-21 10:05'],
  ]);
});

test('browser UI shell opens an existing session with leaderboard, analytics, and history', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());
  const created = service.createScoreSheet({ name: 'Friday Game', players, nowIso: '2026-06-21T10:00:00.000Z' });
  assert.equal(created.valid, true, created.errors.join('; '));

  const saved = service.saveRound(created.scoreSheet?.id ?? '', validRound, '2026-06-21T10:05:00.000Z');
  assert.equal(saved.valid, true, saved.errors.join('; '));

  const opened = service.openSession(created.scoreSheet?.id ?? '', '2026-06-21T10:06:00.000Z');

  assert.equal(opened.valid, true, opened.errors.join('; '));
  assert.equal(opened.scoreSheet?.name, 'Friday Game');
  assert.deepEqual(opened.leaderboard?.map((entry) => [entry.playerId, entry.totalScore]), [
    ['A', 14],
    ['B', 14],
    ['C', -1],
    ['D', -12],
  ]);
  assert.equal(opened.analytics?.title, 'Friday Game Analytics');
  assert.equal(opened.analytics?.generatedAtIso, '2026-06-21T10:06:00.000Z');
  assert.equal(opened.roundHistory?.length, 1);
  assert.equal(opened.roundHistory?.[0]?.roundNumber, 1);
});

test('browser UI shell returns validation error when opening missing session', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const opened = service.openSession('missing-session');

  assert.equal(opened.valid, false);
  assert.deepEqual(opened.errors, ['Score sheet not found: missing-session.']);
  assert.equal(opened.scoreSheet, undefined);
});

test('browser UI shell exposes game summary for score-sheet screens', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());
  const created = service.createScoreSheet({ name: 'Friday Game', players, nowIso: '2026-06-21T10:00:00.000Z' });
  assert.equal(created.valid, true, created.errors.join('; '));

  const saved = service.saveRound(created.scoreSheet?.id ?? '', validRound, '2026-06-21T10:05:00.000Z');
  assert.equal(saved.valid, true, saved.errors.join('; '));

  const summary = service.getGameSummary(created.scoreSheet?.id ?? '', '2026-06-21T10:06:00.000Z');

  assert.equal(summary.valid, true, summary.errors.join('; '));
  assert.equal(summary.summary?.name, 'Friday Game');
  assert.deepEqual(summary.summary?.leaderboard.map((row) => [row.rank, row.playerId, row.totalScore]), [
    [1, 'A', '14'],
    [2, 'B', '14'],
    [3, 'C', '-1'],
    [4, 'D', '-12'],
  ]);
  assert.equal(summary.summary?.recentRounds.length, 1);
  assert.equal(summary.summary?.analytics.generatedAtIso, '2026-06-21T10:06:00.000Z');
});

test('browser UI shell returns validation error when game summary score sheet is missing', () => {
  const service = new BrowserUiShellService(new InMemoryScoreSheetRepository());

  const summary = service.getGameSummary('missing-summary');

  assert.equal(summary.valid, false);
  assert.deepEqual(summary.errors, ['Score sheet not found: missing-summary.']);
  assert.equal(summary.summary, undefined);
});
