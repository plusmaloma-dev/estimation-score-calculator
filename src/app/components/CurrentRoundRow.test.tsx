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
  it('uses blank estimates as zero, accepts and freezes the bid, then unlocks actual tricks', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<table><tbody><CurrentRoundRow
      roundNumber={11}
      players={players}
      existingTotals={{ A: 25, B: 39, C: 76, D: -70 }}
      onSave={onSave}
    /></tbody></table>);

    for (const player of players) {
      expect(screen.getByLabelText(`${player.name} actual tricks`)).toBeDisabled();
    }

    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    expect(screen.getByLabelText('Ahmed trump')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mona trump')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

    expect(screen.getByLabelText('Ahmed estimate')).toBeDisabled();
    expect(screen.getByLabelText('Mona estimate')).toHaveValue(0);
    expect(screen.getByLabelText('Rami estimate')).toHaveValue(0);
    expect(screen.getByLabelText('Dina estimate')).toHaveValue(0);
    for (const player of players) {
      expect(screen.getByLabelText(`${player.name} actual tricks`)).toBeEnabled();
    }

    for (const [name, actual] of [['Ahmed', '5'], ['Mona', '3'], ['Rami', '3'], ['Dina', '2']] as const) {
      await user.type(screen.getByLabelText(`${name} actual tricks`), actual);
    }

    const calculate = screen.getByRole('button', { name: 'Calculate scores' });
    expect(calculate).toBeEnabled();
    await user.click(calculate);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('blocks estimate 13 and keeps estimates editable until accepted', async () => {
    const user = userEvent.setup();
    render(<table><tbody><CurrentRoundRow
      roundNumber={1}
      players={players}
      existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
      onSave={vi.fn()}
    /></tbody></table>);

    await user.type(screen.getByLabelText('Ahmed estimate'), '13');

    expect(screen.getByText('Each estimate must be between 0 and 12.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept estimates' })).toBeDisabled();
    expect(screen.getByLabelText('Ahmed estimate')).toHaveAttribute('max', '12');
  });

  it('does not allow estimate acceptance while the highest estimate is tied', async () => {
    const user = userEvent.setup();
    render(<table><tbody><CurrentRoundRow
      roundNumber={1}
      players={players}
      existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
      onSave={vi.fn()}
    /></tbody></table>);

    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.type(screen.getByLabelText('Mona estimate'), '5');

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('A unique highest estimate is required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept estimates' })).toBeDisabled();
  });
});
