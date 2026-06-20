import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ScoreCalculationService } from '../../src/scoring/ScoreCalculationService.js';
import type { RoundScoreInput, ScoringProfile } from '../../src/scoring/types.js';

const profile: ScoringProfile = {
  id: 'egyptian-estimation-standard',
  name: 'Egyptian Estimation Standard',
  type: 'standard',
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  highContractThreshold: 8,
  highContractWinBase: 80,
  highContractWinStep: 10,
  highContractLossBasePenalty: -80,
  highContractLossStepPenalty: -10,
  dashSuccessScore: 10,
  dashFailureScore: 0,
  dashCallSuccessScore: 35,
  dashCallFailureScore: -25,
};

const allLoserRound: Omit<RoundScoreInput, 'roundNumber' | 'roundMultiplier'> = {
  roundType: 'under',
  bidOwnerPlayerId: 'p1',
  bids: [
    { playerId: 'p1', bidType: 'normal', tricks: 4 },
    { playerId: 'p2', bidType: 'normal', tricks: 3 },
    { playerId: 'p3', bidType: 'normal', tricks: 2 },
    { playerId: 'p4', bidType: 'normal', tricks: 1 },
  ],
  actualResults: [
    { playerId: 'p1', actualTricks: 5 },
    { playerId: 'p2', actualTricks: 4 },
    { playerId: 'p3', actualTricks: 3 },
    { playerId: 'p4', actualTricks: 1 },
  ],
  profile,
};

describe('consecutive all-loser multiplier', () => {
  it('sets the next round to x2 after the first all-loser round', () => {
    const service = new ScoreCalculationService();

    const result = service.calculateRoundScore({
      ...allLoserRound,
      roundNumber: 1,
    });

    assert.equal(result.valid, true);
    assert.equal(result.nextRoundMultiplier, 2);
    assert.deepEqual(result.playerScores.map((score) => score.score), [0, 0, 0, 0]);
    assert.match(result.playerScores[0]?.notes[0] ?? '', /x2 multiplier/);
  });

  it('escalates from x2 to x4 when the multiplied round is also all-loser', () => {
    const service = new ScoreCalculationService();

    const result = service.calculateRoundScore({
      ...allLoserRound,
      roundNumber: 2,
      roundMultiplier: 2,
    });

    assert.equal(result.valid, true);
    assert.equal(result.nextRoundMultiplier, 4);
    assert.deepEqual(result.playerScores.map((score) => score.score), [0, 0, 0, 0]);
    assert.match(result.playerScores[0]?.notes[0] ?? '', /x4 multiplier/);
  });
});
