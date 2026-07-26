import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalDeck } from '../../gameplay/CanonicalDeck.js';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

function controlSnapshot(): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 4,
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'user-0',
        joinedAt: '2026-07-26T10:00:00.000Z',
        connectedAt: '2026-07-26T10:00:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'human',
        humanUserId: 'user-1',
        joinedAt: '2026-07-26T10:00:00.000Z',
        connectedAt: '2026-07-26T10:00:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'human',
        humanUserId: 'user-2',
        joinedAt: '2026-07-26T10:00:00.000Z',
        connectedAt: '2026-07-26T10:00:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 3,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:3',
        joinedAt: '2026-07-26T10:00:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
    ],
    events: [],
    directives: [],
  };
}

function roundSnapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'bidding',
    version: 2,
    viewerSeat: 2,
    bidOwnerSeat: 2,
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
    ...overrides,
  };
}

function services(
  initial: OnlineGameplayRoundSnapshot,
  overrides: Partial<NonNullable<AppServices['gameplayRound']>> = {},
): AppServices {
  return {
    shell: {
      getSessionHistory: () => ({ sessions: [] }),
      createScoreSheet: vi.fn(), openSession: vi.fn(), saveRound: vi.fn(),
    },
    playerDirectory: {
      listActivePlayers: async () => [],
      createPlayer: async () => ({ valid: false, errors: ['not used'] }),
    },
    activeGameControl: {
      initialize: vi.fn(),
      getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: controlSnapshot() })),
      pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(), disconnect: vi.fn(), reconnect: vi.fn(),
      evaluateGrace: vi.fn(), evaluateDeadlines: vi.fn(), startTurn: vi.fn(),
      beginBotAction: vi.fn(), completeActionBoundary: vi.fn(),
    },
    gameplayRound: {
      getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: initial })),
      submitBid: vi.fn(),
      playCard: vi.fn(),
      ...overrides,
    },
  };
}

function renderScreen(appServices: AppServices, currentUserId = 'user-2') {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="active-game">
        <ActiveGameplayScreen tableId="table-1" currentUserId={currentUserId} />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('ActiveGameplayScreen bidding', () => {
  it('shows public estimate progress and lets the acting bid owner submit estimate and contract suit', async () => {
    const user = userEvent.setup();
    const accepted = roundSnapshot({
      version: 3,
      nextBidSeat: 3,
      legalNormalEstimates: [],
      players: [
        { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0 },
        { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0 },
        {
          seat: 2,
          playerId: 'p2',
          cardCount: 13,
          actualTricks: 0,
          bid: { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
        },
        { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0 },
      ],
    });
    const submitBid = vi.fn(async () => ({ valid: true, errors: [], value: accepted }));
    renderScreen(services(roundSnapshot(), { submitBid }));

    expect(await screen.findByRole('heading', { name: 'Round 1 estimates' })).toBeVisible();
    const progress = screen.getByRole('list', { name: 'Public estimates' });
    expect(within(progress).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Your estimate turn')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Estimate'), '5');
    await user.selectOptions(screen.getByLabelText('Contract suit'), 'spades');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    expect(submitBid).toHaveBeenCalledWith(
      'table-1',
      2,
      expect.any(String),
      { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
    );
    expect(await screen.findByText('5 · Spades')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Submit estimate' })).not.toBeInTheDocument();
  });

  it('shows controls only to the acting seat and preserves the server-projected total-13 exclusion', async () => {
    const acting = roundSnapshot({
      version: 5,
      viewerSeat: 1,
      nextBidSeat: 1,
      legalNormalEstimates: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      players: [
        { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0, bid: { playerId: 'p0', bidType: 'normal', tricks: 2 } },
        { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0 },
        { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0, bid: { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' } },
        { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0, bid: { playerId: 'p3', bidType: 'normal', tricks: 3 } },
      ],
    });
    const { unmount } = renderScreen(services(acting), 'user-1');

    const estimate = await screen.findByLabelText('Estimate');
    expect(within(estimate).queryByRole('option', { name: '3' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contract suit')).not.toBeInTheDocument();
    unmount();

    renderScreen(services({ ...acting, viewerSeat: 0, legalNormalEstimates: [] }), 'user-0');
    expect(await screen.findByRole('heading', { name: 'Round 1 estimates' })).toBeVisible();
    expect(screen.queryByLabelText('Estimate')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for Seat 2')).toBeVisible();
  });

  it('renders the authoritative transition to card play after the fourth accepted estimate', async () => {
    const user = userEvent.setup();
    const fourth = roundSnapshot({
      viewerSeat: 1,
      nextBidSeat: 1,
      version: 5,
      legalNormalEstimates: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
    const playing = roundSnapshot({
      viewerSeat: 1,
      phase: 'playing',
      version: 6,
      nextBidSeat: undefined,
      currentTurnSeat: 0,
      legalNormalEstimates: [],
      players: [
        { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0, bid: { playerId: 'p0', bidType: 'normal', tricks: 2 } },
        { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0, bid: { playerId: 'p1', bidType: 'normal', tricks: 1 } },
        { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0, bid: { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' } },
        { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0, bid: { playerId: 'p3', bidType: 'normal', tricks: 3 } },
      ],
    });
    const submitBid = vi.fn(async () => ({ valid: true, errors: [], value: playing }));
    renderScreen(services(fourth, { submitBid }), 'user-1');

    await user.selectOptions(await screen.findByLabelText('Estimate'), '1');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    expect(await screen.findByText('Bidding complete. Card play is ready.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Submit estimate' })).not.toBeInTheDocument();
  });
});
