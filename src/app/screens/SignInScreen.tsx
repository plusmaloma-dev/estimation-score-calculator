import { useState, type FormEvent } from 'react';
import type { AuthSessionState } from '../../online/auth/types.js';
import type { AuthPort } from '../AppContext.js';

export function SignInScreen({
  auth,
  onAuthenticated,
  initialErrors = [],
}: {
  readonly auth: Pick<AuthPort, 'signIn'>;
  readonly onAuthenticated: (session: AuthSessionState) => void;
  readonly initialErrors?: readonly string[];
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<readonly string[]>(initialErrors);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await auth.signIn(email.trim(), password);
    setSubmitting(false);
    if (!result.valid || result.value === undefined) {
      setErrors(result.errors.length > 0 ? result.errors : ['Sign-in failed.']);
      return;
    }
    setErrors([]);
    onAuthenticated(result.value);
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <div className="auth-brand" aria-hidden="true">♠</div>
        <h1 id="sign-in-heading">Sign in</h1>
        <p>Use the email address from your Estimation UAT invitation.</p>
        {errors.length > 0 && (
          <div className="error-summary" role="alert">{errors.join('; ')}</div>
        )}
        <form className="setup-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
