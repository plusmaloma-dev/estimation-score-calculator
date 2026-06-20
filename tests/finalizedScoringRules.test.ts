import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoreCalculationService, type RoundScoreInput, type ScoringProfile } from '../src/index.js';

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

function scoreFor(input: RoundScoreInput, playerId: string): number {
  const result = new ScoreCalculationService().calculateRoundScore(input);
  assert.equal(result.valid, true, result.errors.join('; '));
  const player = result.playerScores.find((score) => score.playerId === playerId);
  assert.ok(player, `Missing score for ${playerId}`);
  return player.score;
}

test('Dash in Over scores +10 when successful', () => {
  const score = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      bids: [
        { playerId: 'A', bidType: 'dash', tricks: 0 },
        { playerId: 'B', bidType: 'normal', tricks: 5 },
        { playerId: 'C', bidType: 'normal', tricks: 5 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 0 },
        { playerId: 'B', actualTricks: 5 },
        { playerId: 'C', actualTricks: 5 },
        { playerId: 'D', actualTricks: 3 },
      ],
      profile,
    },
    'A',
  );

  assert.equal(score, 10);
});

test('Dash in Over failure scores negative delta', () => {
  const score = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      bids: [
        { playerId: 'A', bidType: 'dash', tricks: 0 },
        { playerId: 'B', bidType: 'normal', tricks: 5 },
        { playerId: 'C', bidType: 'normal', tricks: 5 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 2 },
        { playerId: 'B', actualTricks: 5 },
        { playerId: 'C', actualTricks: 4 },
        { playerId: 'D', actualTricks: 2 },
      ],
      profile,
    },
    'A',
  );

  assert.equal(score, -2);
});

test('Dash Call scores +35 when successful', () => {
  const score = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      bids: [
        { playerId: 'A', bidType: 'dash-call', tricks: 0 },
        { playerId: 'B', bidType: 'normal', tricks: 5 },
        { playerId: 'C', bidType: 'normal', tricks: 5 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 0 },
        { playerId: 'B', actualTricks: 5 },
        { playerId: 'C', actualTricks: 5 },
        { playerId: 'D', actualTricks: 3 },
      ],
      profile,
    },
    'A',
  );

  assert.equal(score, 35);
});

test('Dash Call failure scores negative delta minus 25 and applies granted risk', () => {
  const score = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      riskPlayerId: 'A',
      bids: [
        { playerId: 'A', bidType: 'dash-call', tricks: 0 },
        { playerId: 'B', bidType: 'normal', tricks: 5 },
        { playerId: 'C', bidType: 'normal', tricks: 5 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 2 },
        { playerId: 'B', actualTricks: 5 },
        { playerId: 'C', actualTricks: 4 },
        { playerId: 'D', actualTricks: 2 },
      ],
      profile,
    },
    'A',
  );

  assert.equal(score, -37);
});

test('Double Risk applies +20 or -20 to the risk taker', () => {
  const successScore = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      riskPlayerId: 'D',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 4 },
        { playerId: 'C', bidType: 'normal', tricks: 4 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 5 },
      ],
      profile,
    },
    'D',
  );

  const failedScore = scoreFor(
    {
      roundNumber: 2,
      roundType: 'over',
      riskPlayerId: 'D',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 4 },
        { playerId: 'C', bidType: 'normal', tricks: 4 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 4 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 2 },
      ],
      profile,
    },
    'D',
  );

  assert.equal(successScore, 35);
  assert.equal(failedScore, -23);
});
