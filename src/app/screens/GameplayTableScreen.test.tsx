import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineGameplayTableSnapshot } from '../../online/gameplay/types.js';
import { AppProvider, useApp, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayTableScreen } from './GameplayTableScreen.js';

function snapshot(overrides: Partial<OnlineGameplayTableSnapshot> = {}): OnlineGameplayTableSnapshot {
  return {
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
    version: 4,
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
        userId: 'member-user',
        displayName: 'Member',
        joinedAt: '2026-07-26T08:01:00.000Z',
      },
    ],
    joinRequests: [{
      requestId: 'request-1',
      userId: 'waiting-user',
      displayName: 'Waiting Player',
      requestedSeat: 1,
      requestedAt: '2026-07-26T08:02:00.000Z',
      status: 'pending',
    }],
    ...overrides,
  };
}

function services(
  initial: OnlineGameplayTableSnapshot,
  overrides: Partial<NonNullable<AppServices['gameplayTables']>> = {},
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
    gameplayTables: {
      listLobby: vi.fn(), createTable: vi.fn(),
      openTable: vi.fn(async () => ({ valid: true, errors: [], value: initial })),
      updateSettings: vi.fn(), joinTable: vi.fn(), requestJoin: vi.fn(),
      respondJoinRequest: vi.fn(), leaveTable: vi.fn(), startTable: vi.fn(),
      ...overrides,
    },
  };
}

function RouteProbe() {
  const { route, activeGameplayTableId } = useApp();
  return <output aria-label="route-probe">{route}:{activeGameplayTableId ?? 'none'}</output>;
}

function renderTable(appServices: AppServices, currentUserId: string) {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="gameplay-table">
        <GameplayTableScreen tableId="table-1" currentUserId={currentUserId} />
        <RouteProbe />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('GameplayTableScreen', () => {
  it('renders four seats and lets the host resolve requests before starting', async () => {
    const user = userEvent.setup();
    const afterReject = snapshot({ version: 5, joinRequests: [] });
    const started = snapshot({
      version: 6,
      lifecycle: 'active',
      settingsLocked: true,
      occupiedSeatCount: 4,
      joinRequests: [],
      seats: [
        ...afterReject.seats,
        {
          seat: 1,
          kind: 'bot',
          botId: 'standard-bot:table-1:1',
          displayName: 'Standard Bot 2',
          joinedAt: '2026-07-26T08:03:00.000Z',
        },
        {
          seat: 3,
          kind: 'bot',
          botId: 'standard-bot:table-1:3',
          displayName: 'Standard Bot 4',
          joinedAt: '2026-07-26T08:03:00.000Z',
        },
      ],
    });
    const respondJoinRequest = vi.fn(async () => ({
      valid: true, errors: [], value: afterReject,
    }));
    const startTable = vi.fn(async () => ({ valid: true, errors: [], value: started }));
    renderTable(services(snapshot(), { respondJoinRequest, startTable }), 'host-user');

    expect(await screen.findByRole('heading', { name: 'Friday Majlis' })).toBeVisible();
    const seats = screen.getByRole('list', { name: 'Friday Majlis seats' });
    expect(within(seats).getAllByRole('listitem')).toHaveLength(4);
    expect(within(seats).getByText(/Seat 2: Vacant/)).toBeVisible();
    expect(screen.getByText('Waiting Player')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Reject Waiting Player' }));
    expect(respondJoinRequest).toHaveBeenCalledWith(
      'table-1', 4, 'request-1', 'reject', expect.any(String),
    );
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(startTable).toHaveBeenCalledWith('table-1', 5, expect.any(String));
    expect(screen.getByLabelText('route-probe')).toHaveTextContent('active-game:table-1');
  });

  it('lets the host save timer and disconnect settings while the lobby is unlocked', async () => {
    const user = userEvent.setup();
    const updateSettings = vi.fn(async () => ({
      valid: true,
      errors: [],
      value: snapshot({ version: 5, turnTimerSeconds: 60, disconnectGraceSeconds: 90 }),
    }));
    renderTable(services(snapshot({ joinRequests: [] }), { updateSettings }), 'host-user');

    await screen.findByRole('heading', { name: 'Friday Majlis' });
    await user.selectOptions(screen.getByLabelText('Turn timer'), '60');
    await user.selectOptions(screen.getByLabelText('Disconnect grace'), '90');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(updateSettings).toHaveBeenCalledWith(
      'table-1',
      4,
      { turnTimerSeconds: 60, disconnectGraceSeconds: 90 },
      expect.any(String),
    );
  });

  it('lets a guest join an open table and request access to an approval table', async () => {
    const user = userEvent.setup();
    const openTable = snapshot({
      joinPolicy: 'open',
      occupiedSeatCount: 1,
      seats: [snapshot().seats[0]!],
      joinRequests: [],
    });
    const joined = snapshot({
      joinPolicy: 'open',
      version: 5,
      occupiedSeatCount: 2,
      joinRequests: [],
    });
    const joinTable = vi.fn(async () => ({ valid: true, errors: [], value: joined }));
    const appServices = services(openTable, { joinTable });
    const view = renderTable(appServices, 'guest-user');

    await screen.findByRole('heading', { name: 'Friday Majlis' });
    await user.type(screen.getByLabelText('Display name'), 'Rami');
    await user.selectOptions(screen.getByLabelText('Seat'), '2');
    await user.click(screen.getByRole('button', { name: 'Join table' }));
    expect(joinTable).toHaveBeenCalledWith(
      'table-1', 4, { displayName: 'Rami', requestedSeat: 2 }, expect.any(String),
    );

    view.unmount();

    const requestJoin = vi.fn(async () => ({
      valid: true,
      errors: [],
      value: snapshot({ joinRequests: [{
        requestId: 'new-request', userId: 'guest-user', displayName: 'Rami',
        requestedSeat: 1, requestedAt: '2026-07-26T08:04:00.000Z', status: 'pending',
      }] }),
    }));
    renderTable(services(snapshot({ occupiedSeatCount: 1, seats: [snapshot().seats[0]!] }), {
      requestJoin,
    }), 'guest-user');

    await screen.findByRole('heading', { name: 'Friday Majlis' });
    await user.type(screen.getByLabelText('Display name'), 'Rami');
    await user.selectOptions(screen.getByLabelText('Seat'), '1');
    await user.click(screen.getByRole('button', { name: 'Request to join' }));
    expect(requestJoin).toHaveBeenCalledWith(
      'table-1',
      4,
      { requestId: expect.any(String), displayName: 'Rami', requestedSeat: 1 },
      expect.any(String),
    );
  });
});
