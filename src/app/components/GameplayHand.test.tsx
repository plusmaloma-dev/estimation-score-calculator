import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cardId } from '../../domain/card.js';
import { createCanonicalDeck } from '../../gameplay/CanonicalDeck.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayHand } from './GameplayHand.js';

const ownHand = createCanonicalDeck().slice(0, 13);

function renderHand({
  mode,
  onPlay = vi.fn(),
}: {
  readonly mode: 'read-only' | 'disabled' | 'play';
  readonly onPlay?: ReturnType<typeof vi.fn>;
}) {
  render(
    <I18nProvider>
      <GameplayHand
        ownHand={ownHand}
        mode={mode}
        legalCardIds={new Set([cardId(ownHand[0]!), cardId(ownHand[2]!)])}
        onPlay={onPlay}
      />
    </I18nProvider>,
  );
  return onPlay;
}

describe('GameplayHand', () => {
  it('renders the complete viewer hand as non-actionable cards during bidding', () => {
    renderHand({ mode: 'read-only' });

    const hand = screen.getByRole('group', { name: 'Your hand' });
    expect(within(hand).getAllByRole('img')).toHaveLength(13);
    expect(within(hand).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Opponent hand')).not.toBeInTheDocument();
  });

  it('enables only projected legal cards during a compatible card turn', async () => {
    const user = userEvent.setup();
    const onPlay = renderHand({ mode: 'play' });

    const cards = screen.getAllByRole('button');
    expect(cards).toHaveLength(13);
    expect(cards[0]).toBeEnabled();
    expect(cards[1]).toBeDisabled();
    expect(cards[2]).toBeEnabled();

    await user.click(cards[0]!);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(ownHand[0]);
  });

  it('disables every card in a non-actionable state', () => {
    renderHand({ mode: 'disabled' });
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();
  });
});
