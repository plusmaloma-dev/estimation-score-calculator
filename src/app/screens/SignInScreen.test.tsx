import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../../online/auth/types.js';
import { SignInScreen } from './SignInScreen.js';

const session: AuthSessionState = {
  user: { id: 'user-1', email: 'tester@example.com' },
  membership: { workspaceId: 'workspace-1', workspaceSlug: 'estimation-uat', role: 'tester' },
};

describe('SignInScreen', () => {
  it('submits email/password and reports a successful session', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(async () => ({ valid: true, errors: [], value: session }));
    const onAuthenticated = vi.fn();

    render(<SignInScreen auth={{ signIn }} onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Email'), ' tester@example.com ');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(signIn).toHaveBeenCalledWith('tester@example.com', 'secret');
    expect(onAuthenticated).toHaveBeenCalledWith(session);
  });

  it('shows authentication errors without leaving the sign-in screen', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(async () => ({ valid: false, errors: ['Invalid login credentials'] }));

    render(<SignInScreen auth={{ signIn }} onAuthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText('Email'), 'tester@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
