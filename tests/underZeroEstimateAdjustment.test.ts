import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EstimationMvpService,
  ScoreCalculationService,
  houseRulesV1ScoringProfile,
  type RoundScoreInput,
} from '../src/index.js';

function playerScore(input: RoundScoreInput, playerId: string) {
  const result = new ScoreCalculationService().calculateRoundScore(input);
  assert.equal(result.valid, true, result.errors.join('; '));
  const score = result.playerScores.find((candidate) => candidate.playerId === playerId);
  assert.ok(score);
  return score;
}

test('House Rules Under adds 10 to a successful normal zero estimate', () => {
  const score = playerScore({
    roundNumber: 1,
    roundType: 'under',
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 0 },
    ],
  }, 'D');

  assert.equal(score.score, 20);
  assert.ok(score.notes.includes('Under zero estimate successful: +10 adjustment applied.'));
});

test('House Rules Under subtracts 10 from a failed normal zero estimate', () => {
  const score = playerScore({
    roundNumber: 1,
    roundType: 'under',
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 2 },
    ],
  }, 'D');

  assert.equal(score.score, -12);
  assert.ok(score.notes.includes('Under zero estimate failed: -10 adjustment applied.'));
});

test('zero adjustment precedes Risk, Only Winner, carry, and Multiple WITH', () => {
  const score = playerScore({
    roundNumber: 2,
    roundType: 'under',
    roundMultiplier: 2,
    multipleWithMultiplier: 2,
    bidOwnerPlayerId: 'A',
    riskPlayerId: 'D',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 0 },
    ],
  }, 'D');

  assert.equal(score.score, 200);
  assert.deepEqual(score.notes.slice(-2), [
    'Round multiplier applied: x2.',
    'Multiple With multiplier applied: x2.',
  ]);
});

test('Dash Call does not receive the normal zero-estimate adjustment', () => {
  const score = playerScore({
    roundNumber: 3,
    roundType: 'under',
    bidOwnerPlayerId: 'B',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'dash-call', tricks: 0 },
      { playerId: 'B', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'normal', tricks: 3 },
      { playerId: 'D', bidType: 'normal', tricks: 2 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 0 },
      { playerId: 'B', actualTricks: 5 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 4 },
    ],
  }, 'A');

  assert.equal(score.score, 35);
  assert.equal(score.notes.some((note) => note.includes('Under zero estimate')), false);
});

test('Over rounds do not receive the normal zero-estimate adjustment', () => {
  const score = playerScore({
    roundNumber: 4,
    roundType: 'over',
    bidOwnerPlayerId: 'B',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 0 },
      { playerId: 'B', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      { playerId: 'C', bidType: 'normal', tricks: 5 },
      { playerId: 'D', bidType: 'normal', tricks: 5 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 0 },
      { playerId: 'B', actualTricks: 5 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 3 },
    ],
  }, 'A');

  assert.equal(score.score, 10);
  assert.equal(score.notes.some((note) => note.includes('Under zero estimate')), false);
});

test('exact-13 estimates remain invalid instead of receiving the adjustment', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 5,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'B',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 0 },
      { playerId: 'B', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'normal', tricks: 4 },
      { playerId: 'D', bidType: 'normal', tricks: 4 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 0 },
      { playerId: 'B', actualTricks: 5 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 4 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Total estimates cannot equal 13. The round must be Over or Under.'));
});

test('Federation 2026 does not receive the House Rules zero adjustment', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 6,
    bidValidationMode: 'round-estimates',
    ruleSet: 'FEDERATION_2026',
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 0 },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  const score = result.scoreResult?.playerScores.find((candidate) => candidate.playerId === 'D');
  assert.equal(score?.score, 13);
  assert.equal(score?.notes.some((note) => note.includes('Under zero estimate')), false);
});

test('House Rules all-loser precedence still gives every player zero', () => {
  const result = new ScoreCalculationService().calculateRoundScore({
    roundNumber: 7,
    roundType: 'under',
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'clubs' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 4 },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.deepEqual(result.playerScores.map((score) => score.score), [0, 0, 0, 0]);
  assert.equal(result.nextRoundMultiplier, 2);
});
