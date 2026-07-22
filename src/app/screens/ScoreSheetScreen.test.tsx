import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UiOpenSessionResult } from '../../index.js';
import { ScoreSheetScreen } from './ScoreSheetScreen.js';

const opened: UiOpenSessionResult = {
  valid: true,
  errors: [],
  scoreSheet: {
    id: 'sheet-1', name: 'Thursday Table', status: 'draft',
    createdAtIso: '2026-07-22T10:00:00.000Z', updatedAtIso: '2026-07-22T10:05:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'], playerNamesById: { A: 'Ahmed', B: 'Mona', C: 'Rami', D: 'Dina' },
    roundCount: 1, gameInput: { playerOrder: ['A', 'B', 'C', 'D'], rounds: [], ruleSet: 'FEDERATION_2026' },
  },
  leaderboard: [
    { playerId: 'A', totalScore: 14, roundsPlayed: 1, rank: 1 },
    { playerId: 'C', totalScore: 12, roundsPlayed: 1, rank: 2 },
    { playerId: 'B', totalScore: -1, roundsPlayed: 1, rank: 3 },
    { playerId: 'D', totalScore: -14, roundsPlayed: 1, rank: 4 },
  ],
  roundHistory: [{
    roundNumber: 1, roundType: 'over', valid: true, errors: [], riskTypes: [],
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 3, trumpSuit: 'hearts' },
      { playerId: 'C', bidType: 'normal', tricks: 3, trumpSuit: 'diamonds' },
      { playerId: 'D', bidType: 'normal', tricks: 4, trumpSuit: 'clubs' },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 4 }, { playerId: 'B', actualTricks: 2 },
      { playerId: 'C', actualTricks: 3 }, { playerId: 'D', actualTricks: 4 },
    ],
    playerScores: [
      { playerId: 'A', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'bid-owner', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: 14, notes: [] },
      { playerId: 'B', bidTricks: 3, actualTricks: 2, delta: -1, didMatchBid: false, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'failed', score: -1, notes: [] },
      { playerId: 'C', bidTricks: 3, actualTricks: 3, delta: 0, didMatchBid: true, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: 12, notes: [] },
      { playerId: 'D', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: -14, notes: [] },
    ],
  }],
};

const shell = { openSession: () => opened };

describe('ScoreSheetScreen', () => {
  it('renders players as columns and previous rounds as rows', () => {
    render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={shell} />);

    expect(screen.getByRole('heading', { name: 'Thursday Table' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Thursday Table score sheet' });
    for (const player of ['Ahmed', 'Mona', 'Rami', 'Dina']) {
      expect(within(table).getByText(player)).toBeInTheDocument();
    }
    expect(within(table).getByText('4♠')).toBeInTheDocument();
    expect(within(table).getByText('+1')).toBeInTheDocument();
    expect(within(table).getByText('KING')).toBeInTheDocument();
  });
});
