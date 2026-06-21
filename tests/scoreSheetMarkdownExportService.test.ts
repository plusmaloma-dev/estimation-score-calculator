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
        { playerId: 'A', bidType: 'normal', tricks: 3 },
        { playerId: 'B', bidType: 'normal', tricks: 3 },
        { playerId: 'C', bidType: 'normal', tricks: 3 },
        { playerId: 'D', bidType: 'normal', tricks: 2 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 3 },
        { playerId: 'B', actualTricks: 3 },
        { playerId: 'C', actualTricks: 4 },
        { playerId: 'D', actualTricks: 3 },
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
  assert.match(markdown, /\| 1 \| A \| 13 \| 1 \|/);
  assert.match(markdown, /\| 2 \| B \| 13 \| 1 \|/);
  assert.match(markdown, /## Round Scores/);
  assert.match(markdown, /\| 1 \| under \| A \| 3 \| 3 \| 0 \| 13 \| success \|/);
  assert.match(markdown, /\| 1 \| under \| D \| 2 \| 3 \| 1 \| -11 \| failed \|/);
  assert.match(markdown, /round-risk/);
});

test('exports validation errors for invalid unscored rounds', () => {
  const invalidGameInput: MvpGameInput = {
    rounds: [
      {
        roundNumber: 1,
        profile,
        bids: [
          { playerId: 'A', bidType: 'normal', tricks: 4 },
          { playerId: 'B', bidType: 'normal', tricks: 3 },
          { playerId: 'C', bidType: 'normal', tricks: 3 },
          { playerId: 'D', bidType: 'normal', tricks: 3 },
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
  assert.match(markdown, /Total estimated tricks must not equal 13/);
});
