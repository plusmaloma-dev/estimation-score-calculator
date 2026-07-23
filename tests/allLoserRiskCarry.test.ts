import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  houseRulesV1ScoringProfile,
  type MvpRoundInput,
} from '../src/index.js';

const players = ['A', 'B', 'C', 'D'] as const;

const allLoserOverTwoRiskRound: MvpRoundInput = {
  roundNumber: 1,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId: 'A',
  riskPlayerId: 'D',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 8, trumpSuit: 'spades' },
    { playerId: 'B', bidType: 'normal', tricks: 5 },
    { playerId: 'C', bidType: 'normal', tricks: 1 },
    { playerId: 'D', bidType: 'normal', tricks: 1 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 7 },
    { playerId: 'B', actualTricks: 4 },
    { playerId: 'C', actualTricks: 2 },
    { playerId: 'D', actualTricks: 0 },
  ],
};

const nextScoredRound: MvpRoundInput = {
  roundNumber: 2,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
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

test('all-loser Over +2 keeps the Risk loss while carrying x2 into the next scored round', () => {
  const service = new EstimationMvpService();

  const directRound = service.calculateRound(allLoserOverTwoRiskRound);
  assert.equal(directRound.valid, true, directRound.errors.join('; '));
  assert.deepEqual(
    directRound.scoreResult?.playerScores.map((score) => score.score),
    [0, 0, 0, -10],
  );
  assert.equal(directRound.scoreResult?.playerScores[3]?.isRiskTaker, true);
  assert.equal(directRound.scoreResult?.playerScores[3]?.riskModifier, 10);

  const nextRoundBase = service.calculateRound(nextScoredRound);
  assert.equal(nextRoundBase.valid, true, nextRoundBase.errors.join('; '));
  const nextRoundBaseScores = nextRoundBase.scoreResult?.playerScores.map((score) => score.score) ?? [];

  const game = service.calculateGame({
    playerOrder: players,
    rounds: [allLoserOverTwoRiskRound, nextScoredRound],
  });

  assert.equal(game.valid, true, game.errors.join('; '));
  assert.equal(game.rounds[0]?.isAllLoserRound, true);
  assert.deepEqual(
    game.rounds[0]?.scoreResult?.playerScores.map((score) => score.score),
    [0, 0, 0, -10],
  );
  assert.equal(game.rounds[1]?.carriedAllLoserMultiplier, 2);
  assert.equal(game.rounds[1]?.carryConsumed, true);
  assert.deepEqual(
    game.rounds[1]?.scoreResult?.playerScores.map((score) => score.score),
    nextRoundBaseScores.map((score) => score * 2),
  );
});
