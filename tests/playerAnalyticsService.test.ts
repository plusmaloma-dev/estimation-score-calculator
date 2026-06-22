import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  PlayerAnalyticsService,
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
    {
      roundNumber: 3,
      profile,
      riskPlayerId: 'D',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'normal', tricks: 5, trumpSuit: 'clubs' },
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

test('player analytics summarize dashboard-ready rates and rankings without recalculating scores', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const summary = new PlayerAnalyticsService().summarizeGame(gameResult, { playerOrder: gameInput.playerOrder });

  assert.equal(summary.totalRounds, 3);
  assert.equal(summary.validRounds, 3);
  assert.equal(summary.invalidRounds, 0);
  assert.equal(summary.players.length, 4);
  assert.equal(summary.leaderPlayerId, summary.players[0]?.playerId);

  const playerA = summary.players.find((entry) => entry.playerId === 'A');
  assert.ok(playerA);
  assert.equal(playerA.roundsPlayed, 3);
  assert.equal(playerA.highContractRounds, 1);
  assert.equal(playerA.exactBidRate, 1);
  assert.equal(playerA.failureRate, 0);

  const playerC = summary.players.find((entry) => entry.playerId === 'C');
const playerC = summary.players.find((entry) => entry.playerId === 'C');
assert.ok(playerC);
assert.equal(playerC.dashAttempts, 1);
assert.equal(playerC.dashSuccessRate, 1);
assert.equal(playerC.dashCallAttempts, 0);
assert.equal(playerC.dashCallSuccessRate, 0);
assert.equal(playerC.riskAttempts, 1);
assert.equal(playerC.riskSuccessRate, 0);

const playerD = summary.players.find((entry) => entry.playerId === 'D');
assert.ok(playerD);
assert.equal(playerD.withRounds, 1);
assert.equal(playerD.doubleRiskAttempts, 1);
assert.equal(playerD.doubleRiskSuccessRate, 0);

  const playerD = summary.players.find((entry) => entry.playerId === 'D');
  assert.ok(playerD);
  assert.equal(playerD.withRounds, 1);
  assert.equal(playerD.doubleRiskAttempts, 1);
  assert.equal(playerD.doubleRiskSuccessRate, 0);
});

test('player analytics count all-loser rounds and invalid-round metadata', () => {
  const gameResult = new EstimationMvpService().calculateGame({
    playerOrder: ['A', 'B', 'C', 'D'],
    rounds: [
      {
        roundNumber: 1,
        profile,
        bids: [
          { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
          { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
          { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
          { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
        ],
        actualResults: [
          { playerId: 'A', actualTricks: 5 },
          { playerId: 'B', actualTricks: 3 },
          { playerId: 'C', actualTricks: 3 },
          { playerId: 'D', actualTricks: 2 },
        ],
      },
      {
        roundNumber: 2,
        profile,
        bids: [
          { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
          { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
          { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
          { playerId: 'D', bidType: 'normal', tricks: 3, trumpSuit: 'clubs' },
        ],
        actualResults: [
          { playerId: 'A', actualTricks: 4 },
          { playerId: 'B', actualTricks: 3 },
          { playerId: 'C', actualTricks: 3 },
          { playerId: 'D', actualTricks: 3 },
        ],
      },
    ],
  });

  const summary = new PlayerAnalyticsService().summarizeGame(gameResult);

  assert.equal(summary.totalRounds, 2);
  assert.equal(summary.validRounds, 1);
  assert.equal(summary.invalidRounds, 1);
  assert.equal(summary.players.every((entry) => entry.allLoserRounds === 1), true);
});
