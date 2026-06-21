import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstimationMvpService,
  InMemoryScoreSheetRepository,
  SCORE_SHEET_BACKUP_FORMAT,
  SCORE_SHEET_BACKUP_VERSION,
  ScoreSheetBackupService,
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
  dashFailureScore: -10,
  dashCallSuccessScore: 35,
  dashCallFailureScore: -35,
};

const gameInput: MvpGameInput = {
  playerOrder: ['A', 'B', 'C', 'D'],
  rounds: [
    {
      roundNumber: 1,
      profile,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4 },
        { playerId: 'B', bidType: 'normal', tricks: 5 },
        { playerId: 'C', bidType: 'dash', tricks: 0 },
        { playerId: 'D', bidType: 'normal', tricks: 5 },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 2 },
        { playerId: 'C', actualTricks: 0 },
        { playerId: 'D', actualTricks: 7 },
      ],
    },
  ],
};

test('exports persisted score sheets into a versioned Egyptian Estimation backup document', () => {
  const gameResult = new EstimationMvpService().calculateGame(gameInput);
  const repository = new InMemoryScoreSheetRepository();
  const scoreSheet = repository.save({
    id: 'sheet-1',
    name: 'Friday Egyptian Estimation Game',
    status: 'finalized',
    gameInput,
    gameResult,
    nowIso: '2026-06-21T00:00:00.000Z',
  });

  const backup = new ScoreSheetBackupService().exportScoreSheets({
    scoreSheets: [scoreSheet],
    exportedAtIso: '2026-06-21T01:00:00.000Z',
    source: 'unit-test',
  });

  assert.equal(backup.format, SCORE_SHEET_BACKUP_FORMAT);
  assert.equal(backup.version, SCORE_SHEET_BACKUP_VERSION);
  assert.equal(backup.metadata.exportedAtIso, '2026-06-21T01:00:00.000Z');
  assert.equal(backup.metadata.source, 'unit-test');
  assert.equal(backup.scoreSheets.length, 1);
  assert.equal(backup.scoreSheets[0]?.id, 'sheet-1');
  assert.equal(backup.scoreSheets[0]?.gameResult?.validRounds, 1);
});

test('imports a valid backup document and returns a defensive clone', () => {
  const service = new ScoreSheetBackupService();
  const repository = new InMemoryScoreSheetRepository();
  const scoreSheet = repository.save({
    id: 'sheet-1',
    name: 'Friday Egyptian Estimation Game',
    gameInput,
    nowIso: '2026-06-21T00:00:00.000Z',
  });
  const backup = service.exportScoreSheets({
    scoreSheets: [scoreSheet],
    exportedAtIso: '2026-06-21T01:00:00.000Z',
  });

  const result = service.importScoreSheets(backup);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.document?.scoreSheets[0]?.id, 'sheet-1');

  backup.scoreSheets[0]?.gameInput.rounds.at(0)?.bids.push({ playerId: 'E', bidType: 'normal', tricks: 1 });
  assert.equal(result.document?.scoreSheets[0]?.gameInput.rounds[0]?.bids.length, 4);
});

test('rejects unsupported backup shape before import', () => {
  const result = new ScoreSheetBackupService().importScoreSheets({
    format: 'planning-poker-estimates',
    version: 99,
    metadata: {},
    scoreSheets: [
      {
        id: '',
        name: '',
        status: 'draft',
        createdAtIso: '',
        updatedAtIso: '',
        playerOrder: 'A,B,C,D',
        roundCount: -1,
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.document, undefined);
  assert.ok(result.errors.some((error) => error.includes('Unsupported backup format')));
  assert.ok(result.errors.some((error) => error.includes('Unsupported backup version')));
  assert.ok(result.errors.some((error) => error.includes('metadata.exportedAtIso')));
  assert.ok(result.errors.some((error) => error.includes('scoreSheets[0].id')));
  assert.ok(result.errors.some((error) => error.includes('scoreSheets[0].gameInput')));
});
