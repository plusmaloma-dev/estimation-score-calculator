import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalDeck } from '../../gameplay/CanonicalDeck.js';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import {
  OnlineGameplayRoundService,
  type GameplayRoundFunctionClient,
} from '../../online/gameplay/OnlineGameplayRoundService.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

function controlSnapshot(
  round: OnlineGameplayRoundSnapshot = roundSnapshot(),
): OnlineActiveGameControlSnapshot {
  const isBidPhase = round.phase === 'auction' || round.phase === 'estimate';
  const actionKind = isBidPhase ? 'bid' : 'card';
  const seat = isBidPhase
    ? round.nextBidSeat ?? 0
    : round.currentTurnSeat ?? 0;
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 4,
    turn: {
      turnId: `round-${round.roundNumber}:${actionKind}:${round.version}:${seat}`,
      seat,
      actionKind,
      startedAt: '2026-07-26T10:00:00.000Z',
      deadlineAt: '2026-07-26T10:00:45.000Z',
      status: 'running',
    },
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
    phase: 'estimate',
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
    ...overrides,
  };
}

function services(
  initial: OnlineGameplayRoundSnapshot,
  overrides: Partial<NonNullable<AppServices['gameplayRound']>> = {},
  controlSnapshots: readonly OnlineActiveGameControlSnapshot[] = [controlSnapshot(initial)],
  roundSnapshots: readonly OnlineGameplayRoundSnapshot[] = [initial],
): AppServices {
  let controlSnapshotIndex = 0;
  let roundSnapshotIndex = 0;
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
      getSnapshot: vi.fn(async () => ({
        valid: true,
        errors: [],
        value: controlSnapshots[Math.min(controlSnapshotIndex++, controlSnapshots.length - 1)],
      })),
      pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(), disconnect: vi.fn(), reconnect: vi.fn(),
      evaluateGrace: vi.fn(), evaluateDeadlines: vi.fn(), startTurn: vi.fn(),
      beginBotAction: vi.fn(), completeActionBoundary: vi.fn(),
    },
    gameplayRound: {
      getSnapshot: vi.fn(async () => ({
        valid: true,
        errors: [],
        value: roundSnapshots[Math.min(roundSnapshotIndex++, roundSnapshots.length - 1)],
      })),
      submitBid: vi.fn(),
      submitAuctionAction: vi.fn(),
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
  it('shows one authoritative estimate-by-seat list and lets the acting estimator submit a normal estimate', async () => {
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
    const initial = roundSnapshot();
    renderScreen(services(
      initial,
      { submitBid },
      [controlSnapshot(initial), controlSnapshot(accepted)],
      [initial, accepted],
    ));

    expect(await screen.findByRole('heading', { name: 'Round 1' })).toBeVisible();
    const progress = screen.getByRole('list', { name: 'Estimates by seat' });
    expect(within(progress).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('list', { name: 'Public estimates' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Submit your estimate');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estimate' }), '5');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    expect(submitBid).toHaveBeenCalledWith(
      'table-1',
      2,
      expect.any(String),
      { playerId: 'p2', bidType: 'normal', tricks: 5 },
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Standard bot in Seat 4 is acting');
    });
    expect(screen.queryByRole('button', { name: 'Submit estimate' })).not.toBeInTheDocument();
  });

  it('submits a projected higher contract through the authoritative auction command', async () => {
    const user = userEvent.setup();
    const initial = roundSnapshot({
      phase: 'auction',
      bidOwnerSeat: undefined,
      callerSeat: undefined,
      trumpSuit: undefined,
      riskSeat: undefined,
      auctionActiveSeat: 2,
      nextBidSeat: 2,
      legalNormalEstimates: [],
      legalAuctionActions: [
        { action: { type: 'pass' } },
        { action: { type: 'contract', tricks: 4, trumpSuit: 'diamonds' } },
        { action: { type: 'contract', tricks: 4, trumpSuit: 'hearts' } },
        { action: { type: 'contract', tricks: 5, trumpSuit: 'clubs' } },
      ],
    });
    const accepted = {
      ...initial,
      version: 3,
      auctionActiveSeat: 3 as const,
      nextBidSeat: 3 as const,
      legalAuctionActions: [],
    };
    const submitAuctionAction = vi.fn(async () => ({ valid: true, errors: [], value: accepted }));
    renderScreen(services(
      initial,
      { submitAuctionAction },
      [controlSnapshot(initial), controlSnapshot(accepted)],
      [initial, accepted],
    ));

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Contract auction' }),
      JSON.stringify({ type: 'contract', tricks: 4, trumpSuit: 'diamonds' }));
    await user.click(screen.getByRole('button', { name: 'Submit contract action' }));

    expect(submitAuctionAction).toHaveBeenCalledWith(
      'table-1',
      2,
      expect.any(String),
      { type: 'contract', tricks: 4, trumpSuit: 'diamonds' },
    );
  });

  it('keeps the production auction service validator receiver when the screen submits', async () => {
    const user = userEvent.setup();
    const initial = roundSnapshot({
      phase: 'auction',
      bidOwnerSeat: undefined,
      callerSeat: undefined,
      trumpSuit: undefined,
      riskSeat: undefined,
      auctionActiveSeat: 2,
      nextBidSeat: 2,
      legalNormalEstimates: [],
      legalAuctionActions: [{ action: { type: 'pass' } }],
    });
    const accepted = { ...initial, version: 3, auctionActiveSeat: 3 as const, nextBidSeat: 3 as const, legalAuctionActions: [] };
    const invoke = vi.fn(async (_name: string, options: { readonly body: Readonly<Record<string, unknown>> }) => ({
      data: {
        valid: true,
        errors: [],
        value: options.body.action === 'snapshot' ? initial : accepted,
      },
      error: null,
    }));
    const productionRoundService = new OnlineGameplayRoundService({ functions: { invoke } } as GameplayRoundFunctionClient);
    const appServices: AppServices = {
      ...services(initial, {}, [controlSnapshot(initial), controlSnapshot(accepted)], [initial, accepted]),
      gameplayRound: productionRoundService,
    };
    renderScreen(appServices);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Contract auction' }), JSON.stringify({ type: 'pass' }));
    await user.click(screen.getByRole('button', { name: 'Submit contract action' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('gameplay-round-command', expect.objectContaining({
      body: expect.objectContaining({ action: 'submit-auction-action', auctionAction: { type: 'pass' } }),
    })));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the production estimate command path and surfaces a controlled rejection', async () => {
    const user = userEvent.setup();
    const initial = roundSnapshot({
      legalNormalEstimates: [4, 5],
      legalAuctionActions: [],
    });
    const invoke = vi.fn(async (_name: string, options: { readonly body: Readonly<Record<string, unknown>> }) => ({
      data: options.body.action === 'snapshot'
        ? { valid: true, errors: [], value: initial }
        : { valid: false, errors: ['Seat 3 must submit the next estimate.'] },
      error: null,
    }));
    const productionRoundService = new OnlineGameplayRoundService({ functions: { invoke } } as GameplayRoundFunctionClient);
    const appServices: AppServices = {
      ...services(initial, {}, [controlSnapshot(initial)], [initial]),
      gameplayRound: productionRoundService,
    };
    renderScreen(appServices);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Estimate' }), '4');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('gameplay-round-command', expect.objectContaining({
      body: expect.objectContaining({ action: 'submit-bid', bid: { playerId: 'p2', bidType: 'normal', tricks: 4 } }),
    })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seat 3 must submit the next estimate.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('validateCommand');
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

    const estimate = await screen.findByRole('combobox', { name: 'Estimate' });
    expect(within(estimate).queryByRole('option', { name: '3' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contract suit')).not.toBeInTheDocument();
    unmount();

    renderScreen(services({ ...acting, viewerSeat: 0, legalNormalEstimates: [] }), 'user-0');
    expect(await screen.findByRole('heading', { name: 'Estimate' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Estimate' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for Seat 2');
  });

  it('renders the authoritative transition to card play after the final non-caller estimate', async () => {
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
    renderScreen(services(
      fourth,
      { submitBid },
      [controlSnapshot(fourth), controlSnapshot(playing)],
      [fourth, playing],
    ), 'user-1');

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Estimate' }), '1');
    await user.click(screen.getByRole('button', { name: 'Submit estimate' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Waiting for Seat 1');
    });
    expect(screen.queryByRole('button', { name: 'Submit estimate' })).not.toBeInTheDocument();
  });
});
