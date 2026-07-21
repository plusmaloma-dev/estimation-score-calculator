import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  FEDERATION_2026,
  HOUSE_RULES_V1,
  type MvpRoundInput,
  type PlayerScoreResult,
  type RoundScoreResult,
  type ScoringProfile,
} from '../src/index.js';

const federationProfile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  ruleSet: FEDERATION_2026,
  highContractThreshold: 8,
};

function calculateRound(
  round: MvpRoundInput,
  ruleSet: typeof FEDERATION_2026 | typeof HOUSE_RULES_V1 = FEDERATION_2026,
): RoundScoreResult {
  const gameResult = new EstimationMvpService().calculateGame({
    ruleSet,
    playerOrder: ['A', 'B', 'C', 'D'],
    rounds: [round],
  });

  assert.equal(gameResult.valid, true, gameResult.errors.join('; '));
  const roundResult = gameResult.rounds[0];
  assert.ok(roundResult?.scoreResult, 'Expected a scored round.');
  return roundResult.scoreResult;
}

function scoreFor(result: RoundScoreResult, playerId: string): PlayerScoreResult {
  const player = result.playerScores.find((score) => score.playerId === playerId);
  assert.ok(player, `Missing score for ${playerId}.`);
  return player;
}

function ownerAndNormalRound(actualTricks: readonly [number, number, number, number]): MvpRoundInput {
  return {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'dash', tricks: 0 },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: actualTricks[0] },
      { playerId: 'B', actualTricks: actualTricks[1] },
      { playerId: 'C', actualTricks: actualTricks[2] },
      { playerId: 'D', actualTricks: actualTricks[3] },
    ],
  };
}

test('Federation 2026 scores normal players and auction owners on success', () => {
  const result = calculateRound(ownerAndNormalRound([4, 4, 1, 4]));
  const owner = scoreFor(result, 'A');
  const normalPlayer = scoreFor(result, 'B');

  assert.equal(owner.score, 27);
  assert.equal(owner.role, 'bid-owner');
  assert.equal(normalPlayer.score, 17);
  assert.equal(normalPlayer.role, 'other-player');
});

test('Federation 2026 scores normal players and auction owners on failure', () => {
  const result = calculateRound(ownerAndNormalRound([3, 5, 0, 5]));
  const owner = scoreFor(result, 'A');
  const normalPlayer = scoreFor(result, 'B');

  assert.equal(owner.score, -11);
  assert.equal(owner.delta, 1);
  assert.equal(normalPlayer.score, -1);
  assert.equal(normalPlayer.delta, 1);
});

test('Federation 2026 WITH uses the owner calculation independently', () => {
  const baseRound = {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal' as const, tricks: 4, trumpSuit: 'spades' as const },
      {
        playerId: 'B',
        bidType: 'with' as const,
        tricks: 4,
        trumpSuit: 'spades' as const,
        withTargetPlayerId: 'A',
      },
      { playerId: 'C', bidType: 'dash' as const, tricks: 0 },
      { playerId: 'D', bidType: 'dash' as const, tricks: 0 },
    ],
  };

  const success = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 1 },
      { playerId: 'D', actualTricks: 4 },
    ],
  });
  const failed = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 0 },
      { playerId: 'D', actualTricks: 6 },
    ],
  });

  assert.equal(scoreFor(success, 'B').score, 27);
  assert.equal(scoreFor(success, 'B').role, 'with-player');
  assert.equal(scoreFor(failed, 'B').score, -11);
  assert.equal(scoreFor(failed, 'B').role, 'with-player');
});

test('Federation 2026 applies Risk to a non-owner risk taker', () => {
  const baseRound = {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    riskPlayerId: 'B',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal' as const, tricks: 4, trumpSuit: 'spades' as const },
      { playerId: 'B', bidType: 'normal' as const, tricks: 4, trumpSuit: 'hearts' as const },
      { playerId: 'C', bidType: 'normal' as const, tricks: 7, trumpSuit: 'diamonds' as const },
      { playerId: 'D', bidType: 'dash' as const, tricks: 0 },
    ],
  };

  const success = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });
  const failed = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });

  const successScore = scoreFor(success, 'B');
  const failureScore = scoreFor(failed, 'B');
  assert.equal(successScore.score, 27);
  assert.equal(successScore.isRiskTaker, true);
  assert.equal(successScore.riskModifier, 10);
  assert.equal(successScore.role, 'risk-taker');
  assert.equal(failureScore.score, -11);
  assert.equal(failureScore.riskModifier, 10);
});

test('Federation 2026 applies Double Risk to a non-owner risk taker', () => {
  const baseRound = {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    riskPlayerId: 'B',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal' as const, tricks: 4, trumpSuit: 'spades' as const },
      { playerId: 'B', bidType: 'normal' as const, tricks: 4, trumpSuit: 'hearts' as const },
      { playerId: 'C', bidType: 'normal' as const, tricks: 9, trumpSuit: 'diamonds' as const },
      { playerId: 'D', bidType: 'dash' as const, tricks: 0 },
    ],
  };

  const success = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });
  const failed = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });

  const successScore = scoreFor(success, 'B');
  const failureScore = scoreFor(failed, 'B');
  assert.equal(successScore.score, 37);
  assert.equal(successScore.riskModifier, 20);
  assert.equal(failureScore.score, -21);
  assert.equal(failureScore.riskModifier, 20);
});

test('Federation 2026 Dash Under uses the table score without an extra Risk adjustment', () => {
  const result = calculateRound({
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 7, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'dash', tricks: 0 },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 8 },
      { playerId: 'C', actualTricks: 0 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });

  const success = scoreFor(result, 'C');
  const failed = scoreFor(result, 'D');
  assert.equal(success.score, 23);
  assert.equal(success.isRiskTaker, false);
  assert.equal(failed.score, -11);
  assert.equal(failed.isRiskTaker, false);
});

test('Federation 2026 Dash Over uses the table success and delta-only failure scores', () => {
  const baseRound = {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal' as const, tricks: 4, trumpSuit: 'spades' as const },
      { playerId: 'B', bidType: 'normal' as const, tricks: 4, trumpSuit: 'hearts' as const },
      { playerId: 'C', bidType: 'normal' as const, tricks: 6, trumpSuit: 'diamonds' as const },
      { playerId: 'D', bidType: 'dash' as const, tricks: 0 },
    ],
  };

  const success = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 0 },
    ],
  });
  const failed = calculateRound({
    ...baseRound,
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 1 },
    ],
  });

  assert.equal(scoreFor(success, 'D').score, 13);
  assert.equal(scoreFor(failed, 'D').score, -1);
});

test('Federation 2026 Super 8, 9, and 10 use the official success and failure table', () => {
  const cases = [
    { call: 8 as const, supportingCall: 4, expectedSuccess: 41 },
    { call: 9 as const, supportingCall: 5, expectedSuccess: 42 },
    { call: 10 as const, supportingCall: 4, expectedSuccess: 43 },
  ];

  for (const scenario of cases) {
    const baseRound = {
      roundNumber: scenario.call,
      bidOwnerPlayerId: 'A',
      profile: federationProfile,
      bids: [
        { playerId: 'A', bidType: 'normal' as const, tricks: scenario.call, trumpSuit: 'spades' as const },
        {
          playerId: 'B',
          bidType: 'normal' as const,
          tricks: scenario.supportingCall,
          trumpSuit: 'hearts' as const,
        },
        { playerId: 'C', bidType: 'dash' as const, tricks: 0 },
        { playerId: 'D', bidType: 'dash' as const, tricks: 0 },
      ],
    };

    const success = calculateRound({
      ...baseRound,
      actualResults: [
        { playerId: 'A', actualTricks: scenario.call },
        { playerId: 'B', actualTricks: 12 - scenario.call },
        { playerId: 'C', actualTricks: 0 },
        { playerId: 'D', actualTricks: 1 },
      ],
    });
    const failed = calculateRound({
      ...baseRound,
      actualResults: [
        { playerId: 'A', actualTricks: scenario.call - 1 },
        { playerId: 'B', actualTricks: 13 - scenario.call },
        { playerId: 'C', actualTricks: 0 },
        { playerId: 'D', actualTricks: 1 },
      ],
    });

    assert.equal(scoreFor(success, 'A').score, scenario.expectedSuccess);
    assert.equal(scoreFor(failed, 'A').score, -21);
  }
});

test('Federation 2026 applies the Only Winner bonus', () => {
  const result = calculateRound(ownerAndNormalRound([4, 5, 1, 3]));
  const owner = scoreFor(result, 'A');

  assert.equal(owner.score, 37);
  assert.equal(owner.isOnlyWinner, true);
});

test('Federation 2026 applies the Only Loser penalty', () => {
  const result = calculateRound({
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 },
      { playerId: 'B', actualTricks: 5 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 0 },
    ],
  });
  const onlyLoser = scoreFor(result, 'B');

  assert.equal(onlyLoser.score, -11);
  assert.equal(onlyLoser.isOnlyLoser, true);
});

test('Federation 2026 all-loser rounds retain calculated negative scores without a multiplier', () => {
  const round: MvpRoundInput = {
    roundNumber: 1,
    bidOwnerPlayerId: 'A',
    profile: federationProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 3 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 4 },
    ],
  };

  const result = calculateRound(round);

  assert.deepEqual(result.playerScores.map((score) => score.score), [-11, -1, -1, -14]);
  assert.equal(result.nextRoundMultiplier, undefined);
});

test('House Rules V1 keeps its all-loser zero scores and next-round multiplier', () => {
  const result = calculateRound(
    {
      roundNumber: 1,
      bidOwnerPlayerId: 'A',
      profile: federationProfile,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'dash', tricks: 0 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 3 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 4 },
      ],
    },
    HOUSE_RULES_V1,
  );

  assert.deepEqual(result.playerScores.map((score) => score.score), [0, 0, 0, 0]);
  assert.equal(result.nextRoundMultiplier, 2);
});
