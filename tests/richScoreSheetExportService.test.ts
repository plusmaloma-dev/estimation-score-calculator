import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EstimationMvpService,
  RichScoreSheetExportService,
  type MvpGameInput,
  type PersistedScoreSheet,
} from '../src/index.js';

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile: {
        id: 'standard-test',
        name: 'Standard Test',
        type: 'standard',
        winnerBaseBonus: 10,
      },
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 2 },
        { playerId: 'D', actualTricks: 4 },
      ],
    },
    {
      roundNumber: 2,
      profile: {
        id: 'standard-test',
        name: 'Standard Test',
        type: 'standard',
        winnerBaseBonus: 10,
      },
      bids: [
        { playerId: 'A', bidType: 'dash', tricks: 0 },
        { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 0 },
        { playerId: 'B', actualTricks: 4 },
        { playerId: 'C', actualTricks: 5 },
        { playerId: 'D', actualTricks: 4 },
      ],
    },
  ],
};

function buildScoreSheet(): PersistedScoreSheet {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  return {
    id: 'score-sheet-1',
    name: 'Friday Game',
    status: 'finalized',
    createdAtIso: '2026-06-21T12:00:00.000Z',
    updatedAtIso: '2026-06-21T13:00:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    roundCount: gameInput.rounds.length,
    gameInput,
    gameResult,
  };
}

test('RichScoreSheetExportService creates deterministic markdown sections', () => {
  const exportService = new RichScoreSheetExportService();

  const document = exportService.exportMarkdown(buildScoreSheet(), {
    generatedAtIso: '2026-06-21T14:00:00.000Z',
  });

  assert.equal(document.format, 'markdown');
  assert.equal(document.generatedAtIso, '2026-06-21T14:00:00.000Z');
  assert.match(document.content, /^# Friday Game/);
  assert.match(document.content, /## Summary/);
  assert.match(document.content, /## Rounds/);
  assert.match(document.content, /## Running Balances/);
  assert.match(document.content, /## Final Standings/);
  assert.match(document.content, /## Statistics/);
  assert.match(document.content, /\| Round \| Type \| Bids \| Actual \| Scores \| Risk \| Next multiplier \|/);
  assert.match(document.content, /A: dash 0/);
});

test('RichScoreSheetExportService recalculates when persisted game result is missing', () => {
  const scoreSheet = buildScoreSheet();
  const exportService = new RichScoreSheetExportService();

  const document = exportService.exportMarkdown(
    { ...scoreSheet, gameResult: undefined },
    { generatedAtIso: '2026-06-21T14:00:00.000Z', title: 'Custom Export' },
  );

  assert.match(document.content, /^# Custom Export/);
  assert.match(document.content, /\| 1 \| over \|/);
  assert.match(document.content, /\| 2 \| under \|/);
});
