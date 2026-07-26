import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
