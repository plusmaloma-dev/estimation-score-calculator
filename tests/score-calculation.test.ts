import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreCalculationService } from '../src/scoring/ScoreCalculationService.js';
import type { RoundScoreInput, ScoringProfile } from '../src/scoring/types.js';

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

function scoreOf(result: ReturnType<ScoreCalculationService['calculateRoundScore']>, playerId: string): number | undefined {
  return result.playerScores.find((score) => score.playerId === playerId)?.score;
}

test('calculates WITH loss using bid-owner loss formula and only-loser stacking', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    roundNumber: 1,
    roundType: 'over',
    bidOwnerPlayerId: 'p1',
    riskPlayerId: 'p3',
    profile: egyptianProfile,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
      { playerId: 'p3', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
      { playerId: 'p4', bidType: 'with', tricks: 4, trumpSuit: 'spades', withTargetPlayerId: 'p1' },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 4 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 3 },
      { playerId: 'p4', actualTricks: 3 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(scoreOf(result, 'p1'), 24);
  assert.equal(scoreOf(result, 'p2'), 13);
  assert.equal(scoreOf(result, 'p3'), 13);
  assert.equal(scoreOf(result, 'p4'), -21);
});

test('calculates DASH Under loss using delta, Dash penalty, Under risk, and only-loser penalty', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    roundNumber: 3,
    roundType: 'under',
    bidOwnerPlayerId: 'p2',
    riskPlayerId: 'p1',
    profile: egyptianProfile,
    bids: [
      { playerId: 'p1', bidType: 'dash', tricks: 0 },
      { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'p3', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
      { playerId: 'p4', bidType: 'normal', tricks: 2, trumpSuit: 'clubs' },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 2 },
      { playerId: 'p2', actualTricks: 5 },
      { playerId: 'p3', actualTricks: 4 },
      { playerId: 'p4', actualTricks: 2 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(scoreOf(result, 'p1'), -32);
  assert.equal(scoreOf(result, 'p2'), 25);
  assert.equal(scoreOf(result, 'p3'), 14);
  assert.equal(scoreOf(result, 'p4'), 12);
});

test('returns zero scores and next x2 multiplier when all players lose', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    roundNumber: 6,
    roundType: 'under',
    bidOwnerPlayerId: 'p1',
    profile: egyptianProfile,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 6, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
      { playerId: 'p3', bidType: 'normal', tricks: 2, trumpSuit: 'diamonds' },
      { playerId: 'p4', bidType: 'normal', tricks: 2, trumpSuit: 'clubs' },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 5 },
      { playerId: 'p2', actualTricks: 1 },
      { playerId: 'p3', actualTricks: 3 },
      { playerId: 'p4', actualTricks: 4 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.nextRoundMultiplier, 2);
  assert.deepEqual(result.playerScores.map((score) => score.score), [0, 0, 0, 0]);
});

test('applies x2 to normal rounds after all-loser round', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    roundNumber: 7,
    roundType: 'under',
    roundMultiplier: 2,
    bidOwnerPlayerId: 'p2',
    profile: egyptianProfile,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'p3', bidType: 'normal', tricks: 1, trumpSuit: 'diamonds' },
      { playerId: 'p4', bidType: 'normal', tricks: 2, trumpSuit: 'clubs' },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 4 },
      { playerId: 'p2', actualTricks: 5 },
      { playerId: 'p3', actualTricks: 1 },
      { playerId: 'p4', actualTricks: 3 },
    ],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.playerScores.map((score) => score.score), [28, 50, 22, -22]);
});

test('does not apply x2 multiplier to high-contract scores', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    roundNumber: 8,
    roundType: 'over',
    roundMultiplier: 2,
    bidOwnerPlayerId: 'p3',
    profile: egyptianProfile,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 2, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
      { playerId: 'p3', bidType: 'normal', tricks: 8, trumpSuit: 'no-trump' },
      { playerId: 'p4', bidType: 'normal', tricks: 1, trumpSuit: 'clubs' },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 2 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 8 },
      { playerId: 'p4', actualTricks: 0 },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(scoreOf(result, 'p3'), 68);
});
