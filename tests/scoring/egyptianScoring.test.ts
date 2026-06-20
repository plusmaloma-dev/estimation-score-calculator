import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreCalculationService } from '../../src/scoring/ScoreCalculationService.js';
import type { RoundScoreInput, ScoringProfile } from '../../src/scoring/types.js';

const egyptianProfile: ScoringProfile = {
  id: 'egyptian-default',
  name: 'Egyptian Estimation Default',
  type: 'standard',
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  underDashSuccessBonus: 10,
  underDashFailurePenalty: 10,
  highContractThreshold: 8,
  highContractWinBase: 68,
  highContractWinStep: 11,
  highContractLossBasePenalty: -40,
  highContractLossStepPenalty: -10,
};

function scoreByPlayer(input: RoundScoreInput): Map<string, number> {
  const result = new ScoreCalculationService().calculateRoundScore(input);

  assert.equal(result.valid, true, result.errors.join('\n'));
  return new Map(result.playerScores.map((score) => [score.playerId, score.score]));
}

test('scores a round where the bid owner is not player 1', () => {
  const scores = scoreByPlayer({
    roundNumber: 1,
    roundType: 'over',
    bidOwnerPlayerId: 'B',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4 },
      { playerId: 'B', bidType: 'normal', tricks: 7 },
      { playerId: 'C', bidType: 'normal', tricks: 1 },
      { playerId: 'D', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 7 },
      { playerId: 'C', actualTricks: 1 },
      { playerId: 'D', actualTricks: 1 },
    ],
    profile: egyptianProfile,
  });

  assert.equal(scores.get('A'), 14);
  assert.equal(scores.get('B'), 27);
  assert.equal(scores.get('C'), 11);
  assert.equal(scores.get('D'), 11);
});

test('scores With player like bid owner when owner is player 3', () => {
  const scores = scoreByPlayer({
    roundNumber: 2,
    roundType: 'over',
    bidOwnerPlayerId: 'C',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4 },
      { playerId: 'B', bidType: 'with', tricks: 5, withTargetPlayerId: 'C' },
      { playerId: 'C', bidType: 'normal', tricks: 5 },
      { playerId: 'D', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 0 },
    ],
    profile: egyptianProfile,
  });

  assert.equal(scores.get('A'), 14);
  assert.equal(scores.get('B'), -11);
  assert.equal(scores.get('C'), 25);
  assert.equal(scores.get('D'), -1);
});

test('applies only-winner bonus independent of bid owner position', () => {
  const scores = scoreByPlayer({
    roundNumber: 3,
    roundType: 'under',
    bidOwnerPlayerId: 'D',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4 },
      { playerId: 'B', bidType: 'normal', tricks: 4 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 3 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 2 },
      { playerId: 'D', actualTricks: 4 },
    ],
    profile: egyptianProfile,
  });

  assert.equal(scores.get('A'), -1);
  assert.equal(scores.get('B'), -2);
  assert.equal(scores.get('C'), 22);
  assert.equal(scores.get('D'), -11);
});

test('sets all scores to zero when all players lose', () => {
  const scores = scoreByPlayer({
    roundNumber: 4,
    roundType: 'under',
    bidOwnerPlayerId: 'D',
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4 },
      { playerId: 'B', bidType: 'normal', tricks: 4 },
      { playerId: 'C', bidType: 'normal', tricks: 3 },
      { playerId: 'D', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 3 },
      { playerId: 'B', actualTricks: 5 },
      { playerId: 'C', actualTricks: 2 },
      { playerId: 'D', actualTricks: 3 },
    ],
    profile: egyptianProfile,
  });

  assert.deepEqual([...scores.values()], [0, 0, 0, 0]);
});
