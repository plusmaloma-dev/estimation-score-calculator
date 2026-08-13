import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UiOpenSessionResult } from '../../index.js';
import { ScoreSheetScreen } from './ScoreSheetScreen.js';

const playerScores = [
  { playerId: 'A', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'bid-owner' as const, riskType: 'none' as const, isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success' as const, score: 14, notes: [] },
  { playerId: 'B', bidTricks: 3, actualTricks: 2, delta: 1, didMatchBid: false, role: 'other-player' as const, riskType: 'none' as const, isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'failed' as const, score: -1, notes: [] },
  { playerId: 'C', bidTricks: 3, actualTricks: 3, delta: 0, didMatchBid: true, role: 'other-player' as const, riskType: 'none' as const, isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success' as const, score: 13, notes: [] },
  { playerId: 'D', bidTricks: 4, actualTricks: 4, delta: 0, didMatchBid: true, role: 'other-player' as const, riskType: 'none' as const, isRiskTaker: false, riskModifier: 0, isHighContract: false, isOnlyWinner: false, isOnlyLoser: false, status: 'success' as const, score: 14, notes: [] },
] as const;
const bids = [
  { playerId: 'A', bidType: 'normal' as const, tricks: 4, trumpSuit: 'spades' as const },
  { playerId: 'B', bidType: 'normal' as const, tricks: 3 },
  { playerId: 'C', bidType: 'normal' as const, tricks: 3 },
  { playerId: 'D', bidType: 'normal' as const, tricks: 4 },
];
const actualResults = [
  { playerId: 'A', actualTricks: 4 },
  { playerId: 'B', actualTricks: 2 },
  { playerId: 'C', actualTricks: 3 },
  { playerId: 'D', actualTricks: 4 },
];

const opened: UiOpenSessionResult = {
  valid: true,
  errors: [],
  scoreSheet: {
    id: 'sheet-1',
    name: 'Override Table',
    status: 'draft',
    createdAtIso: '2026-07-22T10:00:00.000Z',
    updatedAtIso: '2026-07-22T10:10:00.000Z',
    playerOrder: ['A', 'B', 'C', 'D'],
    playerNamesById: { A: 'Ahmed', B: 'Mona', C: 'Rami', D: 'Dina' },
    roundCount: 1,
    gameInput: {
      playerOrder: ['A', 'B', 'C', 'D'],
      ruleSet: 'HOUSE_RULES_V1',
      rounds: [{ roundNumber: 1, bidOwnerPlayerId: 'A', profile: { id: 'house', name: 'House', type: 'standard' }, bids, actualResults }],
    },
    gameResult: {
      valid: true,
      errors: [],
      ruleSet: 'HOUSE_RULES_V1',
      rounds: [{
        roundNumber: 1,
        valid: true,
        errors: [],
        bidValidation: { valid: true, errors: [], totalEstimatedTricks: 14, roundType: 'over' },
        scoreResult: { valid: true, errors: [], ownerOutcome: 'owner-won', playerScores },
      }],
      leaderboard: [
        { playerId: 'A', totalScore: 14, roundsPlayed: 1, rank: 1 },
        { playerId: 'D', totalScore: 14, roundsPlayed: 1, rank: 2 },
        { playerId: 'C', totalScore: 13, roundsPlayed: 1, rank: 3 },
        { playerId: 'B', totalScore: -1, roundsPlayed: 1, rank: 4 },
      ],
    },
  },
  leaderboard: [
    { playerId: 'A', totalScore: 14, roundsPlayed: 1, rank: 1 },
    { playerId: 'D', totalScore: 14, roundsPlayed: 1, rank: 2 },
    { playerId: 'C', totalScore: 13, roundsPlayed: 1, rank: 3 },
    { playerId: 'B', totalScore: -1, roundsPlayed: 1, rank: 4 },
  ],
  roundHistory: [{
    roundNumber: 1,
    roundType: 'over',
    valid: true,
    errors: [],
    bids,
    actualResults,
    playerScores,
    riskTypes: [],
  }],
};

describe('ScoreSheetScreen score overrides', () => {
  it('opens Edit scores, submits the reasoned override, and closes after success', async () => {
    const user = userEvent.setup();
    const overrideRoundScores = vi.fn(() => ({ valid: true, errors: [] }));
    render(<ScoreSheetScreen
      scoreSheetId="sheet-1"
      shell={{ openSession: () => opened, overrideRoundScores }}
    />);

    await user.click(screen.getByRole('button', { name: 'Edit scores for round 1' }));
    expect(screen.getByRole('dialog', { name: 'Edit scores for round 1' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Ahmed applied score'));
    await user.type(screen.getByLabelText('Ahmed applied score'), '20');
    await user.type(screen.getByLabelText('Override reason'), 'Correction agreed by table');
    await user.click(screen.getByRole('button', { name: 'Save score overrides' }));

    expect(overrideRoundScores).toHaveBeenCalledWith('sheet-1', {
      roundNumber: 1,
      overridesByPlayerId: { A: 20 },
      reason: 'Correction agreed by table',
      actorId: 'local-user',
    });
    expect(screen.queryByRole('dialog', { name: 'Edit scores for round 1' })).not.toBeInTheDocument();
  });

  it('shows shell validation errors and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const overrideRoundScores = vi.fn(() => ({ valid: false, errors: ['Override reason is required.'] }));
    render(<ScoreSheetScreen
      scoreSheetId="sheet-1"
      shell={{ openSession: () => opened, overrideRoundScores }}
    />);

    await user.click(screen.getByRole('button', { name: 'Edit scores for round 1' }));
    await user.clear(screen.getByLabelText('Ahmed applied score'));
    await user.type(screen.getByLabelText('Ahmed applied score'), '20');
    await user.type(screen.getByLabelText('Override reason'), 'Correction');
    await user.click(screen.getByRole('button', { name: 'Save score overrides' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Override reason is required.');
    expect(screen.getByRole('dialog', { name: 'Edit scores for round 1' })).toBeInTheDocument();
  });
});
