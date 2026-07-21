import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEDERATION_2026,
  GameSummaryViewService,
  type PersistedScoreSheet,
} from '../src/index.js';

test('game summary exposes the scoring rule set used by the game result', () => {
  const scoreSheet: PersistedScoreSheet = {
    id: 'score-sheet-1',
    name: 'Federation Game',
    status: 'draft',
    createdAtIso: '2026-07-21T10:00:00.000Z',
    updatedAtIso: '2026-07-21T10:00:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    roundCount: 0,
    gameInput: {
      ruleSet: FEDERATION_2026,
      playerOrder: ['A', 'B', 'C', 'D'],
      rounds: [],
    },
    gameResult: {
      valid: true,
      errors: [],
      ruleSet: FEDERATION_2026,
      rounds: [],
      leaderboard: [],
    },
  };

  const summary = new GameSummaryViewService().buildModel(scoreSheet, {
    generatedAt: '2026-07-21T11:00:00.000Z',
  });

  assert.equal(summary.ruleSet, FEDERATION_2026);
});
