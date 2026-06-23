import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  GameSummaryViewService,
  type MvpGameInput,
  type PersistedScoreSheet,
  type ScoringProfile,
} from '../src/index.js';

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

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
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
    },
    {
      roundNumber: 2,
      profile,
      riskPlayerId: 'C',
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
    },
  ],
};

const gameResult = new EstimationMvpService().calculateGame(gameInput);

const scoreSheet: PersistedScoreSheet = {
  id: 'score-sheet-1',
  name: 'Friday Game',
  status: 'draft',
  createdAtIso: '2026-06-21T10:00:00.000Z',
  updatedAtIso: '2026-06-21T10:10:00.000Z',
  playerOrder: ['A', 'B', 'C', 'D'],
  roundCount: 2,
  gameInput,
  gameResult,
};

test('game summary view service builds header, leaderboard, stats, and actions', () => {
  const model = new GameSummaryViewService().buildModel(scoreSheet, {
    generatedAt: '2026-06-21T10:11:00.000Z',
  });

  assert.equal(model.id, 'score-sheet-1');
  assert.equal(model.name, 'Friday Game');
  assert.equal(model.status, 'draft');
  assert.deepEqual(model.players, ['A', 'B', 'C', 'D']);
  assert.equal(model.roundCount, 2);
  assert.deepEqual(model.leaderboard.map((row) => [row.rank, row.playerId, row.totalScore]), [
    [1, 'A', '28'],
    [2, 'B', '28'],
    [3, 'C', '-2'],
    [4, 'D', '-24'],
  ]);
  assert.deepEqual(model.statistics.map((metric) => [metric.label, metric.value]), [
    ['Total rounds', '2'],
    ['Valid rounds', '2'],
    ['Invalid rounds', '0'],
    ['Leader', 'A'],
    ['Most consistent', 'A'],
  ]);
  assert.deepEqual(model.actions.map((action) => [action.id, action.enabled]), [
    ['resume', true],
    ['analytics', true],
    ['round-history', true],
    ['export-backup', true],
    ['export-markdown', true],
    ['export-csv', true],
  ]);
  assert.equal(model.analytics.generatedAtIso, '2026-06-21T10:11:00.000Z');
});

test('game summary view service exposes recent rounds with winners and risk metadata', () => {
  const model = new GameSummaryViewService().buildModel(scoreSheet, { recentRoundLimit: 1 });

  assert.deepEqual(model.recentRounds, [
    {
      roundNumber: 2,
      roundType: 'under',
      valid: true,
      winnerPlayerIds: ['A', 'B'],
      riskTypes: ['round-risk'],
      nextRoundMultiplier: '—',
    },
  ]);
});

test('game summary view service disables round-dependent actions for empty games', () => {
  const emptyInput: MvpGameInput = { playerOrder: ['A', 'B', 'C', 'D'], rounds: [] };
  const emptyScoreSheet: PersistedScoreSheet = {
    id: 'score-sheet-empty',
    name: 'Empty Game',
    status: 'draft',
    createdAtIso: '2026-06-21T10:00:00.000Z',
    updatedAtIso: '2026-06-21T10:00:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    roundCount: 0,
    gameInput: emptyInput,
    gameResult: new EstimationMvpService().calculateGame(emptyInput),
  };

  const model = new GameSummaryViewService().buildModel(emptyScoreSheet);

  assert.equal(model.recentRounds.length, 0);
  assert.deepEqual(model.actions.map((action) => [action.id, action.enabled]), [
    ['resume', true],
    ['analytics', false],
    ['round-history', false],
    ['export-backup', true],
    ['export-markdown', false],
    ['export-csv', false],
  ]);
});
