import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CurrentRoundRow } from './CurrentRoundRow.js';

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Mona' },
  { id: 'C', name: 'Rami' },
  { id: 'D', name: 'Dina' },
] as const;

describe('CurrentRoundRow', () => {
  it('automatically assigns the unique highest estimate and shows only that trump selector', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<table><tbody><CurrentRoundRow
      roundNumber={11}
      players={players}
      existingTotals={{ A: 25, B: 39, C: 76, D: -70 }}
      onSave={onSave}
    /></tbody></table>);

    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    for (const [name, estimate] of [['Ahmed', '3'], ['Mona', '2'], ['Rami', '4'], ['Dina', '5']] as const) {
      await user.type(screen.getByLabelText(`${name} estimate`), estimate);
    }

    expect(screen.queryByLabelText('Ahmed trump')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mona trump')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Rami trump')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Dina trump')).toBeInTheDocument();
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0);
    expect(screen.getByText('Total estimates: 14')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate and save' })).toBeDisabled();
  });

  it('does not show a trump selector while the highest estimate is tied', async () => {
    const user = userEvent.setup();
    render(<table><tbody><CurrentRoundRow
      roundNumber={1}
      players={players}
      existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
    /></tbody></table>);

    for (const [name, estimate] of [['Ahmed', '4'], ['Mona', '3'], ['Rami', '3'], ['Dina', '4']] as const) {
      await user.type(screen.getByLabelText(`${name} estimate`), estimate);
    }

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('A unique highest estimate is required.')).toBeInTheDocument();
  });
});