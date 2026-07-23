import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UiOpenSessionResult, UiRoundHistoryEntry } from '../../index.js';
import { ScoreSheetScreen } from './ScoreSheetScreen.js';

const playerOrder = ['A', 'B', 'C', 'D'] as const;

function historyRound(roundNumber: number): UiRoundHistoryEntry {
  return {
    roundNumber,
    roundType: 'under',
    valid: true,
    errors: [],
    riskTypes: [],
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 4 },
      { playerId: 'C', bidType: 'normal', tricks: 3 },
      { playerId: 'D', bidType: 'dash', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 2 },
      { playerId: 'D', actualTricks: 2 },
    ],
    playerScores: [
      { playerId: 'A', bidTricks: 5, actualTricks: 5, delta: 0, didMatchBid: true, role: 'bid-owner', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: 25, notes: [] },
      { playerId: 'B', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success', score: 14, notes: [] },
      { playerId: 'C', bidTricks: 3, actualTricks: 2, delta: -1, didMatchBid: false, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'failed', score: -1, notes: [] },
      { playerId: 'D', bidTricks: 0, actualTricks: 2, delta: 2, didMatchBid: false, role: 'other-player', riskType: 'none', isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'failed', score: -10, notes: [] },
    ],
  };
}

function openedWithRounds(roundCount: number, status: 'draft' | 'finalized' = 'draft'): UiOpenSessionResult {
  return {
    valid: true,
    errors: [],
    scoreSheet: {
      id: 'sheet-1',
      name: 'Lifecycle Table',
      status,
      createdAtIso: '2026-07-23T10:00:00.000Z',
      updatedAtIso: '2026-07-23T11:00:00.000Z',
      playerOrder,
      playerNamesById: { A: 'Ahmed', B: 'Mona', C: 'Rami', D: 'Dina' },
      roundCount,
      gameInput: { playerOrder, rounds: [], ruleSet: 'HOUSE_RULES_V1' },
    },
    leaderboard: playerOrder.map((playerId, index) => ({
      playerId,
      totalScore: (4 - index) * 10,
      roundsPlayed: roundCount,
      rank: index + 1,
    })),
    roundHistory: Array.from({ length: roundCount }, (_, index) => historyRound(index + 1)),
  };
}

describe('ScoreSheetScreen lifecycle', () => {
  it('offers confirmed completion after 18 saved rounds', async () => {
    const user = userEvent.setup();
    const finalizeGame = vi.fn(() => ({ valid: true, errors: [], scoreSheet: openedWithRounds(18, 'finalized').scoreSheet }));

    render(<ScoreSheetScreen
      scoreSheetId="sheet-1"
      shell={{ openSession: () => openedWithRounds(18), finalizeGame }}
      actorId="tester-1"
    />);

    await user.click(screen.getByRole('button', { name: 'Finish Game' }));
    expect(screen.getByRole('dialog', { name: 'Finish game' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm Finish' }));

    expect(finalizeGame).toHaveBeenCalledWith('sheet-1', 'tester-1');
  });

  it('shows completed games as read-only and allows confirmed reopening', async () => {
    const user = userEvent.setup();
    const reopenGame = vi.fn(() => ({ valid: true, errors: [], scoreSheet: openedWithRounds(18).scoreSheet }));

    render(<ScoreSheetScreen
      scoreSheetId="sheet-1"
      shell={{ openSession: () => openedWithRounds(18, 'finalized'), reopenGame }}
      actorId="admin-1"
    />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Calculate scores' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit scores/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reopen Game' }));
    expect(screen.getByRole('dialog', { name: 'Reopen game' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm Reopen' }));

    expect(reopenGame).toHaveBeenCalledWith('sheet-1', 'admin-1');
  });

  it('suggests finishing only after Round 18 saves successfully', async () => {
    const user = userEvent.setup();
    const saveRound = vi.fn(() => ({ valid: true, errors: [] }));

    render(<ScoreSheetScreen
      scoreSheetId="sheet-1"
      shell={{ openSession: () => openedWithRounds(17), saveRound }}
      actorId="tester-1"
    />);

    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));
    for (const [name, actual] of [['Ahmed', '5'], ['Mona', '3'], ['Rami', '3'], ['Dina', '2']] as const) {
      await user.type(screen.getByLabelText(`${name} actual tricks`), actual);
    }
    await user.click(screen.getByRole('button', { name: 'Calculate scores' }));

    expect(saveRound).toHaveBeenCalledWith('sheet-1', expect.objectContaining({ roundNumber: 18 }));
    expect(screen.getByRole('dialog', { name: 'Round 18 completed' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Continue Playing' }));
    expect(screen.queryByRole('dialog', { name: 'Round 18 completed' })).not.toBeInTheDocument();
  });
});
