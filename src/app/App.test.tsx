import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../online/auth/types.js';
import type { AppServices } from './AppContext.js';
import { App } from './App.js';

const session: AuthSessionState = {
  user: { id: 'user-1', email: 'tester@example.com' },
  membership: { workspaceId: 'workspace-1', workspaceSlug: 'estimation-uat', role: 'tester' },
};

function createServices(auth?: AppServices['auth']): AppServices {
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
    ...(auth === undefined ? {} : { auth }),
  };
}

describe('App', () => {
  it('renders the local Estimation application without an online auth service', () => {
    render(<App services={createServices()} />);
    expect(screen.getByRole('heading', { name: 'Estimation' })).toBeInTheDocument();
  });

  it('blocks online application data until the user signs in and supports sign-out', async () => {
    const user = userEvent.setup();
    const getSession = vi.fn(async () => ({ valid: true, errors: [], value: undefined }));
    const signIn = vi.fn(async () => ({ valid: true, errors: [], value: session }));
    const signOut = vi.fn(async () => ({ valid: true, errors: [], value: undefined }));

    render(<App services={createServices({ getSession, signIn, signOut })} />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Recent games' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'tester@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('tester@example.com')).toBeVisible();
    expect(screen.getByText('Tester')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Recent games' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  it('switches to Supabase-backed services after the authenticated session is resolved', async () => {
    const base = createServices({
      getSession: vi.fn(async () => ({ valid: true, errors: [], value: session })),
      signIn: vi.fn(),
      signOut: vi.fn(async () => ({ valid: true, errors: [], value: undefined })),
    });
    const onlineServices: Pick<AppServices, 'shell' | 'playerDirectory'> = {
      shell: {
        getSessionHistory: async () => ({
          sessions: [{
            id: 'online-game-1', name: 'Online UAT Game', status: 'draft', players: [], roundCount: 0,
            createdAtIso: '2026-07-23T10:00:00.000Z', createdAtLabel: 'Created 23 Jul 2026, 1:00 PM',
            updatedAtIso: '2026-07-23T10:00:00.000Z', updatedAtLabel: '23 Jul 2026',
          }],
        }),
        createScoreSheet: vi.fn(), openSession: vi.fn(), saveRound: vi.fn(),
      },
      playerDirectory: {
        listActivePlayers: async () => [],
        createPlayer: async () => ({ valid: false, errors: ['not used'] }),
      },
    };
    const onlineSessionFactory = vi.fn(() => onlineServices);

    render(<App services={{ ...base, onlineSessionFactory }} />);

    expect(await screen.findByText('Online UAT Game')).toBeVisible();
    expect(onlineSessionFactory).toHaveBeenCalledWith(session);
  });
});
