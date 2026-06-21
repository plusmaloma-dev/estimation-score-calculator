import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  ScoreSheetCsvExportService,
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

test('exports score-sheet round rows as deterministic CSV', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const csv = new ScoreSheetCsvExportService().exportScoreSheet({ gameInput, gameResult });

  assert.match(csv, /^roundNumber,roundType,playerId,bidType,bidTricks,actualTricks,delta,score,status,role,riskType,riskModifier,runningScore,notes/);
  assert.match(csv, /1,under,A,normal,4,4,0,14,success,bidder,none,1,14,matched bid/);
  assert.match(csv, /1,under,D,dash,0,2,2,-12,failed,dash,risk,2,-12,missed bid; risk taker; risk failure/);
});

test('can include metadata rows before score-sheet CSV rows', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const csv = new ScoreSheetCsvExportService().exportScoreSheet({
    gameInput,
    gameResult,
    includeMetadataRows: true,
    title: 'Friday, Game',
    generatedAt: '2026-06-21T22:08:24+03:00',
  });

  assert.match(csv, /^metric,value\ntitle,"Friday, Game"\ngeneratedAt,2026-06-21T22:08:24\+03:00\nroundCount,1\nvalid,true\nerrorCount,0\n\nroundNumber,roundType/);
});

test('exports invalid rounds with validation notes', () => {
  const invalidGameInput: MvpGameInput = {
    playerOrder: ['A', 'B', 'C', 'D'],
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
  const csv = new ScoreSheetCsvExportService().exportScoreSheet({ gameInput: invalidGameInput, gameResult });

  assert.match(csv, /1,invalid,,,,,,,invalid,,,,,Total estimates cannot equal 13/);
});
