import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LeaderboardService } from '../src/services/LeaderboardService.js';

const service = new LeaderboardService();

describe('LeaderboardService', () => {
  it('aggregates player scores across rounds and sorts by total score descending', () => {
    const leaderboard = service.aggregate([
      {
        roundNumber: 1,
        playerScores: [
          { playerId: 'player-a', score: 17 },
          { playerId: 'player-b', score: -2 },
          { playerId: 'player-c', score: 10 },
          { playerId: 'player-d', score: 0 },
        ],
      },
      {
        roundNumber: 2,
        playerScores: [
          { playerId: 'player-a', score: -5 },
          { playerId: 'player-b', score: 30 },
          { playerId: 'player-c', score: 4 },
          { playerId: 'player-d', score: 10 },
        ],
      },
    ]);

    assert.deepEqual(leaderboard, [
      { playerId: 'player-b', totalScore: 28, roundsPlayed: 2, rank: 1 },
      { playerId: 'player-c', totalScore: 14, roundsPlayed: 2, rank: 2 },
      { playerId: 'player-a', totalScore: 12, roundsPlayed: 2, rank: 3 },
      { playerId: 'player-d', totalScore: 10, roundsPlayed: 2, rank: 4 },
    ]);
  });

  it('preserves deterministic order for tied totals using first seen order', () => {
    const leaderboard = service.aggregate([
      {
        playerScores: [
          { playerId: 'player-c', score: 10 },
          { playerId: 'player-a', score: 10 },
          { playerId: 'player-b', score: 5 },
        ],
      },
      {
        playerScores: [
          { playerId: 'player-b', score: 5 },
        ],
      },
    ]);

    assert.deepEqual(leaderboard.map((entry) => entry.playerId), ['player-c', 'player-a', 'player-b']);
    assert.deepEqual(leaderboard.map((entry) => entry.rank), [1, 2, 3]);
  });

  it('can use declared player order to stabilize ties before players are seen', () => {
    const leaderboard = service.aggregate(
      [
        {
          playerScores: [
            { playerId: 'player-c', score: 10 },
            { playerId: 'player-a', score: 10 },
          ],
        },
      ],
      { playerOrder: ['player-a', 'player-b', 'player-c', 'player-d'] },
    );

    assert.deepEqual(leaderboard.map((entry) => entry.playerId), ['player-a', 'player-c']);
  });

  it('rejects duplicate player scores within the same round input', () => {
    assert.throws(
      () => service.aggregate([
        {
          playerScores: [
            { playerId: 'player-a', score: 10 },
            { playerId: 'player-a', score: -1 },
          ],
        },
      ]),
      /cannot appear more than once/,
    );
  });
});
