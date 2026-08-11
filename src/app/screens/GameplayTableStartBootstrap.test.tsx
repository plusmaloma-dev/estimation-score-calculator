import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import type { OnlineGameplayTableSnapshot } from '../../online/gameplay/types.js';
import { AppProvider, type AppServices, useApp } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayTableScreen } from './GameplayTableScreen.js';

function tableSnapshot(): OnlineGameplayTableSnapshot {
  return {
    tableId: 'table-1',
    workspaceId: 'workspace-1',
    name: 'Bootstrap table',
    visibility: 'private',
    joinPolicy: 'open',
    lifecycle: 'lobby',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    occupiedSeatCount: 1,
    version: 3,
    settingsLocked: false,
    createdAt: '2026-07-26T14:00:00.000Z',
    seats: [{
      seat: 0,
      kind: 'human',
      userId: 'host-user',
      displayName: 'Host',
      joinedAt: '2026-07-26T14:00:00.000Z',
    }],
    joinRequests: [],
  };
}

function roundSnapshot(): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'auction',
    version: 0,
    viewerSeat: 0,
    dealCommitment: 'ab'.repeat(32),
    nextBidSeat: 2,
    auctionActiveSeat: 2,
    legalAuctionActions: [],
    players: [
      { seat: 0, playerId: 'host-user', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
  };
}

function services(input: {
  readonly startGame?: ReturnType<typeof vi.fn>;
  readonly startTable?: ReturnType<typeof vi.fn>;
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
    gameplayTables: {
      createTable: vi.fn(), listLobby: vi.fn(),
      openTable: vi.fn(async () => ({ valid: true, errors: [], value: tableSnapshot() })),
      updateSettings: vi.fn(), joinTable: vi.fn(), requestJoin: vi.fn(),
      respondJoinRequest: vi.fn(), leaveTable: vi.fn(),
      startTable: input.startTable ?? vi.fn(),
    },
    gameplayRound: {
      getSnapshot: vi.fn(), submitBid: vi.fn(), playCard: vi.fn(),
      startGame: input.startGame,
    },
  } as unknown as AppServices;
}

function RouteProbe() {
  const { route, activeGameplayTableId } = useApp();
  return <output aria-label="Current route">{route}:{activeGameplayTableId ?? ''}</output>;
}

function renderTable(appServices: AppServices) {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="gameplay-table">
        <GameplayTableScreen
          tableId="table-1"
          currentUserId="host-user"
          currentDisplayName="Host"
        />
        <RouteProbe />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('GameplayTableScreen secure Start bootstrap', () => {
  it('prefers the secure session bootstrap and navigates only after a valid initial round', async () => {
    const user = userEvent.setup();
    const startGame = vi.fn(async () => ({
      valid: true,
      errors: [],
      value: roundSnapshot(),
    }));
    const startTable = vi.fn();
    renderTable(services({ startGame, startTable }));

    await user.click(await screen.findByRole('button', { name: 'Start game' }));

    expect(startGame).toHaveBeenCalledWith(
      'table-1',
      3,
      expect.stringMatching(/^start-game:/),
    );
    expect(startTable).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('active-game:table-1');
  });

  it('keeps the host in the waiting room and shows the authoritative bootstrap error', async () => {
    const user = userEvent.setup();
    const startGame = vi.fn(async () => ({
      valid: false,
      errors: ['Secure deal could not be initialized.'],
    }));
    renderTable(services({ startGame }));

    await user.click(await screen.findByRole('button', { name: 'Start game' }));

    expect(await screen.findByText('Secure deal could not be initialized.')).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('gameplay-table:');
  });
});
