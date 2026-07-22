import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreSheetTable } from './ScoreSheetTable.js';
import type { ScoreSheetViewModel } from '../scoreSheet/scoreSheetViewModel.js';

const model: ScoreSheetViewModel = {
  id: 'sheet-1',
  name: 'Thursday Table',
  players: [
    { id: 'A', name: 'Ahmed', rankTitle: 'KING', totalScore: 0 },
    { id: 'B', name: 'Mona', rankTitle: 'Sub-King', totalScore: 0 },
    { id: 'C', name: 'Rami', rankTitle: 'Sub-Kooz', totalScore: 0 },
    { id: 'D', name: 'Dina', rankTitle: 'Kooz', totalScore: 0 },
  ],
  rounds: [],
};

describe('ScoreSheetTable', () => {
  it('uses a fit-to-screen column layout instead of a horizontally scrollable fixed-width table', () => {
    const { container } = render(<ScoreSheetTable model={model} />);

    expect(screen.getByLabelText('Responsive score sheet')).toHaveClass('score-sheet-fit');
    expect(container.querySelectorAll('col.player-layout-col')).toHaveLength(16);
    expect(container.querySelector('col.round-layout-col')).toBeInTheDocument();
    expect(container.querySelector('col.ou-layout-col')).toBeInTheDocument();
  });
});