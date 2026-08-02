import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompletedGameplayTrick } from '../../gameplay/types.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayFinalTrick } from './GameplayFinalTrick.js';

const finalTrick: CompletedGameplayTrick = {
  trickNumber: 13,
  leaderSeat: 2,
  entries: [
    { seat: 2, card: { suit: 'hearts', rank: 'K' } },
    { seat: 3, card: { suit: 'hearts', rank: '2' } },
    { seat: 0, card: { suit: 'hearts', rank: 'A' } },
    { seat: 1, card: { suit: 'hearts', rank: '4' } },
  ],
  winnerSeat: 0,
};

describe('GameplayFinalTrick', () => {
  it('retains all four literal seat/card associations and the winner for trick 13', () => {
    render(
      <I18nProvider>
        <GameplayFinalTrick trick={finalTrick} />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Final trick · Trick 13' })).toBeVisible();
    const cards = screen.getByRole('list', { name: 'Final trick cards' });
    const items = within(cards).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Seat 3');
    expect(items[0]).toHaveTextContent('K♥');
    expect(items[1]).toHaveTextContent('Seat 4');
    expect(items[1]).toHaveTextContent('2♥');
    expect(items[2]).toHaveTextContent('Seat 1');
    expect(items[2]).toHaveTextContent('A♥');
    expect(items[2]).toHaveTextContent('Winner');
    expect(items[3]).toHaveTextContent('Seat 2');
    expect(items[3]).toHaveTextContent('4♥');
  });
});
