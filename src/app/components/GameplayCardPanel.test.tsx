import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

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

  it('retains trick 13 and its winner without showing opening-card copy after scoring', () => {
    const completedTricks: OnlineGameplayRoundSnapshot['completedTricks'] = Array.from(
      { length: 13 },
      (_, index) => ({
        trickNumber: index + 1,
        leaderSeat: 0,
        entries: [
          { seat: 0, card: { suit: 'spades', rank: 'A' } },
          { seat: 1, card: { suit: 'spades', rank: '2' } },
          { seat: 2, card: { suit: 'spades', rank: '3' } },
          { seat: 3, card: { suit: 'spades', rank: '4' } },
        ],
        winnerSeat: 0,
      }),
    );
    const scored = snapshot({
      phase: 'scored',
      currentTurnSeat: undefined,
      ownHand: [],
      legalCards: [],
      currentTrick: [],
      completedTricks,
    });

    renderPanel(scored);
    expect(screen.getByText('13 of 13 tricks completed')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Final trick · Trick 13' })).toBeVisible();
    expect(screen.getByText('A♠')).toBeVisible();
    expect(screen.getByText('Winner')).toBeVisible();
    expect(screen.queryByText('Waiting for the opening card.')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders an empty current trick as four stable seat positions with waiting state', () => {
    renderPanel(snapshot({ currentTrick: [] }));

    const trick = screen.getByRole('table', { name: 'Current trick cards' });
    expect(within(trick).getAllByRole('row')).toHaveLength(5);
    expect(within(trick).getByText('Waiting for first card')).toBeVisible();
    for (const seat of ['Seat 1', 'Seat 2', 'Seat 3', 'Seat 4']) {
      expect(within(trick).getByText(seat)).toBeVisible();
    }
  });

  it('keeps four trick seats stable and shows suit to follow after the lead card', () => {
    renderPanel(snapshot({
      currentTrick: [
        { seat: 2, card: { suit: 'hearts', rank: '4' } },
        { seat: 3, card: { suit: 'hearts', rank: 'K' } },
        { seat: 0, card: { suit: 'hearts', rank: 'A' } },
      ],
    }));

    const trick = screen.getByRole('table', { name: 'Current trick cards' });
    expect(within(trick).getAllByRole('row')).toHaveLength(5);
    expect(within(trick).getByText('Suit to follow: Hearts')).toBeVisible();
    expect(within(trick).getByText('Seat 2')).toBeVisible();
    expect(within(trick).getAllByText('Waiting')).toHaveLength(1);
  });

  it('shows the last completed trick while the next trick is in progress', () => {
    renderPanel(snapshot({
      currentTrick: [{ seat: 1, card: { suit: 'clubs', rank: '2' } }],
      completedTricks: [{
        trickNumber: 4,
        leaderSeat: 0,
        entries: [
          { seat: 0, card: { suit: 'spades', rank: 'A' } },
          { seat: 1, card: { suit: 'spades', rank: '2' } },
          { seat: 2, card: { suit: 'spades', rank: '3' } },
          { seat: 3, card: { suit: 'spades', rank: '4' } },
        ],
        winnerSeat: 0,
      }],
    }));

    expect(screen.getByRole('heading', { name: 'Last completed trick · Trick 4' })).toBeVisible();
    expect(screen.getByText('A♠')).toBeVisible();
    expect(screen.getByText('2♣')).toBeVisible();
  });

  it('renders public card and trick seat labels in Arabic', () => {
    window.localStorage.setItem('estimation-language', 'ar');
    renderPanel(snapshot());

    expect(screen.getByText('المقعد 3')).toBeVisible();
    expect(screen.getByLabelText('بطاقات اللفة الحالية')).toBeVisible();
    expect(screen.getByLabelText('اللفات المحققة')).toBeVisible();
    expect(screen.queryByText('Seat 3')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current trick cards')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tricks won')).not.toBeInTheDocument();
  });
});
