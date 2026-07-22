import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CurrentRoundRow } from './CurrentRoundRow.js';

describe('CurrentRoundRow', () => {
  it('collects estimates and actual tricks before saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<table><tbody><CurrentRoundRow
      roundNumber={1}
      players={[
        { id: 'A', name: 'Ahmed' }, { id: 'B', name: 'Mona' },
        { id: 'C', name: 'Rami' }, { id: 'D', name: 'Dina' },
      ]}
      existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
      onSave={onSave}
    /></tbody></table>);

    await user.clear(screen.getByLabelText('Ahmed estimate'));
    await user.type(screen.getByLabelText('Ahmed estimate'), '4');
    await user.clear(screen.getByLabelText('Mona estimate'));
    await user.type(screen.getByLabelText('Mona estimate'), '3');
    await user.clear(screen.getByLabelText('Rami estimate'));
    await user.type(screen.getByLabelText('Rami estimate'), '3');
    await user.clear(screen.getByLabelText('Dina estimate'));
    await user.type(screen.getByLabelText('Dina estimate'), '4');

    expect(screen.getByText('O/U +1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate and save' })).toBeDisabled();
  });
});
