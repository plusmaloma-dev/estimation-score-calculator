import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import {
  OnlineGameplayRoundService,
  type GameplayRoundFunctionClient,
} from '../../online/gameplay/OnlineGameplayRoundService.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

type StartNextRoundMock = NonNullable<NonNullable<AppServices['gameplayRound']>['startNextRound']>;

function activeSnapshot(
  overrides: Partial<OnlineActiveGameControlSnapshot> = {},
): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 7,
    turn: {
      turnId: 'round-1:card:1:2',
      seat: 2,
      actionKind: 'card',
      startedAt: '2026-07-26T08:00:00.000Z',
      remainingMs: 30_000,
      status: 'bot-processing',
    },
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'host-user',
        joinedAt: '2026-07-26T07:50:00.000Z',
        connectedAt: '2026-07-26T07:50:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:1',
        joinedAt: '2026-07-26T08:00:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'human',
        humanUserId: 'guest-user',
        joinedAt: '2026-07-26T07:55:00.000Z',
        connectedAt: '2026-07-26T08:02:00.000Z',
        connection: 'connected',
        controlOwner: 'temporary-bot',
        reclaimPending: true,
      },
      {
        seat: 3,
        seatKind: 'human',
        humanUserId: 'member-user',
        joinedAt: '2026-07-26T07:56:00.000Z',
        connectedAt: '2026-07-26T07:56:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
    ],
    events: [],
    directives: [],
    ...overrides,
  };
}

function roundSnapshot(): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'playing',
    version: 1,
    viewerSeat: 0,
    bidOwnerSeat: 0,
    riskSeat: 1,
    currentTurnSeat: 2,
    players: [
      { seat: 0, playerId: 'host-user', cardCount: 13, actualTricks: 0, bid: { playerId: 'host-user', bidType: 'normal', tricks: 4, trumpSuit: 'spades' } },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0, bid: { playerId: 'bot-1', bidType: 'normal', tricks: 3 } },
      { seat: 2, playerId: 'guest-user', cardCount: 13, actualTricks: 0, bid: { playerId: 'guest-user', bidType: 'normal', tricks: 2 } },
      { seat: 3, playerId: 'member-user', cardCount: 13, actualTricks: 0, bid: { playerId: 'member-user', bidType: 'normal', tricks: 5 } },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
  };
}

function scoredControlSnapshot(
  overrides: Partial<OnlineActiveGameControlSnapshot> = {},
): OnlineActiveGameControlSnapshot {
  return activeSnapshot({
    lifecycle: 'active',
    version: 42,
    turn: undefined,
    directives: [],
    ...overrides,
  });
}

function auctionControlSnapshot(
  overrides: Partial<OnlineActiveGameControlSnapshot> = {},
): OnlineActiveGameControlSnapshot {
  return activeSnapshot({
    version: 43,
    turn: {
      turnId: 'round-2:bid:1:1',
      seat: 1,
      actionKind: 'bid',
      startedAt: '2026-07-26T08:10:00.000Z',
      remainingMs: 45_000,
      status: 'running',
    },
    ...overrides,
  });
}

function scoredRoundSnapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    ...roundSnapshot(),
    phase: 'scored',
    version: 19,
    currentTurnSeat: undefined,
    ownHand: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [{
      trickNumber: 13,
      leaderSeat: 0,
      winnerSeat: 2,
      entries: [
        { seat: 0, card: { suit: 'spades', rank: 'A' } },
        { seat: 1, card: { suit: 'spades', rank: 'K' } },
        { seat: 2, card: { suit: 'spades', rank: 'Q' } },
        { seat: 3, card: { suit: 'spades', rank: 'J' } },
      ],
    }],
    scoreResult: {
      roundNumber: 1,
      valid: true,
      errors: [],
      bidValidation: { valid: true, errors: [], roundType: 'under', totalEstimatedTricks: 12 },
      scoreResult: {
        valid: true,
        errors: [],
        roundNumber: 1,
        roundType: 'under',
        playerScores: [
          { playerId: 'host-user', bidTricks: 4, actualTricks: 4, status: 'success', score: 40, riskType: 'none', notes: [] },
          { playerId: 'bot-1', bidTricks: 3, actualTricks: 3, status: 'success', score: 30, riskType: 'round-risk', notes: [] },
          { playerId: 'guest-user', bidTricks: 2, actualTricks: 3, status: 'failed', score: -20, riskType: 'none', notes: [] },
          { playerId: 'member-user', bidTricks: 3, actualTricks: 3, status: 'success', score: 30, riskType: 'none', notes: [] },
        ],
      },
      isAllLoserRound: false,
      consecutiveAllLoserCountBeforeRound: 0,
      carriedAllLoserMultiplier: 1,
      carryConsumed: false,
    },
    ...overrides,
  } as OnlineGameplayRoundSnapshot;
}

function auctionRoundSnapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    ...roundSnapshot(),
    roundNumber: 2,
    phase: 'auction',
    version: 1,
    nextBidSeat: 1,
    currentTurnSeat: undefined,
    bidOwnerSeat: undefined,
    callerSeat: undefined,
    trumpSuit: undefined,
    riskSeat: undefined,
    auctionActiveSeat: 1,
    players: [
      { seat: 0, playerId: 'host-user', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'guest-user', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'member-user', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalAuctionActions: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    scoreResult: undefined,
    ...overrides,
  };
}

function services(
  initial: OnlineActiveGameControlSnapshot,
  overrides: Partial<NonNullable<AppServices['activeGameControl']>> = {},
  roundOverrides: Partial<NonNullable<AppServices['gameplayRound']>> = {},
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
      getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: initial })),
      pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(),
      disconnect: vi.fn(), reconnect: vi.fn(), evaluateGrace: vi.fn(),
      evaluateDeadlines: vi.fn(), startTurn: vi.fn(), beginBotAction: vi.fn(),
      completeActionBoundary: vi.fn(),
      ...overrides,
    },
    gameplayRound: {
      getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: roundSnapshot() })),
      submitBid: vi.fn(),
      playCard: vi.fn(),
      startNextRound: vi.fn(),
      ...roundOverrides,
    },
  };
}

function renderActive(appServices: AppServices, currentUserId: string) {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="active-game">
        <ActiveGameplayScreen tableId="table-1" currentUserId={currentUserId} />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('ActiveGameplayScreen', () => {
  it('shows a neutral synchronization banner without exposing host controls to guests', async () => {
    const appServices = services(activeSnapshot());
    renderActive(appServices, 'member-user');

    expect(await screen.findByRole('heading', { name: 'Active online game' })).toBeVisible();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Synchronizing round state');
    expect(screen.queryByRole('button', { name: 'Pause game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close table' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(appServices.activeGameControl?.getSnapshot).toHaveBeenCalledTimes(2);
      expect(appServices.gameplayRound?.getSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a privacy-safe error and retries the same mismatch after an invalid active-control refresh', async () => {
    const user = userEvent.setup();
    const initial = activeSnapshot();
    const activeGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: initial })
      .mockResolvedValueOnce({ valid: false, errors: ['sensitive active refresh detail'] })
      .mockResolvedValueOnce({ valid: true, errors: [], value: initial });
    const roundGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() })
      .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() })
      .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() });
    const appServices = services(
      initial,
      { getSnapshot: activeGetSnapshot },
      { getSnapshot: roundGetSnapshot },
    );

    renderActive(appServices, 'member-user');

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Could not synchronize the round. Refresh and try again.');
    expect(error).not.toHaveTextContent('sensitive active refresh detail');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit estimate' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your hand')).toHaveClass('gameplay-hand--disabled');
    expect(activeGetSnapshot).toHaveBeenCalledTimes(2);
    expect(roundGetSnapshot).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Refresh game' }));
    await waitFor(() => {
      expect(activeGetSnapshot).toHaveBeenCalledTimes(3);
      expect(roundGetSnapshot).toHaveBeenCalledTimes(3);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(activeGetSnapshot).toHaveBeenCalledTimes(3);
    expect(roundGetSnapshot).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your hand')).toHaveClass('gameplay-hand--disabled');
  });

  it('reports an invalid round refresh without exposing its error details', async () => {
    const initial = activeSnapshot();
    const appServices = services(
      initial,
      {
        getSnapshot: vi.fn()
          .mockResolvedValueOnce({ valid: true, errors: [], value: initial })
          .mockResolvedValueOnce({ valid: true, errors: [], value: initial }),
      },
      {
        getSnapshot: vi.fn()
          .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() })
          .mockResolvedValueOnce({ valid: false, errors: ['sensitive round refresh detail'] }),
      },
    );

    renderActive(appServices, 'member-user');

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Could not synchronize the round. Refresh and try again.');
    expect(error).not.toHaveTextContent('sensitive round refresh detail');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('reports a thrown joint refresh failure without exposing the thrown detail', async () => {
    const initial = activeSnapshot();
    const appServices = services(
      initial,
      {
        getSnapshot: vi.fn()
          .mockResolvedValueOnce({ valid: true, errors: [], value: initial })
          .mockRejectedValueOnce(new Error('sensitive thrown refresh detail')),
      },
      {
        getSnapshot: vi.fn()
          .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() })
          .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() }),
      },
    );

    renderActive(appServices, 'member-user');

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Could not synchronize the round. Refresh and try again.');
    expect(error).not.toHaveTextContent('sensitive thrown refresh detail');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('ticks the active-control deadline locally without advancing gameplay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T08:00:00.000Z'));
    const timed = activeSnapshot({
      turn: {
        ...activeSnapshot().turn!,
        deadlineAt: '2026-07-26T08:00:05.000Z',
      },
    });

    try {
      const view = renderActive(services(timed), 'host-user');
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByLabelText('Turn countdown')).toHaveTextContent('5 seconds');
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByLabelText('Turn countdown')).toHaveTextContent('4 seconds');
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows neutral synchronization when active Realtime arrives before its round projection', async () => {
    let publishSnapshot: ((value: OnlineActiveGameControlSnapshot) => void) | undefined;
    let resolveRefresh: ((value: {
      valid: boolean;
      errors: readonly string[];
      value: OnlineActiveGameControlSnapshot;
    }) => void) | undefined;
    const initial = activeSnapshot();
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: initial })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }));
    const appServices = {
      ...services(initial, { getSnapshot }),
      activeGameRealtime: {
        connect: vi.fn(async (
          _tableId: string,
          onSnapshot: (value: OnlineActiveGameControlSnapshot) => void,
        ) => {
          publishSnapshot = onSnapshot;
        }),
        disconnect: vi.fn(async () => undefined),
        refresh: vi.fn(async () => undefined),
        runMutation: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      },
    } as unknown as AppServices;

    const view = renderActive(appServices, 'host-user');
    await waitFor(() => expect(publishSnapshot).toBeTypeOf('function'));
    act(() => {
      publishSnapshot?.(activeSnapshot({
        version: 8,
        turn: {
          ...activeSnapshot().turn!,
          turnId: 'round-1:card:2:1',
          seat: 1,
        },
      }));
    });

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Synchronizing round state');
    expect(screen.getByLabelText('Your hand')).toHaveClass('gameplay-hand--disabled');

    resolveRefresh?.({ valid: true, errors: [], value: initial });
    view.unmount();
  });

  it('lets the active host pause and then resume from the returned authoritative snapshots', async () => {
    const user = userEvent.setup();
    const paused = activeSnapshot({
      lifecycle: 'paused',
      version: 8,
      pausedAt: '2026-07-26T08:05:00.000Z',
    });
    const resumed = activeSnapshot({ version: 9 });
    const pause = vi.fn(async () => ({ valid: true, errors: [], value: paused }));
    const resume = vi.fn(async () => ({ valid: true, errors: [], value: resumed }));
    renderActive(services(activeSnapshot(), { pause, resume }), 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Pause game' }));
    expect(pause).toHaveBeenCalledWith('table-1', 7, expect.any(String), expect.any(String));
    expect(screen.getByRole('status')).toHaveTextContent('Game paused');

    await user.click(screen.getByRole('button', { name: 'Resume game' }));
    expect(resume).toHaveBeenCalledWith('table-1', 8, expect.any(String), expect.any(String));
    expect(screen.getByRole('button', { name: 'Pause game' })).toBeVisible();
  });

  it('requires explicit confirmation before the host terminates the game', async () => {
    const user = userEvent.setup();
    const terminated = activeSnapshot({
      lifecycle: 'terminated',
      version: 8,
      turn: undefined,
      terminatedAt: '2026-07-26T08:06:00.000Z',
      terminatedBy: 'host-user',
    });
    const terminate = vi.fn(async () => ({ valid: true, errors: [], value: terminated }));
    renderActive(services(activeSnapshot(), { terminate }), 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Close table' }));
    const dialog = screen.getByRole('dialog', { name: 'Close active table' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm close table' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByLabelText('I understand this ends the game'));
    await user.click(confirm);

    expect(terminate).toHaveBeenCalledWith(
      'table-1', 7, true, expect.any(String), expect.any(String),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Game terminated');
  });

  it('starts the next round only from one deliberate host click with current public versions', async () => {
    const user = userEvent.setup();
    const startNextRound = vi.fn<StartNextRoundMock>(async () => ({
      valid: true,
      errors: [],
      value: auctionRoundSnapshot(),
    }));
    const roundGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredRoundSnapshot() })
      .mockResolvedValueOnce({ valid: true, errors: [], value: auctionRoundSnapshot() });
    const appServices = services(
      scoredControlSnapshot(),
      {},
      {
        getSnapshot: roundGetSnapshot,
        startNextRound,
      },
    );

    renderActive(appServices, 'host-user');

    expect(await screen.findByRole('button', { name: 'Start Next Round' })).toBeVisible();
    expect(screen.getByLabelText('Final trick cards')).toHaveTextContent('Seat 3');
    expect(screen.getByLabelText('Final trick cards')).toHaveTextContent('Winner');
    expect(screen.getByRole('heading', { name: 'Round 1 results' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start Next Round' }));

    expect(startNextRound).toHaveBeenCalledTimes(1);
    expect(startNextRound).toHaveBeenCalledWith(
      'table-1',
      1,
      19,
      42,
      expect.stringMatching(/^start-next-round:/),
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Synchronizing round state');
  });

  it('keeps the production next-round service validator receiver when the host starts a round', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(async () => ({
      data: { valid: false, errors: ['NEXT_ROUND_STALE'] },
      error: null,
    }));
    const productionRoundService = new OnlineGameplayRoundService({ functions: { invoke } } as GameplayRoundFunctionClient);
    vi.spyOn(productionRoundService, 'getSnapshot').mockResolvedValue({
      valid: true,
      errors: [],
      value: scoredRoundSnapshot(),
    });
    const appServices: AppServices = {
      ...services(scoredControlSnapshot()),
      gameplayRound: productionRoundService,
    };
    renderActive(appServices, 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Start Next Round' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('gameplay-round-command', expect.objectContaining({
      body: expect.objectContaining({ action: 'start-next-round' }),
    })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Next round state changed. Refresh and try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('validateNextRoundCommand');
  });

  it('retains one pending next-round command ID and ignores duplicate clicks', async () => {
    const user = userEvent.setup();
    let resolveStart: ((value: { valid: boolean; errors: readonly string[]; value: OnlineGameplayRoundSnapshot }) => void) | undefined;
    const startNextRound = vi.fn<StartNextRoundMock>(() => new Promise((resolve) => {
      resolveStart = resolve;
    }));
    const appServices = services(
      scoredControlSnapshot(),
      {},
      {
        getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: scoredRoundSnapshot() })),
        startNextRound,
      },
    );

    renderActive(appServices, 'host-user');

    const start = await screen.findByRole('button', { name: 'Start Next Round' });
    await user.click(start);
    await user.click(start);

    expect(startNextRound).toHaveBeenCalledTimes(1);
    const firstCommandId = startNextRound.mock.calls[0]?.[4];
    expect(firstCommandId).toEqual(expect.stringMatching(/^start-next-round:/));
    resolveStart?.({ valid: true, errors: [], value: auctionRoundSnapshot() });
  });

  it('does not automatically start from render, countdown, Realtime, or scored reconnect', async () => {
    const startNextRound = vi.fn<StartNextRoundMock>(async () => ({
      valid: true,
      errors: [],
      value: auctionRoundSnapshot(),
    }));
    renderActive(services(
      scoredControlSnapshot(),
      {},
      {
        getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: scoredRoundSnapshot() })),
        startNextRound,
      },
    ), 'host-user');

    expect(await screen.findByRole('button', { name: 'Start Next Round' })).toBeVisible();
    await act(async () => {
      await Promise.resolve();
    });
    expect(startNextRound).not.toHaveBeenCalled();
  });

  it('refreshes both authoritative sources after a stale next-round rejection without actionable UI', async () => {
    const user = userEvent.setup();
    const controlGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredControlSnapshot() })
      .mockResolvedValue({ valid: true, errors: [], value: scoredControlSnapshot() });
    const roundGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredRoundSnapshot() })
      .mockResolvedValue({ valid: true, errors: [], value: scoredRoundSnapshot() });
    const startNextRound = vi.fn<StartNextRoundMock>(async () => ({
      valid: false,
      errors: ['Next round state changed. Refresh and try again.'],
      failureKind: 'definitive-rejection',
    }));
    const appServices = services(
      scoredControlSnapshot(),
      { getSnapshot: controlGetSnapshot },
      { getSnapshot: roundGetSnapshot, startNextRound },
    );

    renderActive(appServices, 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Start Next Round' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Next round state changed. Refresh and try again.');
    expect(controlGetSnapshot).toHaveBeenCalledTimes(2);
    expect(roundGetSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const firstCommandId = startNextRound.mock.calls[0]?.[4];

    await user.click(screen.getByRole('button', { name: 'Start Next Round' }));

    expect(startNextRound).toHaveBeenCalledTimes(2);
    expect(startNextRound.mock.calls[1]?.[4]).not.toBe(firstCommandId);
    expect(startNextRound.mock.calls[1]?.[4]).toEqual(expect.stringMatching(/^start-next-round:/));
  });

  it('retains the same next-round command ID after an ambiguous invoke failure', async () => {
    const user = userEvent.setup();
    const controlGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredControlSnapshot() })
      .mockResolvedValue({ valid: true, errors: [], value: scoredControlSnapshot() });
    const roundGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredRoundSnapshot() })
      .mockResolvedValue({ valid: true, errors: [], value: scoredRoundSnapshot() });
    const startNextRound = vi.fn<StartNextRoundMock>(async () => ({
      valid: false,
      errors: ['Next round could not be started. Refresh and try again.'],
      failureKind: 'ambiguous',
    }));
    const appServices = services(
      scoredControlSnapshot(),
      { getSnapshot: controlGetSnapshot },
      { getSnapshot: roundGetSnapshot, startNextRound },
    );

    renderActive(appServices, 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Start Next Round' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Next round could not be started. Refresh and try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('rpc');
    const firstCommandId = startNextRound.mock.calls[0]?.[4];

    await user.click(screen.getByRole('button', { name: 'Start Next Round' }));

    expect(startNextRound).toHaveBeenCalledTimes(2);
    expect(startNextRound.mock.calls[1]?.[4]).toBe(firstCommandId);
  });

  it('waits for matching active-control Realtime before enabling the authoritative first bidder bot', async () => {
    const user = userEvent.setup();
    let publishControl: ((value: OnlineActiveGameControlSnapshot) => void) | undefined;
    const processBotDirective = vi.fn(async () => ({
      valid: true,
      errors: [],
      terminal: true,
      value: auctionRoundSnapshot({ version: 2, nextBidSeat: 2, auctionActiveSeat: 2 }),
    }));
    const controlGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredControlSnapshot() })
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredControlSnapshot() });
    const roundGetSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: scoredRoundSnapshot() })
      .mockResolvedValueOnce({ valid: true, errors: [], value: auctionRoundSnapshot() });
    const appServices = {
      ...services(
        scoredControlSnapshot(),
        { getSnapshot: controlGetSnapshot },
        {
          getSnapshot: roundGetSnapshot,
          startNextRound: vi.fn<StartNextRoundMock>(async () => ({
            valid: true,
            errors: [],
            value: auctionRoundSnapshot(),
          })),
          processBotDirective,
        },
      ),
      activeGameRealtime: {
        connect: vi.fn(async (
          _tableId: string,
          onSnapshot: (value: OnlineActiveGameControlSnapshot) => void,
        ) => {
          publishControl = onSnapshot;
        }),
        disconnect: vi.fn(async () => undefined),
        refresh: vi.fn(async () => undefined),
        runMutation: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      },
    } as unknown as AppServices;

    renderActive(appServices, 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Start Next Round' }));
    expect(screen.getByRole('status')).toHaveTextContent('Synchronizing round state');
    expect(screen.queryByText('Standard bot in Seat 2 is acting')).not.toBeInTheDocument();

    act(() => {
      publishControl?.(auctionControlSnapshot({
        turn: {
          ...auctionControlSnapshot().turn!,
          status: 'assistant-pending',
        },
      }));
    });

    expect(await screen.findByText('Standard bot in Seat 2 is acting')).toBeVisible();
    await waitFor(() => expect(processBotDirective).toHaveBeenCalledWith(
      'table-1',
      'bot-action:table-1:round-2:bid:1:1:1',
    ));
  });

  it('restores host and non-host scored reconnect states without starting automatically', async () => {
    const hostStart = vi.fn();
    const hostServices = services(
      scoredControlSnapshot(),
      {},
      {
        getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: scoredRoundSnapshot() })),
        startNextRound: hostStart,
      },
    );
    const hostView = renderActive(hostServices, 'host-user');

    expect(await screen.findByRole('button', { name: 'Start Next Round' })).toBeVisible();
    expect(hostStart).not.toHaveBeenCalled();
    hostView.unmount();

    renderActive(services(
      scoredControlSnapshot(),
      {},
      { getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: scoredRoundSnapshot({ viewerSeat: 3 }) })) },
    ), 'member-user');

    expect(await screen.findByText('Waiting for host to start the next round')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start Next Round' })).not.toBeInTheDocument();
  });

  it('applies authoritative Realtime snapshots and unsubscribes on unmount', async () => {
    let publishSnapshot: ((value: OnlineActiveGameControlSnapshot) => void) | undefined;
    const connect = vi.fn(async (
      tableId: string,
      onSnapshot: (value: OnlineActiveGameControlSnapshot) => void,
    ) => {
      expect(tableId).toBe('table-1');
      publishSnapshot = onSnapshot;
    });
    const disconnect = vi.fn(async () => undefined);
    const appServices = {
      ...services(activeSnapshot()),
      activeGameRealtime: {
        connect,
        disconnect,
        refresh: vi.fn(async () => undefined),
        runMutation: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      },
    } as unknown as AppServices;

    const view = renderActive(appServices, 'host-user');
    expect(await screen.findByRole('button', { name: 'Pause game' })).toBeVisible();
    expect(connect).toHaveBeenCalledTimes(1);

    await act(async () => {
      publishSnapshot?.(activeSnapshot({
        lifecycle: 'paused',
        version: 8,
        pausedAt: '2026-07-26T08:05:00.000Z',
      }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Game paused');

    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
