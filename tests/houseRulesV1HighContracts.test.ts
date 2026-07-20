import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Federation2026ScoringStrategy,
  ScoreCalculationService,
  type RoundScoreInput,
  type ScoringProfile,
} from '../src/index.js';

const houseProfile: ScoringProfile = {
  id: 'house-rules-v1',
  name: 'House Rules V1',
  type: 'standard',
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  highContractThreshold: 8,
  highContractSuccessFormula: 'square',
  highContractFailurePenaltyBase: 30,
  highContractFailurePenaltyStep: 10,
  highContractWinBase: 80,
  highContractWinStep: 10,
  highContractLossBasePenalty: -80,
  highContractLossStepPenalty: -10,
};

const federationProfile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  highContractThreshold: 8,
};

function scoreFor(
  input: RoundScoreInput,
  playerId: string,
  service = new ScoreCalculationService(),
): number {
  const result = service.calculateRoundScore(input);
  assert.equal(result.valid, true, result.errors.join('; '));
  const player = result.playerScores.find((score) => score.playerId === playerId);
  assert.ok(player, `Missing score for ${playerId}`);
  return player.score;
}

function successRound(call: 8 | 9 | 10): RoundScoreInput {
  const lastActual = 10 - call;

  return {
    roundNumber: call,
    roundType: 'over',
    bidOwnerPlayerId: 'A',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: call },
      { playerId: 'B', bidType: 'normal', tricks: 2 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 2 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: call },
      { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 1 },
      { playerId: 'D', actualTricks: lastActual },
    ],
    profile: houseProfile,
  };
}

test('House Rules V1 successful calls 8, 9, and 10 score the square of the call', () => {
  assert.equal(scoreFor(successRound(8), 'A'), 64);
  assert.equal(scoreFor(successRound(9), 'A'), 81);
  assert.equal(scoreFor(successRound(10), 'A'), 100);
});

test('House Rules V1 failed high calls use delta plus an escalating base penalty', () => {
  const cases = [
    { call: 8, actual: 7, expected: -31 },
    { call: 9, actual: 7, expected: -42 },
    { call: 10, actual: 6, expected: -54 },
  ] as const;

  for (const scenario of cases) {
    const score = scoreFor(
      {
        roundNumber: scenario.call,
        roundType: 'over',
        bidOwnerPlayerId: 'A',
        bids: [
          { playerId: 'A', bidType: 'normal', tricks: scenario.call },
          { playerId: 'B', bidType: 'normal', tricks: 2 },
          { playerId: 'C', bidType: 'normal', tricks: 2 },
          { playerId: 'D', bidType: 'normal', tricks: 2 },
        ],
        actualResults: [
          { playerId: 'A', actualTricks: scenario.actual },
          { playerId: 'B', actualTricks: 2 },
          { playerId: 'C', actualTricks: 1 },
          { playerId: 'D', actualTricks: 10 - scenario.actual },
        ],
        profile: houseProfile,
      },
      'A',
    );

    assert.equal(score, scenario.expected);
  }
});

test('House Rules V1 WITH uses the same high-call formula independently', () => {
  const input: RoundScoreInput = {
    roundNumber: 1,
    roundType: 'over',
    bidOwnerPlayerId: 'A',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 9 },
      { playerId: 'B', bidType: 'with', tricks: 9, withTargetPlayerId: 'A' },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 9 },
      { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 1 },
      { playerId: 'D', actualTricks: 1 },
    ],
    profile: houseProfile,
  };

  assert.equal(scoreFor(input, 'A'), 81);
  assert.equal(scoreFor(input, 'B'), -47);
});

test('House Rules V1 modifiers stack after the high-call result and multiplier stays excluded', () => {
  const riskScore = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      roundMultiplier: 2,
      riskPlayerId: 'A',
      bidOwnerPlayerId: 'A',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 8 },
        { playerId: 'B', bidType: 'normal', tricks: 3 },
        { playerId: 'C', bidType: 'normal', tricks: 2 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 8 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 1 },
      ],
      profile: houseProfile,
    },
    'A',
  );

  const onlyWinnerScore = scoreFor(
    {
      roundNumber: 2,
      roundType: 'over',
      bidOwnerPlayerId: 'A',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 8 },
        { playerId: 'B', bidType: 'normal', tricks: 2 },
        { playerId: 'C', bidType: 'normal', tricks: 2 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 8 },
        { playerId: 'B', actualTricks: 1 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 3 },
      ],
      profile: houseProfile,
    },
    'A',
  );

  const onlyLoserScore = scoreFor(
    {
      roundNumber: 3,
      roundType: 'over',
      bidOwnerPlayerId: 'A',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 9 },
        { playerId: 'B', bidType: 'normal', tricks: 2 },
        { playerId: 'C', bidType: 'normal', tricks: 2 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 7 },
        { playerId: 'B', actualTricks: 2 },
        { playerId: 'C', actualTricks: 2 },
        { playerId: 'D', actualTricks: 2 },
      ],
      profile: houseProfile,
    },
    'A',
  );

  assert.equal(riskScore, 74);
  assert.equal(onlyWinnerScore, 74);
  assert.equal(onlyLoserScore, -52);
});

test('Federation 2026 Super 8 scoring remains unchanged', () => {
  const service = new ScoreCalculationService(new Federation2026ScoringStrategy());
  const score = scoreFor(
    {
      roundNumber: 1,
      roundType: 'over',
      bidOwnerPlayerId: 'A',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 8 },
        { playerId: 'B', bidType: 'normal', tricks: 2 },
        { playerId: 'C', bidType: 'normal', tricks: 2 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 8 },
        { playerId: 'B', actualTricks: 2 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 2 },
      ],
      profile: federationProfile,
    },
    'A',
    service,
  );

  assert.equal(score, 41);
});
