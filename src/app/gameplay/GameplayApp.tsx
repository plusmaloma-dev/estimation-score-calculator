import { useEffect, useMemo, useState } from 'react';
import type { AuthSessionState } from '../../online/auth/types.js';
import { UserSessionMenu } from '../components/UserSessionMenu.js';
import { I18nProvider, useI18n } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from '../screens/ActiveGameplayScreen.js';
import { GameplayLobbyScreen } from '../screens/GameplayLobbyScreen.js';
import { GameplayTableScreen } from '../screens/GameplayTableScreen.js';
import { SignInScreen } from '../screens/SignInScreen.js';
import { createGameplayBrowserServices } from '../services/createGameplayBrowserServices.js';
import {
  GameplayContextProvider,
  type GameplayApplicationServices,
  useGameplayApp,
} from './GameplayContext.js';

function GameplayContent({
  session,
  onSignOut,
}: {
  readonly session?: AuthSessionState;
  readonly onSignOut?: () => Promise<void>;
}) {
  const {
    route,
    activeGameplayTableId,
    navigate,
  } = useGameplayApp();
  const { language, setLanguage, t } = useI18n();
  const isActiveGame = route === 'active-game';

  return (
    <main className={isActiveGame ? 'app-shell app-shell--game' : 'app-shell'}>
      {!isActiveGame && (
        <header className="app-header">
          <button className="brand-button" type="button" onClick={() => navigate('gameplay-home')}>
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

      {route === 'gameplay-home' && (
        <section className="screen-stack" aria-labelledby="gameplay-home-heading">
          <h2 id="gameplay-home-heading">{t('playOnline')}</h2>
          <button className="primary-button" type="button" onClick={() => navigate('gameplay-lobby')}>
            {t('onlineTables')}
          </button>
        </section>
      )}
      {route === 'gameplay-lobby' && <GameplayLobbyScreen />}
      {route === 'gameplay-table' && activeGameplayTableId !== undefined && (
        <GameplayTableScreen
          tableId={activeGameplayTableId}
          currentUserId={session?.user.id ?? ''}
        />
      )}
      {route === 'active-game' && activeGameplayTableId !== undefined && (
        <ActiveGameplayScreen
          tableId={activeGameplayTableId}
          currentUserId={session?.user.id ?? ''}
        />
      )}
    </main>
  );
}

function GameplaySessionApp({
  services,
}: {
  readonly services: GameplayApplicationServices;
}) {
  const auth = services.auth;
  const [session, setSession] = useState<AuthSessionState | undefined>();
  const [loading, setLoading] = useState(auth !== undefined);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const sessionServices = useMemo<GameplayApplicationServices>(() => {
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

  if (loading) return <main className="app-shell auth-shell"><p>Loading session…</p></main>;
  if (auth !== undefined && session === undefined) {
    return <SignInScreen auth={auth} initialErrors={errors} onAuthenticated={(value) => {
      setErrors([]);
      setSession(value);
    }} />;
  }

  return (
    <GameplayContextProvider services={sessionServices} initialRoute="gameplay-lobby">
      <GameplayContent
        session={session}
        onSignOut={auth === undefined ? undefined : async () => {
          const result = await auth.signOut();
          if (!result.valid) {
            setErrors(result.errors);
            return;
          }
          setSession(undefined);
        }}
      />
    </GameplayContextProvider>
  );
}

export function GameplayApp({
  services,
}: {
  readonly services?: GameplayApplicationServices;
} = {}) {
  const resolvedServices = useMemo(
    () => services ?? createGameplayBrowserServices(),
    [services],
  );

  return (
    <I18nProvider>
      <GameplaySessionApp services={resolvedServices} />
    </I18nProvider>
  );
}
