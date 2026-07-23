import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  houseRulesV1ScoringProfile,
  type MvpRoundInput,
} from '../src/index.js';

const allLoserRound: MvpRoundInput = {
  roundNumber: 1,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
    { playerId: 'B', bidType: 'normal', tricks: 4 },
    { playerId: 'C', bidType: 'normal', tricks: 2 },
    { playerId: 'D', bidType: 'normal', tricks: 1 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 4 },
    { playerId: 'B', actualTricks: 3 },
    { playerId: 'C', actualTricks: 3 },
    { playerId: 'D', actualTricks: 3 },
  ],
};

const scoredRound: MvpRoundInput = {
  roundNumber: 2,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
    { playerId: 'B', bidType: 'normal', tricks: 4 },
    { playerId: 'C', bidType: 'normal', tricks: 2 },
    { playerId: 'D', bidType: 'normal', tricks: 0 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 5 },
    { playerId: 'B', actualTricks: 4 },
    { playerId: 'C', actualTricks: 2 },
    { playerId: 'D', actualTricks: 2 },
  ],
};

test('all four losers score zero and the next scored round is multiplied by two', () => {
  const service = new EstimationMvpService();
  const baseRound = service.calculateRound(scoredRound);
  assert.equal(baseRound.valid, true, baseRound.errors.join('; '));
  const expectedBaseScores = baseRound.scoreResult?.playerScores.map((score) => score.score) ?? [];

  const result = service.calculateGame({
    playerOrder: ['A', 'B', 'C', 'D'],
    rounds: [allLoserRound, scoredRound],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.rounds[0]?.isAllLoserRound, true);
  assert.deepEqual(
    result.rounds[0]?.scoreResult?.playerScores.map((score) => score.score),
    [0, 0, 0, 0],
  );
  assert.equal(result.rounds[1]?.carriedAllLoserMultiplier, 2);
  assert.equal(result.rounds[1]?.carryConsumed, true);
  assert.deepEqual(
    result.rounds[1]?.scoreResult?.playerScores.map((score) => score.score),
    expectedBaseScores.map((score) => score * 2),
  );
});
