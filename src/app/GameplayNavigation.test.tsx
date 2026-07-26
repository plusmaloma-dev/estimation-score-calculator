import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../online/auth/types.js';
import type { OnlineGameplayTableSnapshot } from '../online/gameplay/types.js';
import type { AppServices } from './AppContext.js';
import { App } from './App.js';

const session: AuthSessionState = {
  user: { id: 'user-1', email: 'tester@example.com' },
  membership: {
    workspaceId: 'workspace-1',
    workspaceSlug: 'estimation-uat',
    role: 'tester',
  },
};

const table: OnlineGameplayTableSnapshot = {
  tableId: 'table-1',
  workspaceId: 'workspace-1',
  name: 'Friday Majlis',
  visibility: 'public',
  joinPolicy: 'open',
  lifecycle: 'lobby',
  hostUserId: 'user-1',
  turnTimerSeconds: 45,
  disconnectGraceSeconds: 60,
  occupiedSeatCount: 1,
  version: 0,
  settingsLocked: false,
  createdAt: '2026-07-26T08:00:00.000Z',
  seats: [{
    seat: 0,
    kind: 'human',
    userId: 'user-1',
    displayName: 'Tester',
    joinedAt: '2026-07-26T08:00:00.000Z',
  }],
  joinRequests: [],
};

it('authenticated users can open the online gameplay lobby and a waiting table', async () => {
  const user = userEvent.setup();
  const gameplayTables = {
    listLobby: vi.fn(async () => ({ valid: true, errors: [], value: [table] })),
    createTable: vi.fn(),
    openTable: vi.fn(async () => ({ valid: true, errors: [], value: table })),
    updateSettings: vi.fn(),
    joinTable: vi.fn(),
    requestJoin: vi.fn(),
    respondJoinRequest: vi.fn(),
    leaveTable: vi.fn(),
    startTable: vi.fn(),
  };
  const services = {
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
    auth: {
      getSession: vi.fn(async () => ({ valid: true, errors: [], value: session })),
      signIn: vi.fn(),
      signOut: vi.fn(async () => ({ valid: true, errors: [] })),
    },
    onlineSessionFactory: vi.fn(() => ({
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
      gameplayTables,
    })),
  } as unknown as AppServices;

  render(<App services={services} />);

  await user.click(await screen.findByRole('button', { name: 'Play online' }));
  expect(await screen.findByRole('heading', { name: 'Online tables' })).toBeVisible();
  expect(await screen.findByText('Friday Majlis')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Open table' }));
  expect(await screen.findByRole('heading', { name: 'Friday Majlis' })).toBeVisible();
  expect(gameplayTables.openTable).toHaveBeenCalledWith('table-1');
});
