import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveAutomaticRiskPlayerId,
  type CurrentRoundDraft,
} from '../scoreSheet/currentRoundReducer.js';
import { CurrentRoundRow } from './CurrentRoundRow.js';

const players = [
  { id: 'A', name: 'Asaad' },
  { id: 'B', name: 'Rami' },
  { id: 'C', name: 'Reda' },
  { id: 'D', name: 'Bahaa' },
] as const;

describe('CurrentRoundRow Risk regression', () => {
  it('keeps the Over +2 Risk marker visible after estimates are accepted and passes the Risk taker to scoring', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(draft: CurrentRoundDraft) => void>();

    render(
      <table>
        <tbody>
          <CurrentRoundRow
            roundNumber={2}
            players={players}
            existingTotals={{ A: 0, B: 0, C: 0, D: 0 }}
            onSave={onSave}
          />
        </tbody>
      </table>,
    );

    await user.type(screen.getByLabelText('Asaad estimate'), '8');
    await user.selectOptions(screen.getByLabelText('Asaad trump'), 'spades');
    await user.type(screen.getByLabelText('Rami estimate'), '5');
    await user.type(screen.getByLabelText('Reda estimate'), '1');
    await user.type(screen.getByLabelText('Bahaa estimate'), '1');
    await user.click(screen.getByRole('button', { name: 'Accept estimates' }));

    expect(screen.getByLabelText('Bahaa estimate annotations')).toHaveTextContent('R');
    expect(screen.getByLabelText('Bahaa estimate')).toBeDisabled();

    for (const [name, actual] of [['Asaad', '7'], ['Rami', '4'], ['Reda', '2'], ['Bahaa', '0']] as const) {
      await user.type(screen.getByLabelText(`${name} actual tricks`), actual);
    }
    await user.click(screen.getByRole('button', { name: 'Calculate scores' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedDraft = onSave.mock.calls[0]?.[0];
    expect(savedDraft).toBeDefined();
    expect(resolveAutomaticRiskPlayerId(savedDraft!)).toBe('D');
  });
});
