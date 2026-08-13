import { useState } from 'react';
import type { AuthSessionState } from '../../online/auth/types.js';

export function UserSessionMenu({
  session,
  onSignOut,
}: {
  readonly session: AuthSessionState;
  readonly onSignOut: () => Promise<void>;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const roleLabel = session.membership.role === 'admin' ? 'Admin' : 'Tester';

  return (
    <div className="user-session-menu">
      <div>
        <strong>{session.user.email}</strong>
        <span>{roleLabel}</span>
      </div>
      <button
        type="button"
        className="text-button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await onSignOut();
          setSigningOut(false);
        }}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
