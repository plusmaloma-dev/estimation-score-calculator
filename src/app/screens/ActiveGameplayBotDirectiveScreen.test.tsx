import { render, screen, waitFor } from '@testing-library/react';
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
    hostUserId: 'human-0',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 7,
    turn: {
      turnId: 'round-1:card:4:1',
      seat: 1,
      actionKind: 'card',
      startedAt: '2026-07-26T14:00:00.000Z',
      deadlineAt: '2026-07-26T14:00:45.000Z',
      status: 'running',
    },
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'human-0',
        joinedAt: '2026-07-26T13:50:00.000Z',
        connectedAt: '2026-07-26T13:50:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:1',
        joinedAt: '2026-07-26T13:55:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:2',
        joinedAt: '2026-07-26T13:55:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 3,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:3',
        joinedAt: '2026-07-26T13:55:00.000Z',
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

function roundSnapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'playing',
    version: 4,
    viewerSeat: 0,
    bidOwnerSeat: 1,
    currentTurnSeat: 1,
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

function services(input: {
  readonly control: OnlineActiveGameControlSnapshot;
  readonly round?: OnlineGameplayRoundSnapshot;
  readonly evaluateDeadlines?: ReturnType<typeof vi.fn>;
  readonly processBotDirective?: ReturnType<typeof vi.fn>;
}): AppServices {
  const evaluateDeadlines = input.evaluateDeadlines ?? vi.fn();
  const processBotDirective = input.processBotDirective ?? vi.fn();
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
      getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: input.control })),
      pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(),
      disconnect: vi.fn(), reconnect: vi.fn(), evaluateGrace: vi.fn(),
      evaluateDeadlines,
      startTurn: vi.fn(), beginBotAction: vi.fn(), completeActionBoundary: vi.fn(),
    },
    gameplayRound: {
      getSnapshot: vi.fn(async () => ({
        valid: true,
        errors: [],
        value: input.round ?? roundSnapshot(),
      })),
      submitBid: vi.fn(),
      playCard: vi.fn(),
      processBotDirective,
    },
  } as unknown as AppServices;
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

describe('ActiveGameplayScreen bot orchestration', () => {
  it('evaluates a permanent-bot turn immediately and processes the returned directive once', async () => {
    const issued = {
      directiveId: 'bot-action:table-1:round-1:card:4:1:1',
      tableId: 'table-1',
      turnId: 'round-1:card:4:1',
      seat: 1 as const,
      actionKind: 'card' as const,
      source: 'permanent-bot' as const,
      issuedAt: '2026-07-26T14:00:00.000Z',
    };
    const pending = controlSnapshot({
      version: 8,
      turn: { ...controlSnapshot().turn!, status: 'assistant-pending' },
      directives: [issued],
    });
    const afterBot = roundSnapshot({
      version: 5,
      currentTurnSeat: 2,
      players: [
        { seat: 0, playerId: 'human-0', cardCount: 13, actualTricks: 0 },
        { seat: 1, playerId: 'bot-1', cardCount: 12, actualTricks: 0 },
        { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
        { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
      ],
      currentTrick: [{ seat: 1, card: { suit: 'hearts', rank: '2' } }],
    });
    const evaluateDeadlines = vi.fn(async () => ({ valid: true, errors: [], value: pending }));
    const processBotDirective = vi.fn(async () => ({
      valid: true,
      errors: [],
      terminal: true,
      value: afterBot,
    }));
    renderActive(services({ control: controlSnapshot(), evaluateDeadlines, processBotDirective }));

    await waitFor(() => expect(evaluateDeadlines).toHaveBeenCalledTimes(1));
    expect(evaluateDeadlines).toHaveBeenCalledWith(
      'table-1',
      7,
      expect.stringMatching(/^evaluate-deadline:/),
      expect.any(String),
    );
    await waitFor(() => expect(processBotDirective).toHaveBeenCalledWith(
      'table-1',
      issued.directiveId,
    ));
    expect(await screen.findByText('2♥')).toBeVisible();
  });

  it('recovers an assistant-pending directive from deterministic public turn state after reconnect', async () => {
    const pending = controlSnapshot({
      turn: { ...controlSnapshot().turn!, status: 'assistant-pending' },
      directives: [],
    });
    const processBotDirective = vi.fn(async () => ({
      valid: true,
      errors: [],
      terminal: true,
      value: roundSnapshot({ version: 5, currentTurnSeat: 2 }),
    }));
    renderActive(services({ control: pending, processBotDirective }));

    await waitFor(() => expect(processBotDirective).toHaveBeenCalledWith(
      'table-1',
      'bot-action:table-1:round-1:card:4:1:1',
    ));
    expect(processBotDirective).toHaveBeenCalledTimes(1);
  });
});
