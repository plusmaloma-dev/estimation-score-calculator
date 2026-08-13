import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  houseRulesV1ScoringProfile,
  type MvpRoundInput,
} from '../src/index.js';

const players = ['A', 'B', 'C', 'D'] as const;

function withRoundNumber(round: MvpRoundInput, roundNumber: number): MvpRoundInput {
  return { ...round, roundNumber };
}

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

const highContractRound: MvpRoundInput = {
  roundNumber: 2,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId: 'A',
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 8, trumpSuit: 'no-trump' },
    { playerId: 'B', bidType: 'normal', tricks: 2 },
    { playerId: 'C', bidType: 'normal', tricks: 1 },
    { playerId: 'D', bidType: 'normal', tricks: 1 },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 8 },
    { playerId: 'B', actualTricks: 2 },
    { playerId: 'C', actualTricks: 1 },
    { playerId: 'D', actualTricks: 2 },
  ],
};

const multipleWithRound: MvpRoundInput = {
  roundNumber: 3,
  bidValidationMode: 'round-estimates',
  bidOwnerPlayerId: 'A',
  multipleWithMultiplier: 2,
  profile: houseRulesV1ScoringProfile,
  bids: [
    { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
    { playerId: 'B', bidType: 'normal', tricks: 0 },
    { playerId: 'C', bidType: 'with', tricks: 5, withTargetPlayerId: 'A' },
    { playerId: 'D', bidType: 'with', tricks: 5, withTargetPlayerId: 'A' },
  ],
  actualResults: [
    { playerId: 'A', actualTricks: 5 },
    { playerId: 'B', actualTricks: 1 },
    { playerId: 'C', actualTricks: 4 },
    { playerId: 'D', actualTricks: 3 },
  ],
};

function baseScores(service: EstimationMvpService, round: MvpRoundInput): number[] {
  const result = service.calculateRound(round);
  assert.equal(result.valid, true, result.errors.join('; '));
  return result.scoreResult?.playerScores.map((score) => score.score) ?? [];
}

test('all four losers score zero and the next scored round is multiplied by two', () => {
  const service = new EstimationMvpService();
  const expectedBaseScores = baseScores(service, scoredRound);
  const result = service.calculateGame({ playerOrder: players, rounds: [allLoserRound, scoredRound] });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.rounds[0]?.isAllLoserRound, true);
  assert.deepEqual(result.rounds[0]?.scoreResult?.playerScores.map((score) => score.score), [0, 0, 0, 0]);
  assert.equal(result.rounds[1]?.carriedAllLoserMultiplier, 2);
  assert.equal(result.rounds[1]?.carryConsumed, true);
  assert.deepEqual(result.rounds[1]?.scoreResult?.playerScores.map((score) => score.score), expectedBaseScores.map((score) => score * 2));
});

test('two and three consecutive all-loser rounds carry x4 and x6', () => {
  const service = new EstimationMvpService();
  const expectedBaseScores = baseScores(service, scoredRound);

  const x4 = service.calculateGame({
    playerOrder: players,
    rounds: [withRoundNumber(allLoserRound, 1), withRoundNumber(allLoserRound, 2), withRoundNumber(scoredRound, 3)],
  });
  assert.equal(x4.rounds[2]?.carriedAllLoserMultiplier, 4);
  assert.deepEqual(x4.rounds[2]?.scoreResult?.playerScores.map((score) => score.score), expectedBaseScores.map((score) => score * 4));

  const x6 = service.calculateGame({
    playerOrder: players,
    rounds: [
      withRoundNumber(allLoserRound, 1),
      withRoundNumber(allLoserRound, 2),
      withRoundNumber(allLoserRound, 3),
      withRoundNumber(scoredRound, 4),
    ],
  });
  assert.equal(x6.rounds[3]?.carriedAllLoserMultiplier, 6);
  assert.deepEqual(x6.rounds[3]?.scoreResult?.playerScores.map((score) => score.score), expectedBaseScores.map((score) => score * 6));
});

test('carry resets immediately after the next scored round', () => {
  const result = new EstimationMvpService().calculateGame({
    playerOrder: players,
    rounds: [withRoundNumber(allLoserRound, 1), withRoundNumber(scoredRound, 2), withRoundNumber(scoredRound, 3)],
  });

  assert.deepEqual(result.rounds.map((round) => round.carriedAllLoserMultiplier), [1, 2, 1]);
  assert.deepEqual(result.rounds.map((round) => round.carryConsumed), [false, true, false]);
});

test('a high-contract scored round consumes the same carried multiplier', () => {
  const service = new EstimationMvpService();
  const expectedBaseScores = baseScores(service, highContractRound);
  const result = service.calculateGame({ playerOrder: players, rounds: [allLoserRound, highContractRound] });

  assert.equal(result.rounds[1]?.carriedAllLoserMultiplier, 2);
  assert.deepEqual(result.rounds[1]?.scoreResult?.playerScores.map((score) => score.score), expectedBaseScores.map((score) => score * 2));
});

test('carried multiplier applies to positive and negative scores', () => {
  const service = new EstimationMvpService();
  const expectedBaseScores = baseScores(service, scoredRound);
  assert.ok(expectedBaseScores.some((score) => score < 0));
  const result = service.calculateGame({ playerOrder: players, rounds: [allLoserRound, scoredRound] });

  assert.deepEqual(result.rounds[1]?.scoreResult?.playerScores.map((score) => score.score), expectedBaseScores.map((score) => score * 2));
});

test('x4 carry stacks multiplicatively with Multiple WITH x2 for a total x8 effect', () => {
  const service = new EstimationMvpService();
  const ordinaryScores = baseScores(service, { ...multipleWithRound, multipleWithMultiplier: undefined });
  const result = service.calculateGame({
    playerOrder: players,
    rounds: [withRoundNumber(allLoserRound, 1), withRoundNumber(allLoserRound, 2), multipleWithRound],
  });

  assert.equal(result.rounds[2]?.carriedAllLoserMultiplier, 4);
  assert.deepEqual(result.rounds[2]?.scoreResult?.playerScores.map((score) => score.score), ordinaryScores.map((score) => score * 8));
});
