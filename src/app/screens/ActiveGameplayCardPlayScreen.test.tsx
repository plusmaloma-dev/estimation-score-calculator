import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

function controlSnapshot(
  overrides: Partial<OnlineActiveGameControlSnapshot> = {},
): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 4,
    turn: {
      turnId: 'round-1:card:8:0',
      seat: 0,
      actionKind: 'card',
      startedAt: '2026-07-26T12:00:00.000Z',
      remainingMs: 30_000,
      status: 'running',
    },
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'host-user',
        joinedAt: '2026-07-26T11:50:00.000Z',
        connectedAt: '2026-07-26T11:50:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:1',
        joinedAt: '2026-07-26T11:55:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:2',
        joinedAt: '2026-07-26T11:55:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 3,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:3',
        joinedAt: '2026-07-26T11:55:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
    ],
    events: [],
    directives: [],
    ...overrides,
  };
}

function controlForRound(round: OnlineGameplayRoundSnapshot): OnlineActiveGameControlSnapshot {
  const seat = round.currentTurnSeat ?? 0;
  return controlSnapshot({
    turn: {
      turnId: `round-${round.roundNumber}:card:${round.version}:${seat}`,
      seat,
      actionKind: 'card',
      startedAt: '2026-07-26T12:00:00.000Z',
      remainingMs: 30_000,
      status: 'running',
    },
  });
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
      { seat: 0, playerId: 'host-user', cardCount: 2, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 2, actualTricks: 0 },
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

function services(
  initialRound: OnlineGameplayRoundSnapshot,
  roundOverrides: Partial<NonNullable<AppServices['gameplayRound']>> = {},
  controlSnapshots: readonly OnlineActiveGameControlSnapshot[] = [controlForRound(initialRound)],
  roundSnapshots: readonly OnlineGameplayRoundSnapshot[] = [initialRound],
): AppServices {
  let controlSnapshotIndex = 0;
  let roundSnapshotIndex = 0;
  return {
    shell: {
      getSessionHistory: () => ({ sessions: [] }),
      createScoreSheet: vi.fn(),
      openSession: vi.fn(),
      saveRound: vi.fn(),
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
      pause: vi.fn(),
      resume: vi.fn(),
      terminate: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(),
      evaluateGrace: vi.fn(),
      evaluateDeadlines: vi.fn(),
      startTurn: vi.fn(),
      beginBotAction: vi.fn(),
      completeActionBoundary: vi.fn(),
    },
    gameplayRound: {
      getSnapshot: vi.fn(async () => ({
        valid: true,
        errors: [],
        value: roundSnapshots[Math.min(roundSnapshotIndex++, roundSnapshots.length - 1)],
      })),
      submitBid: vi.fn(),
      playCard: vi.fn(),
      ...roundOverrides,
    },
  };
}

function renderActive(appServices: AppServices) {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="active-game">
        <ActiveGameplayScreen tableId="table-1" currentUserId="host-user" />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('ActiveGameplayScreen card play', () => {
  it('submits a legal card with the authoritative round version then waits for matching active control', async () => {
    const user = userEvent.setup();
    const afterPlay = roundSnapshot({
      version: 9,
      currentTurnSeat: 1,
      players: [
        { seat: 0, playerId: 'host-user', cardCount: 1, actualTricks: 0 },
        { seat: 1, playerId: 'bot-1', cardCount: 2, actualTricks: 0 },
        { seat: 2, playerId: 'bot-2', cardCount: 2, actualTricks: 0 },
        { seat: 3, playerId: 'bot-3', cardCount: 2, actualTricks: 0 },
      ],
      ownHand: [{ suit: 'clubs', rank: '2' }],
      legalCards: [],
      currentTrick: [{ seat: 0, card: { suit: 'hearts', rank: 'A' } }],
    });
    const playCard = vi.fn(async () => ({ valid: true, errors: [], value: afterPlay }));
    const initial = roundSnapshot();
    renderActive(services(
      initial,
      { playCard },
      [controlForRound(initial), controlForRound(afterPlay)],
      [initial, afterPlay],
    ));

    await user.click(await screen.findByRole('button', { name: 'Ace of hearts' }));

    expect(playCard).toHaveBeenCalledWith(
      'table-1',
      8,
      expect.stringMatching(/^play-card:/),
      { suit: 'hearts', rank: 'A' },
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Standard bot in Seat 2 is acting');
    });
    expect(screen.queryByRole('button', { name: 'Ace of hearts' })).not.toBeInTheDocument();
  });

  it('reloads both projections after a rejected card command without rendering a contradictory turn', async () => {
    const user = userEvent.setup();
    const reloaded = roundSnapshot({
      version: 9,
      currentTurnSeat: 1,
      players: [
        { seat: 0, playerId: 'host-user', cardCount: 1, actualTricks: 0 },
        { seat: 1, playerId: 'bot-1', cardCount: 2, actualTricks: 0 },
        { seat: 2, playerId: 'bot-2', cardCount: 2, actualTricks: 0 },
        { seat: 3, playerId: 'bot-3', cardCount: 2, actualTricks: 0 },
      ],
      ownHand: [{ suit: 'clubs', rank: '2' }],
      legalCards: [],
      currentTrick: [{ seat: 0, card: { suit: 'hearts', rank: 'A' } }],
    });
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: roundSnapshot() })
      .mockResolvedValue({ valid: true, errors: [], value: reloaded });
    const playCard = vi.fn(async () => ({ valid: false, errors: ['Gameplay version is stale.'] }));
    const initial = roundSnapshot();
    const appServices = services(
      initial,
      { getSnapshot, playCard },
      [controlForRound(initial), controlForRound(reloaded)],
    );
    renderActive(appServices);

    await user.click(await screen.findByRole('button', { name: 'Ace of hearts' }));

    await waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('button', { name: 'Ace of hearts' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Standard bot in Seat 2 is acting');
  });
});
