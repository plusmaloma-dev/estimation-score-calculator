import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobilePortraitScoreSheet, useMobileScoreEntry } from '../mobile/deviceMode.js';
import { CurrentRoundRow } from './CurrentRoundRow.js';

vi.mock('../mobile/deviceMode.js', () => ({
  useMobileScoreEntry: vi.fn(() => false),
  useMobilePortraitScoreSheet: vi.fn(() => false),
}));

const mobileEntry = vi.mocked(useMobileScoreEntry);
const mobilePortrait = vi.mocked(useMobilePortraitScoreSheet);

beforeEach(() => {
  mobileEntry.mockReturnValue(false);
  mobilePortrait.mockReturnValue(false);
});

const players = [
  { id: 'A', name: 'Ahmed' },
  { id: 'B', name: 'Mona' },
  { id: 'C', name: 'Rami' },
  { id: 'D', name: 'Dina' },
] as const;

function renderRow(onSave = vi.fn()) {
  render(<table><tbody><CurrentRoundRow
    roundNumber={1}
    players={players}
    existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
    onSave={onSave}
  /></tbody></table>);
  return onSave;
}

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
    renderRow();

    await user.type(screen.getByLabelText('Ahmed estimate'), '13');

    expect(screen.getByText('Each estimate must be between 0 and 12.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept estimates' })).toBeDisabled();
    expect(screen.getByLabelText('Ahmed estimate')).toHaveAttribute('max', '12');
  });

  it('assigns trump to the first entered top estimate, supports multiple With players, and derives Risk from that caller', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.type(screen.getByLabelText('Rami estimate'), '5');
    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.type(screen.getByLabelText('Mona estimate'), '5');
    await user.type(screen.getByLabelText('Dina estimate'), '0');

    expect(screen.getByLabelText('Rami trump')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ahmed trump')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mona trump')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ahmed estimate annotations')).toHaveTextContent('W');
    expect(screen.getByLabelText('Mona estimate annotations')).toHaveTextContent('W');
    expect(screen.getByLabelText('Mona estimate annotations')).toHaveTextContent('R');
    expect(screen.getByText('Multiple WITH: ×2')).toBeInTheDocument();
    expect(screen.getAllByText('+2').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Rami trump'), 'hearts');
    expect(screen.getByRole('button', { name: 'Accept estimates' })).toBeEnabled();
  });

  it('shows an unselected Hold toggle for every positive non-owner and never infers Hold', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.type(screen.getByLabelText('Ahmed estimate'), '4');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'hearts');
    await user.type(screen.getByLabelText('Rami estimate'), '4');

    expect(screen.queryByRole('button', { name: 'Ahmed Hold' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Rami estimate annotations')).toHaveTextContent('W');

    await user.clear(screen.getByLabelText('Ahmed estimate'));
    await user.type(screen.getByLabelText('Ahmed estimate'), '5');

    expect(screen.queryByRole('button', { name: 'Rami follow 5' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps a selected Hold through owner estimate and trump changes and allows removal', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.type(screen.getByLabelText('Ahmed estimate'), '4');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'hearts');
    await user.type(screen.getByLabelText('Rami estimate'), '4');
    await user.click(screen.getByRole('button', { name: 'Rami Hold' }));

    expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'true');

    await user.clear(screen.getByLabelText('Ahmed estimate'));
    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');

    expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Rami Hold' }));
    expect(screen.getByRole('button', { name: 'Rami Hold' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves Risk when the last caller is explicitly marked Hold', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.type(screen.getByLabelText('Ahmed estimate'), '5');
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'clubs');
    await user.type(screen.getByLabelText('Mona estimate'), '2');
    await user.type(screen.getByLabelText('Rami estimate'), '5');
    await user.type(screen.getByLabelText('Dina estimate'), '5');
    expect(screen.getByLabelText('Dina estimate annotations')).toHaveTextContent('R');

    await user.click(screen.getByRole('button', { name: 'Dina Hold' }));
    expect(screen.getByLabelText('Rami estimate annotations')).toHaveTextContent('R');
  });

  it('uses a centered 0–12 picker for mobile estimates without rendering a numeric input', async () => {
    mobileEntry.mockReturnValue(true);
    const user = userEvent.setup();
    renderRow();

    const trigger = screen.getByRole('button', { name: 'Ahmed estimate' });
    expect(screen.queryByRole('spinbutton', { name: 'Ahmed estimate' })).not.toBeInTheDocument();
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Ahmed — Estimate' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Choose 13' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose 5' }));
    expect(trigger).toHaveTextContent('5');
  });

  it('uses a centered 0–13 picker for mobile actual tricks and keeps manual Hold available', async () => {
    mobileEntry.mockReturnValue(true);
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
    await user.click(screen.getByRole('button', { name: 'Choose 5' }));
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'clubs');
    await user.click(screen.getByRole('button', { name: 'Rami estimate' }));
    await user.click(screen.getByRole('button', { name: 'Choose 5' }));
    await user.click(screen.getByRole('button', { name: 'Rami Hold' }));
    expect(screen.getByLabelText('Rami estimate annotations')).toHaveTextContent('H');

    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));
    await user.click(screen.getByRole('button', { name: 'Rami actual tricks' }));
    expect(screen.getByRole('button', { name: 'Choose 13' })).toBeInTheDocument();
  });

  it('clears a mobile value and closes the picker when portrait begins', async () => {
    mobileEntry.mockReturnValue(true);
    const user = userEvent.setup();
    const view = render(<table><tbody><CurrentRoundRow
      roundNumber={1}
      players={players}
      existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
      onSave={vi.fn()}
    /></tbody></table>);

    await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
    await user.click(screen.getByRole('button', { name: 'Choose 4' }));
    await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
    await user.click(screen.getByRole('button', { name: 'Clear value' }));
    expect(screen.getByRole('button', { name: 'Ahmed estimate' })).toHaveTextContent('—');

    await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
    mobilePortrait.mockReturnValue(true);
    view.rerender(<table><tbody><CurrentRoundRow
      roundNumber={1}
      players={players}
      existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
      onSave={vi.fn()}
    /></tbody></table>);
    expect(screen.queryByRole('dialog', { name: 'Ahmed — Estimate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ahmed estimate' })).toHaveTextContent('—');
  });

  it('does not open the picker from disabled mobile fields', async () => {
    mobileEntry.mockReturnValue(true);
    const user = userEvent.setup();
    renderRow();

    const actualTrigger = screen.getByRole('button', { name: 'Ahmed actual tricks' });
    expect(actualTrigger).toBeDisabled();
    await user.click(actualTrigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ahmed estimate' }));
    await user.click(screen.getByRole('button', { name: 'Choose 5' }));
    await user.selectOptions(screen.getByLabelText('Ahmed trump'), 'spades');
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

    const estimateTrigger = screen.getByRole('button', { name: 'Ahmed estimate' });
    expect(estimateTrigger).toBeDisabled();
    await user.click(estimateTrigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
