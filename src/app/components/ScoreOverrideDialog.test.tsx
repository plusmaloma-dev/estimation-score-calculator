import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScoreOverrideDialog } from './ScoreOverrideDialog.js';
import type { ScoreSheetRoundView } from '../scoreSheet/scoreSheetViewModel.js';

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Mona' },
  { id: 'C', name: 'Rami' },
  { id: 'D', name: 'Dina' },
] as const;

const round: ScoreSheetRoundView = {
  roundNumber: 1,
  overUnder: '+1',
  cells: [
    { playerId: 'A', estimateLabel: '4♠', actualTricks: 4, roundScore: 20, calculatedScore: 14, appliedScore: 20, cumulativeScore: 20, successful: true, overridden: true },
    { playerId: 'B', estimateLabel: '3', actualTricks: 2, roundScore: -1, calculatedScore: -1, appliedScore: -1, cumulativeScore: -1, successful: false, overridden: false },
    { playerId: 'C', estimateLabel: '3', actualTricks: 3, roundScore: 12, calculatedScore: 12, appliedScore: 12, cumulativeScore: 12, successful: true, overridden: false },
    { playerId: 'D', estimateLabel: '4', actualTricks: 4, roundScore: -14, calculatedScore: -14, appliedScore: -14, cumulativeScore: -14, successful: true, overridden: false },
  ],
};

describe('ScoreOverrideDialog', () => {
  it('shows calculated and applied scores and requires a reason plus a changed integer', async () => {
    const user = userEvent.setup();
    render(<ScoreOverrideDialog round={round} players={players} onCancel={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Edit scores for round 1' })).toBeInTheDocument();
    expect(screen.getByText('Calculated: 14')).toBeInTheDocument();
    expect(screen.getByText('Currently applied: 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save score overrides' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Ahmed applied score'));
    await user.type(screen.getByLabelText('Ahmed applied score'), '25');
    expect(screen.getByRole('button', { name: 'Save score overrides' })).toBeDisabled();

    await user.type(screen.getByLabelText('Override reason'), 'Correction agreed by table');
    expect(screen.getByRole('button', { name: 'Save score overrides' })).toBeEnabled();
  });

  it('submits only changed scores with the mandatory reason', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScoreOverrideDialog round={round} players={players} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText('Ahmed applied score'));
    await user.type(screen.getByLabelText('Ahmed applied score'), '25');
    await user.type(screen.getByLabelText('Override reason'), 'Correction agreed by table');
    await user.click(screen.getByRole('button', { name: 'Save score overrides' }));

    expect(onSubmit).toHaveBeenCalledWith({ A: 25 }, 'Correction agreed by table');
  });

  it('restores a player to the calculated value and still requires a reason', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScoreOverrideDialog round={round} players={players} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Restore Ahmed original score' }));
    expect(screen.getByLabelText('Ahmed applied score')).toHaveValue(14);
    expect(screen.getByRole('button', { name: 'Save score overrides' })).toBeDisabled();

    await user.type(screen.getByLabelText('Override reason'), 'Restore original calculation');
    await user.click(screen.getByRole('button', { name: 'Save score overrides' }));
    expect(onSubmit).toHaveBeenCalledWith({ A: 14 }, 'Restore original calculation');
  });

  it('cancels without submitting', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(<ScoreOverrideDialog round={round} players={players} onCancel={onCancel} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Cancel score editing' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
