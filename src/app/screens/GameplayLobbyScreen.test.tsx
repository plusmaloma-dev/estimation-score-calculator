import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineGameplayTableSnapshot } from '../../online/gameplay/types.js';
import { AppProvider, useApp, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayLobbyScreen } from './GameplayLobbyScreen.js';

const table: OnlineGameplayTableSnapshot = {
  tableId: 'table-1',
  workspaceId: 'workspace-1',
  name: 'Friday Majlis',
  visibility: 'public',
  joinPolicy: 'approval-required',
  lifecycle: 'lobby',
  hostUserId: 'host-user',
  turnTimerSeconds: 45,
  disconnectGraceSeconds: 60,
  occupiedSeatCount: 2,
  version: 3,
  settingsLocked: false,
  createdAt: '2026-07-26T08:00:00.000Z',
  seats: [
    {
      seat: 0,
      kind: 'human',
      userId: 'host-user',
      displayName: 'Host',
      joinedAt: '2026-07-26T08:00:00.000Z',
    },
    {
      seat: 2,
      kind: 'human',
      userId: 'guest-user',
      displayName: 'Guest',
      joinedAt: '2026-07-26T08:01:00.000Z',
    },
  ],
  joinRequests: [],
};

function createServices(overrides: Partial<AppServices['gameplayTables']> = {}): AppServices {
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
    gameplayTables: {
      listLobby: vi.fn(async () => ({ valid: true, errors: [], value: [table] })),
      createTable: vi.fn(async () => ({ valid: true, errors: [], value: table })),
      openTable: vi.fn(),
      updateSettings: vi.fn(),
      joinTable: vi.fn(),
      requestJoin: vi.fn(),
      respondJoinRequest: vi.fn(),
      leaveTable: vi.fn(),
      startTable: vi.fn(),
      ...overrides,
    },
  };
}

function RouteProbe() {
  const { route, activeGameplayTableId } = useApp();
  return <output aria-label="route-probe">{route}:{activeGameplayTableId ?? 'none'}</output>;
}

function renderLobby(services: AppServices) {
  return render(
    <I18nProvider>
      <AppProvider services={services} initialRoute="gameplay-lobby">
        <GameplayLobbyScreen />
        <RouteProbe />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('GameplayLobbyScreen', () => {
  it('shows public lobby metadata and opens an existing table', async () => {
    const user = userEvent.setup();
    renderLobby(createServices());

    const heading = await screen.findByText('Friday Majlis');
    const card = heading.closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('2 of 4 seats')).toBeVisible();
    expect(within(card!).getByText('Host approval')).toBeVisible();
    expect(within(card!).getByText('45s turn timer')).toBeVisible();

    await user.click(within(card!).getByRole('button', { name: 'Open table' }));
    expect(screen.getByLabelText('route-probe')).toHaveTextContent('gameplay-table:table-1');
  });

  it('creates a private open-join table with approved default timers and opens it', async () => {
    const user = userEvent.setup();
    const createTable = vi.fn(async () => ({ valid: true, errors: [], value: table }));
    const services = createServices({ createTable });
    renderLobby(services);

    await user.type(screen.getByLabelText('Table name'), 'Family Friday');
    await user.selectOptions(screen.getByLabelText('Visibility'), 'private');
    await user.selectOptions(screen.getByLabelText('Join policy'), 'open');
    await user.click(screen.getByRole('button', { name: 'Create table' }));

    expect(createTable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Family Friday',
      visibility: 'private',
      joinPolicy: 'open',
      turnTimerSeconds: 45,
      disconnectGraceSeconds: 60,
    }));
    expect(screen.getByLabelText('route-probe')).toHaveTextContent('gameplay-table:table-1');
  });

  it('refreshes the lobby and renders service failures as an alert', async () => {
    const user = userEvent.setup();
    const listLobby = vi.fn()
      .mockResolvedValueOnce({ valid: true, errors: [], value: [table] })
      .mockResolvedValueOnce({ valid: false, errors: ['Lobby temporarily unavailable.'] });
    renderLobby(createServices({ listLobby }));

    expect(await screen.findByText('Friday Majlis')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refresh tables' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Lobby temporarily unavailable.');
    expect(listLobby).toHaveBeenCalledTimes(2);
  });
});
