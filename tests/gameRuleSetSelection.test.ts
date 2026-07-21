import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  FEDERATION_2026,
  HOUSE_RULES_V1,
  houseRulesV1ScoringProfile,
  type MvpRoundInput,
} from '../src/index.js';

function highCallRound(roundNumber: number, call: 8 | 9 | 10): MvpRoundInput {
  const supportingCall = call === 9 ? 5 : 4;

  return {
    roundNumber,
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: call, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: supportingCall, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'dash', tricks: 0 },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: call },
      { playerId: 'B', actualTricks: 12 - call },
      { playerId: 'C', actualTricks: 0 },
      { playerId: 'D', actualTricks: 1 },
    ],
  };
}

function scoreFor(result: ReturnType<EstimationMvpService['calculateGame']>, roundIndex: number, playerId: string): number {
  const score = result.rounds[roundIndex]?.scoreResult?.playerScores.find((entry) => entry.playerId === playerId);
  assert.ok(score, `Missing score for ${playerId} in round ${roundIndex + 1}`);
  return score.score;
}

test('legacy games resolve to House Rules V1', () => {
  const result = new EstimationMvpService().calculateGame({
    rounds: [highCallRound(1, 8)],
    playerOrder: ['A', 'B', 'C', 'D'],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.ruleSet, HOUSE_RULES_V1);
  assert.equal(scoreFor(result, 0, 'A'), 64);
});

test('explicit Federation 2026 game selection resolves the federation strategy automatically', () => {
  const result = new EstimationMvpService().calculateGame({
    ruleSet: FEDERATION_2026,
    rounds: [highCallRound(1, 8)],
    playerOrder: ['A', 'B', 'C', 'D'],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.ruleSet, FEDERATION_2026);
  assert.equal(scoreFor(result, 0, 'A'), 41);
});

test('explicit House Rules V1 game selection uses the canonical house profile', () => {
  const result = new EstimationMvpService().calculateGame({
    ruleSet: HOUSE_RULES_V1,
    rounds: [
      {
        ...highCallRound(1, 9),
        profile: {
          id: 'caller-supplied-profile',
          name: 'Caller supplied profile',
          type: 'custom',
          winnerBaseBonus: 13,
          highContractThreshold: 8,
          highContractWinBase: 999,
          highContractWinStep: 999,
        },
      },
    ],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.ruleSet, HOUSE_RULES_V1);
  assert.equal(scoreFor(result, 0, 'A'), 81);
});

test('all rounds in a game use the same selected rule set', () => {
  const result = new EstimationMvpService().calculateGame({
    ruleSet: FEDERATION_2026,
    rounds: [highCallRound(1, 8), highCallRound(2, 9)],
  });

  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(scoreFor(result, 0, 'A'), 41);
  assert.equal(scoreFor(result, 1, 'A'), 42);
});
