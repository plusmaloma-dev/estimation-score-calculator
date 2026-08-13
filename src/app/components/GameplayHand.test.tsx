import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cardId } from '../../domain/card.js';
import { createCanonicalDeck } from '../../gameplay/CanonicalDeck.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayHand } from './GameplayHand.js';

const ownHand = createCanonicalDeck().slice(0, 13);
const mixedHand = [
  { suit: 'clubs', rank: '2' },
  { suit: 'hearts', rank: 'A' },
  { suit: 'spades', rank: 'K' },
  { suit: 'hearts', rank: '3' },
  { suit: 'diamonds', rank: 'Q' },
] as const;

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
    expect(screen.getByRole('button', { name: '2 of spades' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '3 of spades' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '4 of spades' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '2 of spades' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(ownHand[0]);
  });

  it('disables every card in a non-actionable state', () => {
    renderHand({ mode: 'disabled' });
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();
  });

  it('sorts a derived hand copy with trump first and preserves legal state and original card values', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn(async () => undefined);
    const originalOrder = mixedHand.map(cardId);

    render(
      <I18nProvider>
        <GameplayHand
          ownHand={mixedHand}
          mode="play"
          legalCardIds={new Set([cardId(mixedHand[1]!), cardId(mixedHand[2]!)])}
          trumpSuit="hearts"
          onPlay={onPlay}
        />
      </I18nProvider>,
    );

    const cards = screen.getAllByRole('button');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Ace of hearts',
      '3 of hearts',
      'King of spades',
      'Queen of diamonds',
      '2 of clubs',
    ]);
    expect(cards[0]).toBeEnabled();
    expect(cards[1]).toBeDisabled();
    expect(cards[2]).toBeEnabled();
    await user.click(cards[0]!);
    expect(onPlay).toHaveBeenCalledWith(mixedHand[1]);
    expect(mixedHand.map(cardId)).toEqual(originalOrder);
  });

  it('uses explicit suit classes for red and dark suits', () => {
    render(
      <I18nProvider>
        <GameplayHand ownHand={mixedHand} mode="read-only" legalCardIds={new Set()} />
      </I18nProvider>,
    );

    expect(screen.getByRole('img', { name: 'Ace of hearts' })).toHaveClass('playing-card--red');
    expect(screen.getByRole('img', { name: 'Queen of diamonds' })).toHaveClass('playing-card--red');
    expect(screen.getByRole('img', { name: 'King of spades' })).toHaveClass('playing-card--black');
    expect(screen.getByRole('img', { name: '2 of clubs' })).toHaveClass('playing-card--black');
  });
});
