import assert from 'node:assert/strict';
import test from 'node:test';
import { houseRulesV1ScoringProfile } from '../../src/scoring/houseRulesV1Profile.js';
import { HOUSE_RULES_V1 } from '../../src/scoring/ruleSets.js';
import { EstimationMvpService } from '../../src/services/EstimationMvpService.js';

const service = new EstimationMvpService();

test('standalone score engine calculates a House Rules V1 round', () => {
  const result = service.calculateRound({
    roundNumber: 1,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'p2', bidType: 'normal', tricks: 3 },
      { playerId: 'p3', bidType: 'normal', tricks: 2 },
      { playerId: 'p4', bidType: 'normal', tricks: 1 },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 4 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 2 },
      { playerId: 'p4', actualTricks: 4 },
    ],
    profile: houseRulesV1ScoringProfile,
    ruleSet: HOUSE_RULES_V1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'p1',
    riskPlayerId: 'p4',
  });

  assert.equal(result.valid, true);
  assert.ok(result.scoreResult);
  assert.equal(result.scoreResult.playerScores.length, 4);
});

test('standalone score engine applies the House Rules Under zero-estimate bonus', () => {
  const result = service.calculateRound({
    roundNumber: 1,
    bids: [
      { playerId: 'p1', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'p2', bidType: 'normal', tricks: 3 },
      { playerId: 'p3', bidType: 'normal', tricks: 2 },
      { playerId: 'p4', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'p1', actualTricks: 5 },
      { playerId: 'p2', actualTricks: 3 },
      { playerId: 'p3', actualTricks: 5 },
      { playerId: 'p4', actualTricks: 0 },
    ],
    profile: houseRulesV1ScoringProfile,
    ruleSet: HOUSE_RULES_V1,
    bidValidationMode: 'round-estimates',
    bidOwnerPlayerId: 'p1',
    riskPlayerId: 'p3',
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  const zeroEstimator = result.scoreResult?.playerScores.find(
    (score) => score.playerId === 'p4',
  );
  assert.equal(zeroEstimator?.score, 20);
  assert.ok(zeroEstimator?.notes.includes(
    'Under zero estimate successful: +10 adjustment applied.',
  ));
});
