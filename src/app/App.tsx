import { useEffect, useMemo, useState } from 'react';
import type { AuthSessionState } from '../online/auth/types.js';
import { AppProvider, useApp, type AppServices } from './AppContext.js';
import { UserSessionMenu } from './components/UserSessionMenu.js';
import { I18nProvider, useI18n } from './i18n/I18nContext.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { NewGameScreen } from './screens/NewGameScreen.js';
import { ScoreSheetScreen } from './screens/ScoreSheetScreen.js';
import { SignInScreen } from './screens/SignInScreen.js';

function AppContent({
  session,
  onSignOut,
}: {
  readonly session?: AuthSessionState;
  readonly onSignOut?: () => Promise<void>;
}) {
  const { route, activeScoreSheetId, navigate, services } = useApp();
  const { language, setLanguage, t } = useI18n();
  const isInGame = route === 'score-sheet';

  return (
    <main className={isInGame ? 'app-shell app-shell--game' : 'app-shell'}>
      {!isInGame && (
        <header className="app-header">
          <button className="brand-button" type="button" onClick={() => navigate('home')}>
            <span className="brand-mark" aria-hidden="true">♠</span>
            <h1>{t('appName')}</h1>
          </button>
          <div className="app-header__actions">
            <div className="language-switch" aria-label="Language">
              <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
              <button type="button" aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')}>العربية</button>
            </div>
            {session !== undefined && onSignOut !== undefined && (
              <UserSessionMenu session={session} onSignOut={onSignOut} />
            )}
          </div>
        </header>
      )}

      {route === 'home' && <HomeScreen />}
      {route === 'new-game' && <NewGameScreen />}
      {route === 'score-sheet' && activeScoreSheetId !== undefined && (
        <ScoreSheetScreen
          scoreSheetId={activeScoreSheetId}
          shell={services.shell}
          actorId={session?.user.id}
          onHistory={() => navigate('home')}
        />
      )}
    </main>
  );
}

function AuthenticatedApp() {
  const { services } = useApp();
  const auth = services.auth;
  const [session, setSession] = useState<AuthSessionState | undefined>();
  const [loading, setLoading] = useState(auth !== undefined);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const sessionServices = useMemo<AppServices>(() => {
    if (session === undefined || services.onlineSessionFactory === undefined) return services;
    return {
      ...services,
      ...services.onlineSessionFactory(session),
      onlineSessionFactory: undefined,
    };
  }, [services, session]);

  useEffect(() => {
    let active = true;
    if (auth === undefined) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    auth.getSession()
      .then((result) => {
        if (!active) return;
        if (!result.valid) setErrors(result.errors);
        else setSession(result.value);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setErrors([reason instanceof Error ? reason.message : 'Session could not be loaded.']);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [auth]);

  if (auth === undefined) return <AppContent />;
  if (loading) return <main className="app-shell auth-shell"><p>Loading session…</p></main>;
  if (session === undefined) {
    return <SignInScreen auth={auth} initialErrors={errors} onAuthenticated={(value) => {
      setErrors([]);
      setSession(value);
    }} />;
  }

  return (
    <AppProvider services={sessionServices}>
      <AppContent session={session} onSignOut={async () => {
        const result = await auth.signOut();
        if (!result.valid) {
          setErrors(result.errors);
          return;
        }
        setSession(undefined);
      }} />
    </AppProvider>
  );
}

export function App({ services }: { readonly services?: AppServices } = {}) {
  return (
    <I18nProvider>
      <AppProvider services={services}>
        <AuthenticatedApp />
      </AppProvider>
    </I18nProvider>
  );
}
