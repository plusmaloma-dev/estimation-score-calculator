import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

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

function services(
  initial: OnlineActiveGameControlSnapshot,
  overrides: Partial<NonNullable<AppServices['activeGameControl']>> = {},
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
    expect(screen.queryByLabelText('Your hand')).not.toBeInTheDocument();

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
