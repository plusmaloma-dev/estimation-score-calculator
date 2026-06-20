import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ScoreCalculationService } from '../src/scoring/ScoreCalculationService.js';
import type { EstimationBid } from '../src/domain/bid.js';
import type { RoundScoreInput, ScoringProfile } from '../src/scoring/types.js';

const profile: ScoringProfile = {
  id: 'house-rule',
  name: 'House Rule',
  type: 'custom',
  normalBidSuccessBase: 10,
  normalBidSuccessPerTrick: 5,
  normalBidFailurePenaltyPerTrickDifference: 3,
};

function normal(playerId: string, tricks: number): EstimationBid {
  return {
    bidType: 'normal',
    playerId,
    tricks,
    trumpSuit: 'spades',
  };
}

describe('ScoreCalculationService actual-vs-estimate evaluation', () => {
  it('marks players as successful only when actual tricks match estimated tricks', () => {
    const service = new ScoreCalculationService();
    const input: RoundScoreInput = {
      roundNumber: 1,
      roundType: 'over',
      bidOwnerPlayerId: 'player-1',
      bids: [normal('player-1', 5), normal('player-2', 4), normal('player-3', 4), normal('player-4', 2)],
      actualResults: [
        { playerId: 'player-1', actualTricks: 5 },
        { playerId: 'player-2', actualTricks: 3 },
        { playerId: 'player-3', actualTricks: 4 },
        { playerId: 'player-4', actualTricks: 1 },
      ],
      profile,
    };

    const result = service.calculateRoundScore(input);

    assert.equal(result.valid, true);
    assert.equal(result.ownerOutcome, 'owner-won');
    assert.equal(result.playerScores[0]?.didMatchBid, true);
    assert.equal(result.playerScores[0]?.delta, 0);
    assert.equal(result.playerScores[1]?.didMatchBid, false);
    assert.equal(result.playerScores[1]?.delta, 1);
    assert.equal(result.playerScores[1]?.score, -3);
  });
});
