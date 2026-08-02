import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalDeck } from '../../gameplay/CanonicalDeck.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayBidPanel } from './GameplayBidPanel.js';

function snapshot(): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'bidding',
    version: 2,
    viewerSeat: 2,
    bidOwnerSeat: 2,
    riskSeat: 1,
    nextBidSeat: 2,
    players: [
      { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: createCanonicalDeck().slice(0, 13),
    legalNormalEstimates: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
  };
}

function renderPanel(
  canSubmit: boolean,
  onSubmit = vi.fn(async () => undefined),
  value = snapshot(),
) {
  render(
    <I18nProvider>
      <GameplayBidPanel
        snapshot={value}
        canSubmit={canSubmit}
        busy={false}
        onSubmit={onSubmit}
      />
    </I18nProvider>,
  );
  return onSubmit;
}

describe('GameplayBidPanel', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());
  it('shows the viewer hand read-only and submits only when the parent authorizes the action', async () => {
    const user = userEvent.setup();
    const onSubmit = renderPanel(true);

    const hand = screen.getByRole('group', { name: 'Your hand' });
    expect(within(hand).getAllByRole('img')).toHaveLength(13);
    expect(within(hand).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Public estimates' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estimate' }), '5');
    await user.selectOptions(screen.getByLabelText('Contract suit'), 'spades');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    expect(onSubmit).toHaveBeenCalledWith({
      playerId: 'p2',
      bidType: 'normal',
      tricks: 5,
      trumpSuit: 'spades',
    });
  });

  it('shows no estimate form or independent waiting instruction when the parent denies the action', () => {
    renderPanel(false);

    expect(screen.queryByRole('combobox', { name: 'Estimate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for Seat/)).not.toBeInTheDocument();
  });

  it('does not duplicate seat estimates or combine an estimate with trump', () => {
    renderPanel(false, vi.fn(async () => undefined), {
      ...snapshot(),
      players: [
        { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0, bid: { playerId: 'p0', bidType: 'normal', tricks: 5, trumpSuit: 'spades' } },
        ...snapshot().players.slice(1),
      ],
    });

    expect(screen.queryByRole('list', { name: 'Public estimates' })).not.toBeInTheDocument();
    expect(screen.queryByText('5 · Spades')).not.toBeInTheDocument();
  });

  it('renders the bidding controls in Arabic without new hardcoded English labels', () => {
    window.localStorage.setItem('estimation-language', 'ar');
    renderPanel(true);

    expect(screen.getByRole('heading', { name: 'التقدير' })).toBeVisible();
    expect(screen.getByText('الإصدار 2')).toBeVisible();
    expect(screen.getByRole('option', { name: 'اختر الحكم' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'بستوني' })).toBeVisible();
    expect(screen.queryByText('Select contract')).not.toBeInTheDocument();
    expect(screen.queryByText('Spades')).not.toBeInTheDocument();
    expect(screen.queryByText('Round 1 estimates')).not.toBeInTheDocument();
    expect(screen.queryByText('Version 2')).not.toBeInTheDocument();
  });
});
