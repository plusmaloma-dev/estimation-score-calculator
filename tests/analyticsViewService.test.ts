import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnalyticsViewService,
  EstimationMvpService,
  type MvpGameInput,
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
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'dash', tricks: 0 },
        { playerId: 'D', bidType: 'normal', tricks: 5, trumpSuit: 'clubs' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 2 },
        { playerId: 'C', actualTricks: 0 },
        { playerId: 'D', actualTricks: 7 },
      ],
    },
    {
      roundNumber: 2,
      profile,
      riskPlayerId: 'C',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 8, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'dash-call', tricks: 0 },
        { playerId: 'D', bidType: 'with', tricks: 4, trumpSuit: 'spades', withTargetPlayerId: 'A' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 8 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 1 },
      ],
    },
  ],
};

test('analytics view service formats dashboard-ready rows and metrics', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const model = new AnalyticsViewService().buildModel(gameResult, {
    title: 'Friday Analytics',
    generatedAt: '2026-06-22T10:00:00.000Z',
    playerOrder: gameInput.playerOrder,
  });

  assert.equal(model.title, 'Friday Analytics');
  assert.equal(model.empty, false);
  assert.equal(model.generatedAtIso, '2026-06-22T10:00:00.000Z');
  assert.deepEqual(model.summaryMetrics.map((metric) => [metric.label, metric.value]), [
    ['Total rounds', '2'],
    ['Valid rounds', '2'],
    ['Invalid rounds', '0'],
    ['Leader', 'A'],
    ['Most consistent', 'A'],
  ]);

  assert.deepEqual(model.rows.map((row) => row.playerId), ['A', 'B', 'D', 'C']);

  const playerA = model.rows.find((row) => row.playerId === 'A');
  assert.ok(playerA);
  assert.equal(playerA.rank, 1);
  assert.equal(playerA.totalScore, '112');
  assert.equal(playerA.averageScore, '56');
  assert.equal(playerA.exactBidRate, '100%');
  assert.equal(playerA.dashSuccessRate, '—');

  const playerC = model.rows.find((row) => row.playerId === 'C');
  assert.ok(playerC);
  assert.equal(playerC.dashAttempts, '1');
  assert.equal(playerC.dashSuccessRate, '100%');
  assert.equal(playerC.riskAttempts, '1');
  assert.equal(playerC.riskSuccessRate, '0%');
});

test('analytics view service renders an empty dashboard safely', () => {
  const gameResult = new EstimationMvpService().calculateGame({ rounds: [] });
  const model = new AnalyticsViewService().buildModel(gameResult);

  assert.equal(model.title, 'Player Analytics');
  assert.equal(model.empty, true);
  assert.equal(model.rows.length, 0);
  assert.deepEqual(model.summaryMetrics.map((metric) => [metric.label, metric.value]), [
    ['Total rounds', '0'],
    ['Valid rounds', '0'],
    ['Invalid rounds', '0'],
    ['Leader', '—'],
    ['Most consistent', '—'],
  ]);
});
