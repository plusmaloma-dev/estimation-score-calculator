import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  ScoreSheetMarkdownExportService,
  type MvpGameInput,
  type ScoringProfile,
} from '../src/index.js';

const profile: ScoringProfile = {
  id: 'egyptian-estimation-local',
  name: 'Egyptian Estimation Local Rules',
  type: 'standard',
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
  dashSuccessScore: 10,
  dashCallSuccessScore: 35,
};

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile,
      riskPlayerId: 'D',
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 4, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'dash', tricks: 0 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 4 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 2 },
      ],
    },
  ],
};

test('exports final standings and per-player round scores as markdown tables', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const markdown = new ScoreSheetMarkdownExportService().exportScoreSheet({
    title: 'Friday Estimation',
    gameInput,
    gameResult,
    generatedAt: '2026-06-21T17:08:24+03:00',
  });

  assert.match(markdown, /^# Friday Estimation/);
  assert.match(markdown, /Generated: 2026-06-21T17:08:24\+03:00/);
  assert.match(markdown, /## Final Standings/);
  assert.match(markdown, /\| Rank \| Player \| Total Score \| Rounds Played \|/);
  assert.match(markdown, /\| 1 \| A \| 14 \| 1 \|/);
  assert.match(markdown, /\| 2 \| B \| 14 \| 1 \|/);
  assert.match(markdown, /## Round Scores/);
  assert.match(markdown, /\| 1 \| under \| A \| 4 \| 4 \| 0 \| 14 \| success \|/);
  assert.match(markdown, /\| 1 \| under \| D \| 0 \| 2 \| 2 \| -12 \| failed \|/);
  assert.match(markdown, /dash/);
});

test('exports validation errors for invalid unscored rounds', () => {
  const invalidGameInput: MvpGameInput = {
    rounds: [
      {
        roundNumber: 1,
        profile,
        bids: [
          { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
          { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
          { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
          { playerId: 'D', bidType: 'normal', tricks: 3, trumpSuit: 'clubs' },
        ],
        actualResults: [
          { playerId: 'A', actualTricks: 4 },
          { playerId: 'B', actualTricks: 3 },
          { playerId: 'C', actualTricks: 3 },
          { playerId: 'D', actualTricks: 3 },
        ],
      },
    ],
  };

  const gameResult = new EstimationMvpService().calculateGame(invalidGameInput);
  const markdown = new ScoreSheetMarkdownExportService().exportScoreSheet({
    title: 'Invalid Round',
    gameInput: invalidGameInput,
    gameResult,
  });

  assert.match(markdown, /No scored rounds yet\./);
  assert.match(markdown, /\| 1 \| invalid \| - \| - \| - \| - \| - \| invalid \|/);
  assert.match(markdown, /## Validation Errors/);
  assert.match(markdown, /Total estimates cannot equal 13/);
});
