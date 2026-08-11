import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalDeck } from '../../gameplay/CanonicalDeck.js';
import type { GameplayAuctionAction } from '../../gameplay/types.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayBidPanel } from './GameplayBidPanel.js';

function snapshot(overrides: Partial<OnlineGameplayRoundSnapshot> = {}): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'estimate',
    version: 2,
    viewerSeat: 2,
    dealerSeat: 0,
    callerSeat: 1,
    trumpSuit: 'spades',
    riskSeat: 1,
    nextBidSeat: 2,
    players: [
      { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0, bid: { playerId: 'p1', bidType: 'normal', tricks: 5 } },
      { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: createCanonicalDeck().slice(0, 13),
    legalNormalEstimates: [0, 1, 2, 3, 4, 5],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

function renderPanel({
  canSubmit = true,
  onSubmit = vi.fn(async () => undefined),
  onSubmitAuctionAction = vi.fn(async () => undefined),
  value = snapshot(),
}: {
  readonly canSubmit?: boolean;
  readonly onSubmit?: ReturnType<typeof vi.fn>;
  readonly onSubmitAuctionAction?: ReturnType<typeof vi.fn>;
  readonly value?: OnlineGameplayRoundSnapshot;
} = {}) {
  render(
    <I18nProvider>
      <GameplayBidPanel
        snapshot={value}
        canSubmit={canSubmit}
        busy={false}
        onSubmit={onSubmit}
        onSubmitAuctionAction={onSubmitAuctionAction}
      />
    </I18nProvider>,
  );
  return { onSubmit, onSubmitAuctionAction };
}

describe('GameplayBidPanel', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('shows the viewer hand read-only and submits an authorized normal estimate', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel();

    const hand = screen.getByRole('group', { name: 'Your hand' });
    expect(within(hand).getAllByRole('img')).toHaveLength(13);
    expect(within(hand).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Public estimates' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contract suit')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estimate' }), '5');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    expect(onSubmit).toHaveBeenCalledWith({ playerId: 'p2', bidType: 'normal', tricks: 5 });
  });

  it('shows Pass and only projected contract actions during the auction', async () => {
    const user = userEvent.setup();
    const actions: readonly GameplayAuctionAction[] = [
      { type: 'pass' },
      { type: 'contract', tricks: 4, trumpSuit: 'diamonds' },
      { type: 'contract', tricks: 4, trumpSuit: 'hearts' },
      { type: 'contract', tricks: 5, trumpSuit: 'clubs' },
    ];
    const { onSubmitAuctionAction } = renderPanel({
      value: snapshot({
        phase: 'auction',
        callerSeat: undefined,
        trumpSuit: undefined,
        riskSeat: undefined,
        auctionActiveSeat: 2,
        nextBidSeat: 2,
        legalNormalEstimates: [],
        legalAuctionActions: actions.map((action) => ({ action })),
      }),
    });

    expect(screen.getByRole('option', { name: 'Pass' })).toBeVisible();
    expect(screen.getByRole('option', { name: '4 Diamonds' })).toBeVisible();
    expect(screen.getByRole('option', { name: '5 Clubs' })).toBeVisible();
    expect(screen.queryByRole('option', { name: /WITH/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Estimate' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Contract auction' }), JSON.stringify(actions[1]));
    await user.click(screen.getByRole('button', { name: 'Submit contract action' }));

    expect(onSubmitAuctionAction).toHaveBeenCalledWith(actions[1]);
  });

  it('does not offer WITH or a contract selector during estimates', () => {
    renderPanel();

    expect(screen.queryByRole('option', { name: /WITH/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contract suit')).not.toBeInTheDocument();
  });

  it('uses only the phase-safe numeric estimate projection', () => {
    const value = {
      ...snapshot({
      legalNormalEstimates: [0, 1],
      }),
      legalBidOptions: [
        { tricks: 5, bidType: 'normal', requiresContractSuit: true, legalContractSuits: ['clubs'] },
      ],
    } as unknown as OnlineGameplayRoundSnapshot;
    renderPanel({ value });

    const estimate = screen.getByRole('combobox', { name: 'Estimate' });
    expect(within(estimate).getByRole('option', { name: '0' })).toBeVisible();
    expect(within(estimate).getByRole('option', { name: '1' })).toBeVisible();
    expect(within(estimate).queryByRole('option', { name: '5' })).not.toBeInTheDocument();
  });

  it('does not offer a final estimate that would make total estimates exactly thirteen', () => {
    renderPanel({ value: snapshot({
      legalNormalEstimates: [0, 1, 2, 4, 5],
    }) });

    expect(screen.queryByRole('option', { name: '3' })).not.toBeInTheDocument();
  });

  it('shows no form or independent waiting instruction when the parent denies the action', () => {
    renderPanel({ canSubmit: false });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for Seat/)).not.toBeInTheDocument();
  });
});
