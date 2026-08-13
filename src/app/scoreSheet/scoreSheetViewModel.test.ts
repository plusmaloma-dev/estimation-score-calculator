import { describe, expect, it } from 'vitest';
import type { UiOpenSessionResult } from '../../index.js';
import { buildScoreSheetViewModel } from './scoreSheetViewModel.js';

const openedSession: UiOpenSessionResult = {
  valid: true,
  errors: [],
  scoreSheet: {
    id: 'sheet-1',
    name: 'Thursday Table',
    status: 'draft',
    createdAtIso: '2026-07-22T10:00:00.000Z',
    updatedAtIso: '2026-07-22T10:05:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    playerNamesById: { A: 'Ahmed', B: 'Mona', C: 'Rami', D: 'Dina' },
    roundCount: 1,
    gameInput: { playerOrder: ['A', 'B', 'C', 'D'], rounds: [], ruleSet: 'FEDERATION_2026' },
  },
  leaderboard: [
    { playerId: 'A', totalScore: 14, roundsPlayed: 1, rank: 1 },
    { playerId: 'C', totalScore: 12, roundsPlayed: 1, rank: 2 },
    { playerId: 'B', totalScore: -1, roundsPlayed: 1, rank: 3 },
    { playerId: 'D', totalScore: -14, roundsPlayed: 1, rank: 4 },
  ],
  roundHistory: [
    {
      roundNumber: 1,
      roundType: 'over',
      valid: true,
      errors: [],
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
        { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
        { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
      ],
      actualResults: [
        { playerId: 'A', actualTricks: 4 },
        { playerId: 'B', actualTricks: 2 },
        { playerId: 'C', actualTricks: 3 },
        { playerId: 'D', actualTricks: 4 },
      ],
      playerScores: [
        { playerId: 'A', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'bid-owner', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: 14, notes: [] },
        { playerId: 'B', bidTricks: 3, actualTricks: 2, delta: -1, didMatchBid: false, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'failed', score: -1, notes: [] },
        { playerId: 'C', bidTricks: 3, actualTricks: 3, delta: 0, didMatchBid: true, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: 12, notes: [] },
        { playerId: 'D', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: -14, notes: [] },
      ],
      riskTypes: [],
    },
  ],
};

describe('buildScoreSheetViewModel', () => {
  it('keeps players in columns and derives rankings, O/U, and winning trump', () => {
    const model = buildScoreSheetViewModel(openedSession);

    expect(model.players.map((player) => [player.name, player.rankTitle, player.totalScore])).toEqual([
      ['Ahmed', 'KING', 14],
      ['Mona', 'Sub-Kooz', -1],
      ['Rami', 'Sub-King', 12],
      ['Dina', 'Kooz', -14],
    ]);
    expect(model.rounds[0]?.overUnder).toBe('+1');
    expect(model.rounds[0]?.cells.map((cell) => cell.estimateLabel)).toEqual(['4♠', '3', '3', '4']);
    expect(model.rounds[0]?.cells.map((cell) => cell.cumulativeScore)).toEqual([14, -1, 12, -14]);
  });

  it('keeps calculated scores while using applied scores for rows and cumulative totals', () => {
    const calculatedScores = openedSession.roundHistory?.[0]?.playerScores ?? [];
    const appliedScores = calculatedScores.map((score) => score.playerId === 'A' ? { ...score, score: 20 } : score);
    const session: UiOpenSessionResult = {
      ...openedSession,
      scoreSheet: {
        ...openedSession.scoreSheet!,
        gameResult: {
          valid: true,
          errors: [],
          ruleSet: 'FEDERATION_2026',
          rounds: [{
            roundNumber: 1,
            valid: true,
            errors: [],
            bidValidation: { valid: true, errors: [], totalEstimatedTricks: 14, roundType: 'over' },
            scoreResult: { valid: true, errors: [], playerScores: calculatedScores },
          }],
          leaderboard: openedSession.leaderboard ?? [],
        },
      },
      leaderboard: (openedSession.leaderboard ?? []).map((entry) => entry.playerId === 'A' ? { ...entry, totalScore: 20 } : entry),
      roundHistory: [{ ...openedSession.roundHistory![0]!, playerScores: appliedScores }],
    };

    const cell = buildScoreSheetViewModel(session).rounds[0]?.cells[0];
    expect(cell).toEqual(expect.objectContaining({
      calculatedScore: 14,
      appliedScore: 20,
      roundScore: 20,
      cumulativeScore: 20,
      overridden: true,
    }));
  });

  it('shows Hold in the historical estimate annotation', () => {
    const session: UiOpenSessionResult = {
      ...openedSession,
      roundHistory: [{
        ...openedSession.roundHistory![0]!,
        bids: openedSession.roundHistory![0]!.bids.map((bid) => bid.playerId === 'B' ? { ...bid, bidType: 'hold' as const } : bid),
      }],
    };

    expect(buildScoreSheetViewModel(session).rounds[0]?.cells[1]?.estimateLabel).toBe('3 H');
  });
});
