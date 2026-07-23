import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

const emptyOpened: UiOpenSessionResult = {
  ...opened,
  scoreSheet: {
    ...opened.scoreSheet!,
    roundCount: 0,
    gameInput: { playerOrder: ['A', 'B', 'C', 'D'], rounds: [], ruleSet: 'HOUSE_RULES_V1' },
  },
  leaderboard: [
    { playerId: 'A', totalScore: 0, roundsPlayed: 0, rank: 1 },
    { playerId: 'B', totalScore: 0, roundsPlayed: 0, rank: 2 },
    { playerId: 'C', totalScore: 0, roundsPlayed: 0, rank: 3 },
    { playerId: 'D', totalScore: 0, roundsPlayed: 0, rank: 4 },
  ],
  roundHistory: [],
};

describe('ScoreSheetScreen', () => {
  it('renders the approved game header and score table without a New Round button', () => {
    render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={shell} />);

    expect(screen.getByRole('heading', { name: 'Thursday Table' })).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText(/Dealer:/)).toBeInTheDocument();
    expect(screen.getByText('Mona', { selector: '.round-dealer-card b' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Round' })).not.toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Thursday Table score sheet' });
    for (const player of ['Ahmed', 'Mona', 'Rami', 'Dina']) {
      expect(within(table).getByText(player)).toBeInTheDocument();
    }
    expect(within(table).getByText('4♠')).toBeInTheDocument();
    expect(within(table).getAllByText('+1').length).toBeGreaterThan(0);
    expect(within(table).getByText('KING')).toBeInTheDocument();
  });

  it('accepts estimates and saves the calculated round through the shell', async () => {
    const user = userEvent.setup();
    const saveRound = vi.fn(() => ({ valid: true, errors: [] }));
    render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={{ openSession: () => emptyOpened, saveRound }} />);

    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

    for (const [name, actual] of [['Ahmed', '5'], ['Mona', '3'], ['Rami', '3'], ['Dina', '2']] as const) {
      await user.type(screen.getByLabelText(`${name} actual tricks`), actual);
    }
    await user.click(screen.getByRole('button', { name: 'Calculate scores' }));

    expect(saveRound).toHaveBeenCalledTimes(1);
    expect(saveRound).toHaveBeenCalledWith('sheet-1', expect.objectContaining({
      roundNumber: 1,
      bidOwnerPlayerId: 'A',
      multipleWithMultiplier: 1,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
        { playerId: 'B', bidType: 'normal', tricks: 0 },
        { playerId: 'C', bidType: 'normal', tricks: 0 },
        { playerId: 'D', bidType: 'normal', tricks: 0 },
      ],
    }));
  });

  it('submits the frozen multiple-With state and x2 multiplier', async () => {
    const user = userEvent.setup();
    const saveRound = vi.fn(() => ({ valid: true, errors: [] }));
    render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={{ openSession: () => emptyOpened, saveRound }} />);

    for (const [name, estimate] of [['Ahmed', '4'], ['Mona', '3'], ['Rami', '4'], ['Dina', '4']] as const) {
      await user.type(screen.getByLabelText(`${name} estimate`), estimate);
    }
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'hearts');
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

    for (const [name, actual] of [['Ahmed', '4'], ['Mona', '2'], ['Rami', '4'], ['Dina', '3']] as const) {
      await user.type(screen.getByLabelText(`${name} actual tricks`), actual);
    }
    await user.click(screen.getByRole('button', { name: 'Calculate scores' }));

    expect(saveRound).toHaveBeenCalledWith('sheet-1', expect.objectContaining({
      roundNumber: 1,
      bidOwnerPlayerId: 'A',
      riskPlayerId: 'D',
      multipleWithMultiplier: 2,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'hearts' },
        { playerId: 'B', bidType: 'normal', tricks: 3 },
        { playerId: 'C', bidType: 'with', tricks: 4, withTargetPlayerId: 'A' },
        { playerId: 'D', bidType: 'with', tricks: 4, withTargetPlayerId: 'A' },
      ],
    }));
  });

  it('submits Hold players as Hold and preserves the finalized remaining Risk player', async () => {
    const user = userEvent.setup();
    const saveRound = vi.fn(() => ({ valid: true, errors: [] }));
    render(<ScoreSheetScreen scoreSheetId="sheet-1" shell={{ openSession: () => emptyOpened, saveRound }} />);

    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'clubs');
    await user.type(screen.getByLabelText('Mona estimate'), '2');
    await user.type(screen.getByLabelText('Rami estimate'), '4');
    await user.type(screen.getByLabelText('Dina estimate'), '4');
    await user.click(screen.getByRole('button', { name: 'Rami Hold' }));
    await user.click(screen.getByRole('button', { name: 'Dina Hold' }));
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

    for (const [name, actual] of [['Ahmed', '5'], ['Mona', '2'], ['Rami', '4'], ['Dina', '2']] as const) {
      await user.type(screen.getByLabelText(`${name} actual tricks`), actual);
    }
    await user.click(screen.getByRole('button', { name: 'Calculate scores' }));

    expect(saveRound).toHaveBeenCalledWith('sheet-1', expect.objectContaining({
      bidOwnerPlayerId: 'A',
      riskPlayerId: 'B',
      multipleWithMultiplier: 1,
      bids: [
        { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'clubs' },
        { playerId: 'B', bidType: 'normal', tricks: 2 },
        { playerId: 'C', bidType: 'hold', tricks: 4 },
        { playerId: 'D', bidType: 'hold', tricks: 4 },
      ],
    }));
  });
});
