import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScoreSheetTable } from './ScoreSheetTable.js';
import type { ScoreSheetViewModel } from '../scoreSheet/scoreSheetViewModel.js';

const model: ScoreSheetViewModel = {
  id: 'sheet-1',
  name: 'Thursday Table',
  players: [
    { id: 'A', name: 'Ahmed', rankTitle: 'KING', totalScore: 20 },
    { id: 'B', name: 'Mona', rankTitle: 'Sub-King', totalScore: -1 },
    { id: 'C', name: 'Rami', rankTitle: 'Sub-Kooz', totalScore: 12 },
    { id: 'D', name: 'Dina', rankTitle: 'Kooz', totalScore: -14 },
  ],
  rounds: [{
    roundNumber: 1,
    overUnder: '+1',
    cells: [
      { playerId: 'A', estimateLabel: '4♠', actualTricks: 4, roundScore: 20, calculatedScore: 14, appliedScore: 20, cumulativeScore: 20, successful: true, overridden: true },
      { playerId: 'B', estimateLabel: '3', actualTricks: 2, roundScore: -1, calculatedScore: -1, appliedScore: -1, cumulativeScore: -1, successful: false, overridden: false },
      { playerId: 'C', estimateLabel: '3', actualTricks: 3, roundScore: 12, calculatedScore: 12, appliedScore: 12, cumulativeScore: 12, successful: true, overridden: false },
      { playerId: 'D', estimateLabel: '4', actualTricks: 4, roundScore: -14, calculatedScore: -14, appliedScore: -14, cumulativeScore: -14, successful: true, overridden: false },
    ],
  }],
};

describe('ScoreSheetTable', () => {
  it('uses a fit-to-screen column layout instead of a horizontally scrollable fixed-width table', () => {
    const { container } = render(<ScoreSheetTable model={model} />);

    expect(screen.getByLabelText('Responsive score sheet')).toHaveClass('score-sheet-fit');
    expect(container.querySelectorAll('col.player-layout-col')).toHaveLength(16);
    expect(container.querySelector('col.round-layout-col')).toBeInTheDocument();
    expect(container.querySelector('col.ou-layout-col')).toBeInTheDocument();
  });

  it('exposes Edit scores for every completed round', async () => {
    const user = userEvent.setup();
    const onEditScores = vi.fn();
    render(<ScoreSheetTable model={model} onEditScores={onEditScores} />);

    await user.click(screen.getByRole('button', { name: 'Edit scores for round 1' }));
    expect(onEditScores).toHaveBeenCalledWith(1);
  });

  it('marks an applied override and exposes its original calculated value', () => {
    render(<ScoreSheetTable model={model} onEditScores={vi.fn()} />);

    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByText('Ahmed round 1 calculated score 14; applied score 20')).toBeInTheDocument();
  });
});
