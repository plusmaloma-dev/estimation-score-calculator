import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayCardPanel } from './GameplayCardPanel.js';

function snapshot(overrides: Partial<OnlineGameplayRoundSnapshot> = {}): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'playing',
    version: 8,
    viewerSeat: 0,
    bidOwnerSeat: 2,
    riskSeat: 1,
    currentTurnSeat: 0,
    players: [
      { seat: 0, playerId: 'p0', cardCount: 2, actualTricks: 1 },
      { seat: 1, playerId: 'p1', cardCount: 2, actualTricks: 0 },
      { seat: 2, playerId: 'p2', cardCount: 2, actualTricks: 0 },
      { seat: 3, playerId: 'p3', cardCount: 2, actualTricks: 0 },
    ],
    ownHand: [
      { suit: 'hearts', rank: 'A' },
      { suit: 'clubs', rank: '2' },
    ],
    legalNormalEstimates: [],
    legalCards: [{ suit: 'hearts', rank: 'A' }],
    currentTrick: [{ seat: 2, card: { suit: 'hearts', rank: '4' } }],
    completedTricks: [],
    ...overrides,
  };
}

function renderPanel(
  value: OnlineGameplayRoundSnapshot,
  onPlay = vi.fn(async () => undefined),
  busy = false,
  canPlay = true,
) {
  render(
    <I18nProvider>
      <GameplayCardPanel snapshot={value} canPlay={canPlay} busy={busy} onPlay={onPlay} />
    </I18nProvider>,
  );
  return onPlay;
}

describe('GameplayCardPanel', () => {
  it('renders only the viewer hand and public current trick', () => {
    renderPanel(snapshot());

    const hand = screen.getByRole('group', { name: 'Your hand' });
    expect(within(hand).getAllByRole('button')).toHaveLength(2);
    expect(within(hand).getByRole('button', { name: 'Ace of hearts' })).toBeVisible();
    expect(within(hand).getByRole('button', { name: '2 of clubs' })).toBeVisible();
    expect(screen.getByText('Seat 3')).toBeVisible();
    expect(screen.getByText('4♥')).toBeVisible();
    expect(screen.queryByText('Opponent hand')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('enables only legal cards and submits the selected card once', async () => {
    const user = userEvent.setup();
    const onPlay = renderPanel(snapshot());

    const legal = screen.getByRole('button', { name: 'Ace of hearts' });
    const illegal = screen.getByRole('button', { name: '2 of clubs' });
    expect(legal).toBeEnabled();
    expect(illegal).toBeDisabled();

    await user.click(legal);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith({ suit: 'hearts', rank: 'A' });
  });

  it('disables all cards when it is not the viewer turn or the game is busy', () => {
    const { rerender } = render(
      <I18nProvider>
        <GameplayCardPanel snapshot={snapshot({ currentTurnSeat: 1, legalCards: [] })} canPlay={false} busy={false} onPlay={vi.fn()} />
      </I18nProvider>,
    );
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();

    rerender(
      <I18nProvider>
        <GameplayCardPanel snapshot={snapshot()} canPlay busy onPlay={vi.fn()} />
      </I18nProvider>,
    );
    for (const card of screen.getAllByRole('button')) expect(card).toBeDisabled();
  });

  it('shows trick progress and scored round results', () => {
    const scored = snapshot({
      phase: 'scored',
      currentTurnSeat: undefined,
      ownHand: [],
      legalCards: [],
      completedTricks: [{
        trickNumber: 13,
        leaderSeat: 0,
        entries: [
          { seat: 0, card: { suit: 'spades', rank: 'A' } },
          { seat: 1, card: { suit: 'spades', rank: '2' } },
          { seat: 2, card: { suit: 'spades', rank: '3' } },
          { seat: 3, card: { suit: 'spades', rank: '4' } },
        ],
        winnerSeat: 0,
      }],
    });

    renderPanel(scored);
    expect(screen.getByText('13 of 13 tricks completed')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
