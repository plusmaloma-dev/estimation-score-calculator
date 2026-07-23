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
});
