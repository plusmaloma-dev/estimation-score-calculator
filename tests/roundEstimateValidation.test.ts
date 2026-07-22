import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  FEDERATION_2026,
  type ScoringProfile,
} from '../src/index.js';

const profile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  ruleSet: FEDERATION_2026,
  highContractThreshold: 8,
};

test('accepted round estimates allow 0 through 12 and require trump only for the highest estimator', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'A',
    profile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 0 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 2 },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.scoreResult?.playerScores.length, 4);
  assert.equal(result.scoreResult?.playerScores.find((score) => score.playerId === 'A')?.role, 'bid-owner');
});

test('accepted round estimates reject any player estimate of 13', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'A',
    profile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 13, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 0 },
      { playerId: 'C', bidType: 'normal', tricks: 0 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 13 },
      { playerId: 'B', actualTricks: 0 },
      { playerId: 'C', actualTricks: 0 },
      { playerId: 'D', actualTricks: 0 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Round estimates must be between 0 and 12 tricks.'));
});

test('auction-call validation keeps the existing 4 through 13 normal contract rule', () => {
  const result = new EstimationMvpService().calculateRound({
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 3, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
      { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 3 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 3 },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Normal and With bids must be between 4 and 13 tricks.'));
});
