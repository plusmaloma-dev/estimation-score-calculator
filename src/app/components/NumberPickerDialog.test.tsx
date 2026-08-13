import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberPickerDialog, type NumberPickerDialogProps } from './NumberPickerDialog.js';

function renderPicker(overrides: Partial<NumberPickerDialogProps> = {}) {
  const props: NumberPickerDialogProps = {
    title: 'Rami — Estimate',
    value: 4,
    max: 12,
    onSelect: vi.fn(),
    onClear: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<NumberPickerDialog {...props} />);
  return props;
}

describe('NumberPickerDialog', () => {
  it('renders a centered estimate picker from 0 through 12 and marks the current value', async () => {
    const user = userEvent.setup();
    const props = renderPicker();

    expect(screen.getByRole('dialog', { name: 'Rami — Estimate' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Choose \d+$/ })).toHaveLength(13);
    expect(screen.getByRole('button', { name: 'Choose 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Choose 13' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Choose 12' }));
    expect(props.onSelect).toHaveBeenCalledWith(12);
  });

  it('renders 13 for actual tricks and supports Clear and Cancel', async () => {
    const user = userEvent.setup();
    const props = renderPicker({ title: 'Rami — Actual tricks', value: undefined, max: 13 });

    expect(screen.getByRole('button', { name: 'Choose 13' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear value' }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel number entry' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape and backdrop click without selecting a value', () => {
    const props = renderPicker();
    const dialog = screen.getByRole('dialog', { name: 'Rami — Estimate' });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(dialog);

    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and restores it to the trigger on cancellation', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Edit estimate</button>
          {open && (
            <NumberPickerDialog
              title="Rami — Estimate"
              value={4}
              max={12}
              onSelect={vi.fn()}
              onClear={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Edit estimate' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Choose 4' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel number entry' }));
    expect(trigger).toHaveFocus();
  });
});
