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

interface AcceptanceCase {
  readonly name: string;
  readonly input: RoundScoreInput;
  readonly expectedScores: Readonly<Record<string, number>>;
  readonly expectedOwnerOutcome?: RoundScoreInput['roundType'] extends never ? never : 'owner-won' | 'owner-lost';
  readonly expectedNextRoundMultiplier?: number;
}

const cases: readonly AcceptanceCase[] = [
  {
    name: 'under risk: total estimates 11, risk taker fails',
    input: {
      roundNumber: 1,
      roundType: 'under',
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
      profile,
    },
    expectedScores: { A: 13, B: 13, C: -1, D: -11 },
  },
  {
    name: 'over double risk: total estimates 17, only winner bonus applies',
    input: {
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
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 3 },
      ],
      profile,
    },
    expectedScores: { A: 24, B: -1, C: -1, D: -22 },
  },
  {
    name: 'dash call failure: delta, call penalty, and risk penalty stack',
    input: {
      roundNumber: 3,
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
    expectedScores: { A: -37, B: 25, C: -1, D: -3 },
  },
  {
    name: 'with partner follows bid-owner win scoring',
    input: {
      roundNumber: 4,
      roundType: 'over',
      riskPlayerId: 'D',
      bidOwnerPlayerId: 'A',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 6 },
        { playerId: 'B', bidType: 'with', tricks: 6, withTargetPlayerId: 'A' },
        { playerId: 'C', bidType: 'normal', tricks: 2 },
        { playerId: 'D', bidType: 'normal', tricks: 1 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 6 },
        { playerId: 'B', actualTricks: 6 },
        { playerId: 'C', actualTricks: 1 },
        { playerId: 'D', actualTricks: 0 },
      ],
      profile,
    },
    expectedScores: { A: 26, B: 26, C: -1, D: -11 },
    expectedOwnerOutcome: 'owner-won',
  },
  {
    name: 'all players lose: scores are zero and next round becomes x2',
    input: {
      roundNumber: 5,
      roundType: 'over',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 4 },
        { playerId: 'C', bidType: 'normal', tricks: 4 },
        { playerId: 'D', bidType: 'normal', tricks: 3 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 3 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 4 },
      ],
      profile,
    },
    expectedScores: { A: 0, B: 0, C: 0, D: 0 },
    expectedNextRoundMultiplier: 2,
  },
  {
    name: 'consecutive all-loser round: existing x2 escalates next round to x4',
    input: {
      roundNumber: 6,
      roundType: 'over',
      roundMultiplier: 2,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 4 },
        { playerId: 'C', bidType: 'normal', tricks: 4 },
        { playerId: 'D', bidType: 'normal', tricks: 3 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 3 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 4 },
      ],
      profile,
    },
    expectedScores: { A: 0, B: 0, C: 0, D: 0 },
    expectedNextRoundMultiplier: 4,
  },
];

for (const acceptanceCase of cases) {
  test(`acceptance dataset - ${acceptanceCase.name}`, () => {
    const result = new ScoreCalculationService().calculateRoundScore(acceptanceCase.input);

    assert.equal(result.valid, true, result.errors.join('; '));
    assert.deepEqual(
      Object.fromEntries(result.playerScores.map((score) => [score.playerId, score.score])),
      acceptanceCase.expectedScores,
    );

    if (acceptanceCase.expectedOwnerOutcome !== undefined) {
      assert.equal(result.ownerOutcome, acceptanceCase.expectedOwnerOutcome);
    }

    if (acceptanceCase.expectedNextRoundMultiplier !== undefined) {
      assert.equal(result.nextRoundMultiplier, acceptanceCase.expectedNextRoundMultiplier);
    }
  });
}
