import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  StatisticsService,
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
  dashFailureScore: -10,
  dashCallSuccessScore: 35,
  dashCallFailureScore: -35,
};

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 5 },
        { playerId: 'C', bidType: 'dash', tricks: 0 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
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
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 8 },
        { playerId: 'B', bidType: 'normal', tricks: 4 },
        { playerId: 'C', bidType: 'dash-call', tricks: 0 },
        { playerId: 'D', bidType: 'with', tricks: 2 },
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

test('statistics summarize valid calculated game results by player', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const summary = new StatisticsService().summarizeGame(gameResult, { playerOrder: gameInput.playerOrder });

  assert.equal(summary.totalRounds, 2);
  assert.equal(summary.validRounds, 2);
  assert.equal(summary.invalidRounds, 0);
  assert.equal(summary.playerStatistics.length, 4);

  const playerA = summary.playerStatistics.find((entry) => entry.playerId === 'A');
  assert.ok(playerA);
  assert.equal(playerA.roundsPlayed, 2);
  assert.equal(playerA.successfulRounds, 2);
  assert.equal(playerA.failedRounds, 0);
  assert.equal(playerA.exactBidRate, 1);
  assert.equal(playerA.highContractRounds, 1);
  assert.equal(playerA.averageScore, playerA.totalScore / 2);

  const playerC = summary.playerStatistics.find((entry) => entry.playerId === 'C');
  assert.ok(playerC);
  assert.equal(playerC.dashSuccesses, 1);
  assert.equal(playerC.dashCallFailures, 1);
  assert.equal(playerC.roundsPlayed, 2);

  const playerD = summary.playerStatistics.find((entry) => entry.playerId === 'D');
  assert.ok(playerD);
  assert.equal(playerD.withRounds, 1);
});

test('statistics ignore invalid rounds but count them in summary metadata', () => {
  const gameResult = new EstimationMvpService().calculateGame({
    playerOrder: ['A', 'B', 'C', 'D'],
    rounds: [
      ...gameInput.rounds,
      {
        roundNumber: 3,
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
      },
    ],
  });

  const summary = new StatisticsService().summarizeGame(gameResult);

  assert.equal(summary.totalRounds, 3);
  assert.equal(summary.validRounds, 2);
  assert.equal(summary.invalidRounds, 1);
  assert.equal(summary.playerStatistics.every((entry) => entry.roundsPlayed === 2), true);
});
