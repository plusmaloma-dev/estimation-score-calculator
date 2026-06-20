import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoreCalculationService } from '../src/scoring/ScoreCalculationService.js';
import type { RoundScoreInput } from '../src/scoring/types.js';

const baseInput: RoundScoreInput = {
  roundNumber: 1,
  roundType: 'over',
  winningContractNumber: 5,
  trumpSuit: 'spades',
  profile: {
    id: 'custom-profile',
    name: 'Custom Test Profile',
    type: 'custom',
    normalBidSuccessBase: 10,
    normalBidSuccessPerTrick: 10,
    normalBidFailurePenaltyPerTrickDifference: 10,
  },
  bids: [
    { playerId: 'p1', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
    { playerId: 'p2', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
    { playerId: 'p3', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
    { playerId: 'p4', bidType: 'normal', tricks: 2, trumpSuit: 'clubs' },
  ],
  actualResults: [
    { playerId: 'p1', actualTricks: 5 },
    { playerId: 'p2', actualTricks: 3 },
    { playerId: 'p3', actualTricks: 3 },
    { playerId: 'p4', actualTricks: 2 },
  ],
};

test('calculates normal bid scores when a custom scoring formula is configured', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore(baseInput);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);

  const p1 = result.playerScores.find((score) => score.playerId === 'p1');
  const p2 = result.playerScores.find((score) => score.playerId === 'p2');

  assert.equal(p1?.status, 'success');
  assert.equal(p1?.score, 60);
  assert.equal(p2?.status, 'failed');
  assert.equal(p2?.score, -10);
});

test('keeps unconfirmed standard scoring formulas isolated as pending rule results', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    ...baseInput,
    profile: {
      id: 'standard-profile',
      name: 'Standard Profile Pending Confirmation',
      type: 'standard',
    },
  });

  assert.equal(result.valid, true);
  assert.ok(result.playerScores.every((score) => score.status === 'pending-rule'));
  assert.ok(result.playerScores.every((score) => score.score === 0));
});

test('blocks round scoring when actual tricks do not total 13', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    ...baseInput,
    actualResults: [
      { playerId: 'p1', actualTricks: 5 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 3 },
      { playerId: 'p4', actualTricks: 1 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Total actual tricks must equal 13.'));
});

test('applies configured high-contract multiplier', () => {
  const service = new ScoreCalculationService();
  const result = service.calculateRoundScore({
    ...baseInput,
    winningContractNumber: 8,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 8, trumpSuit: 'no-trump' },
      { playerId: 'p2', bidType: 'normal', tricks: 3, trumpSuit: 'spades' },
      { playerId: 'p3', bidType: 'normal', tricks: 2, trumpSuit: 'hearts' },
      { playerId: 'p4', bidType: 'normal', tricks: 1, trumpSuit: 'diamonds' },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 8 },
      { playerId: 'p2', actualTricks: 2 },
      { playerId: 'p3', actualTricks: 2 },
      { playerId: 'p4', actualTricks: 1 },
    ],
    profile: {
      ...baseInput.profile,
      highContractThreshold: 8,
      highContractMultiplier: 2,
    },
  });

  const p1 = result.playerScores.find((score) => score.playerId === 'p1');

  assert.equal(result.valid, true);
  assert.equal(p1?.status, 'success');
  assert.equal(p1?.score, 180);
});
