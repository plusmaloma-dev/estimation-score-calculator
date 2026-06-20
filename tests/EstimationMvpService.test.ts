import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EstimationMvpService } from '../src/services/EstimationMvpService.js';
import type { EstimationBid } from '../src/domain/bid.js';
import type { ScoringProfile } from '../src/scoring/types.js';

const service = new EstimationMvpService();

const profile: ScoringProfile = {
  id: 'egyptian-estimation-mvp',
  name: 'Egyptian Estimation MVP confirmed rules',
  type: 'custom',
  winnerBaseBonus: 10,
  bidOwnerWinBonus: 10,
  bidOwnerLossPenalty: 10,
  normalBidFailurePenaltyPerTrickDifference: 1,
  onlyWinnerBonus: 10,
  onlyLoserPenalty: 10,
  underDashSuccessBonus: 10,
  underDashFailurePenalty: 10,
  highContractThreshold: 8,
  highContractWinBase: 80,
  highContractWinStep: 10,
  highContractLossBasePenalty: -80,
  highContractLossStepPenalty: -10,
};

const bids: readonly EstimationBid[] = [
  { playerId: 'player-a', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
  { playerId: 'player-b', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
  { playerId: 'player-c', bidType: 'normal', tricks: 3, trumpSuit: 'clubs' },
  { playerId: 'player-d', bidType: 'dash', tricks: 0 },
];

describe('EstimationMvpService', () => {
  it('validates bids, calculates round scores, and aggregates leaderboard totals', () => {
    const result = service.calculateGame({
      playerOrder: ['player-a', 'player-b', 'player-c', 'player-d'],
      rounds: [
        {
          roundNumber: 1,
          bidOwnerPlayerId: 'player-a',
          bids,
          actualResults: [
            { playerId: 'player-a', actualTricks: 5 },
            { playerId: 'player-b', actualTricks: 4 },
            { playerId: 'player-c', actualTricks: 2 },
            { playerId: 'player-d', actualTricks: 2 },
          ],
          profile,
        },
      ],
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rounds[0]?.bidValidation.roundType, 'under');
    assert.equal(result.rounds[0]?.scoreResult?.valid, true);
    assert.deepEqual(
      result.leaderboard.map((entry) => ({ playerId: entry.playerId, totalScore: entry.totalScore })),
      [
        { playerId: 'player-a', totalScore: 25 },
        { playerId: 'player-b', totalScore: 14 },
        { playerId: 'player-d', totalScore: -14 },
        { playerId: 'player-c', totalScore: -21 },
      ],
    );
  });

  it('returns validation errors without throwing for normal user-input mistakes', () => {
    const result = service.calculateRound({
      roundNumber: 1,
      bids: [
        { playerId: 'player-a', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
        { playerId: 'player-b', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'player-c', bidType: 'normal', tricks: 3, trumpSuit: 'clubs' },
        { playerId: 'player-d', bidType: 'dash', tricks: 1 },
      ],
      actualResults: [
        { playerId: 'player-a', actualTricks: 5 },
        { playerId: 'player-b', actualTricks: 4 },
        { playerId: 'player-c', actualTricks: 3 },
        { playerId: 'player-d', actualTricks: 1 },
      ],
      profile,
    });

    assert.equal(result.valid, false);
    assert.equal(result.scoreResult, undefined);
    assert.ok(result.errors.some((error) => error.includes('Dash and Dash Call bids must use 0 estimated tricks')));
    assert.ok(result.errors.some((error) => error.includes('Total estimates cannot equal 13')));
  });
});
