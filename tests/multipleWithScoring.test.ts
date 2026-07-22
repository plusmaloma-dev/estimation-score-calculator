import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  houseRulesV1ScoringProfile,
} from '../src/index.js';

test('multiple With x2 applies after role scoring to every player', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'A',
    multipleWithMultiplier: 2,
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 2 },
      { playerId: 'C', bidType: 'with', tricks: 5, withTargetPlayerId: 'A' },
      { playerId: 'D', bidType: 'with', tricks: 5, withTargetPlayerId: 'A' },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 2 },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  const scores = new Map(result.scoreResult?.playerScores.map((score) => [score.playerId, score.score]));
  assert.equal(scores.get('A'), 50);
  assert.equal(scores.get('B'), 24);
  assert.equal(scores.get('C'), -22);
  assert.equal(scores.get('D'), -26);
});

test('multiple With x2 is the last modifier after Risk and Only Winner bonuses', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'A',
    riskPlayerId: 'D',
    multipleWithMultiplier: 2,
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 2 },
      { playerId: 'C', bidType: 'with', tricks: 5, withTargetPlayerId: 'A' },
      { playerId: 'D', bidType: 'with', tricks: 5, withTargetPlayerId: 'A' },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 1 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 5 },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  const riskWith = result.scoreResult?.playerScores.find((score) => score.playerId === 'D');
  assert.equal(riskWith?.role, 'with-player');
  assert.equal(riskWith?.isOnlyWinner, true);
  assert.equal(riskWith?.riskModifier, 20);
  assert.equal(riskWith?.score, 110);
  assert.ok(riskWith?.notes.includes('Multiple With multiplier applied: x2.'));
});

test('multiple With x2 also applies last to a high-contract result', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'A',
    multipleWithMultiplier: 2,
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 8, trumpSuit: 'no-trump' },
      { playerId: 'B', bidType: 'normal', tricks: 0 },
      { playerId: 'C', bidType: 'with', tricks: 8, withTargetPlayerId: 'A' },
      { playerId: 'D', bidType: 'with', tricks: 8, withTargetPlayerId: 'A' },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 8 },
      { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 2 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  const owner = result.scoreResult?.playerScores.find((score) => score.playerId === 'A');
  assert.equal(owner?.isHighContract, true);
  assert.equal(owner?.isOnlyWinner, true);
  assert.equal(owner?.score, 148);
});
