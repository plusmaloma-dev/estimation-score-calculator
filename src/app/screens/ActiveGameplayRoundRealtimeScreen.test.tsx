import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

function controlSnapshot(): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'human-0',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 5,
    turn: {
      turnId: 'round-1:card:8:0',
      seat: 0,
      actionKind: 'card',
      startedAt: '2026-07-26T14:20:00.000Z',
      remainingMs: 30_000,
      status: 'running',
    },
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'human-0',
        joinedAt: '2026-07-26T14:00:00.000Z',
        connectedAt: '2026-07-26T14:00:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'human',
        humanUserId: 'human-1',
        joinedAt: '2026-07-26T14:01:00.000Z',
        connectedAt: '2026-07-26T14:01:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:2',
        joinedAt: '2026-07-26T14:02:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 3,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:3',
        joinedAt: '2026-07-26T14:02:00.000Z',
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
    phase: 'playing',
    version: 8,
    viewerSeat: 0,
    bidOwnerSeat: 2,
    riskSeat: 1,
    currentTurnSeat: 0,
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 2, actualTricks: 0 },
      { seat: 1, playerId: 'human-1', cardCount: 2, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 2, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 2, actualTricks: 0 },
    ],
    ownHand: [
      { suit: 'hearts', rank: 'A' },
      { suit: 'clubs', rank: '2' },
    ],
    legalNormalEstimates: [],
    legalCards: [{ suit: 'hearts', rank: 'A' }],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

function services(input: {
  readonly roundRealtime: NonNullable<AppServices['gameplayRoundRealtime']>;
  readonly playCard?: ReturnType<typeof vi.fn>;
  readonly getSnapshot?: ReturnType<typeof vi.fn>;
}): AppServices {
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
      pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(),
      disconnect: vi.fn(), reconnect: vi.fn(), evaluateGrace: vi.fn(),
      evaluateDeadlines: vi.fn(), startTurn: vi.fn(), beginBotAction: vi.fn(),
      completeActionBoundary: vi.fn(),
    },
    gameplayRound: {
      getSnapshot: input.getSnapshot ?? vi.fn(async () => ({
        valid: true,
        errors: [],
        value: roundSnapshot(),
      })),
      submitBid: vi.fn(),
      playCard: input.playCard ?? vi.fn(),
    },
    gameplayRoundRealtime: input.roundRealtime,
  };
}

function renderActive(appServices: AppServices) {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="active-game">
        <ActiveGameplayScreen tableId="table-1" currentUserId="human-0" />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('ActiveGameplayScreen round Realtime', () => {
  it('subscribes once, applies remote authoritative snapshots, and disconnects on unmount', async () => {
    let publish: ((snapshot: OnlineGameplayRoundSnapshot) => void) | undefined;
    const connect = vi.fn(async (
      _tableId: string,
      onSnapshot: (snapshot: OnlineGameplayRoundSnapshot) => void,
    ) => {
      publish = onSnapshot;
    });
    const disconnect = vi.fn(async () => undefined);
    const realtime: NonNullable<AppServices['gameplayRoundRealtime']> = {
      connect,
      disconnect,
      refresh: vi.fn(),
      runMutation: vi.fn(),
    };
    let resolveRefresh: ((value: { valid: boolean; errors: readonly string[]; value: OnlineGameplayRoundSnapshot }) => void) | undefined;
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }));
    const view = renderActive(services({ roundRealtime: realtime, getSnapshot }));

    expect(await screen.findByRole('button', { name: 'Ace of hearts' })).toBeVisible();
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(connect).toHaveBeenCalledWith('table-1', expect.any(Function), expect.any(Function));

    act(() => {
      publish?.(roundSnapshot({
        version: 9,
        currentTurnSeat: 1,
        players: [
          { seat: 0, playerId: 'human-0', cardCount: 1, actualTricks: 0 },
          { seat: 1, playerId: 'human-1', cardCount: 2, actualTricks: 0 },
          { seat: 2, playerId: 'bot-2', cardCount: 2, actualTricks: 0 },
          { seat: 3, playerId: 'bot-3', cardCount: 2, actualTricks: 0 },
        ],
        ownHand: [{ suit: 'clubs', rank: '2' }],
        legalCards: [],
        currentTrick: [{ seat: 0, card: { suit: 'hearts', rank: 'A' } }],
      }));
    });

    expect(screen.queryByRole('button', { name: 'Ace of hearts' })).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Synchronizing round state');

    resolveRefresh?.({ valid: true, errors: [], value: roundSnapshot() });

    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('routes local card commands through the round mutation lock', async () => {
    const user = userEvent.setup();
    const afterPlay = roundSnapshot({
      version: 9,
      currentTurnSeat: 1,
      players: [
        { seat: 0, playerId: 'human-0', cardCount: 1, actualTricks: 0 },
        { seat: 1, playerId: 'human-1', cardCount: 2, actualTricks: 0 },
        { seat: 2, playerId: 'bot-2', cardCount: 2, actualTricks: 0 },
        { seat: 3, playerId: 'bot-3', cardCount: 2, actualTricks: 0 },
      ],
      ownHand: [{ suit: 'clubs', rank: '2' }],
      legalCards: [],
      currentTrick: [{ seat: 0, card: { suit: 'hearts', rank: 'A' } }],
    });
    const playCard = vi.fn(async () => ({ valid: true, errors: [], value: afterPlay }));
    const runMutation: NonNullable<AppServices['gameplayRoundRealtime']>['runMutation'] = vi.fn(
      async (operation) => operation(),
    );
    const realtime: NonNullable<AppServices['gameplayRoundRealtime']> = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      refresh: vi.fn(),
      runMutation,
    };
    renderActive(services({ roundRealtime: realtime, playCard }));

    await user.click(await screen.findByRole('button', { name: 'Ace of hearts' }));

    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(playCard).toHaveBeenCalledTimes(1);
  });
});
