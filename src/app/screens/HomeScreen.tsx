import { useEffect, useState } from 'react';
import { useApp, type AppSessionHistoryItem } from '../AppContext.js';
import { useI18n } from '../i18n/I18nContext.js';

export function HomeScreen() {
  const { services, navigate, openScoreSheet } = useApp();
  const { t } = useI18n();
  const [sessions, setSessions] = useState<readonly AppSessionHistoryItem[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    Promise.resolve(services.shell.getSessionHistory())
      .then((result) => {
        if (!active) return;
        setSessions(result.sessions);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSessions([]);
        setError(reason instanceof Error ? reason.message : 'Games could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [services.shell]);

  return (
    <section className="screen-stack" aria-labelledby="recent-games-heading">
      <button className="primary-button" type="button" onClick={() => navigate('new-game')}>
        {t('startNewGame')}
      </button>

      <h2 id="recent-games-heading">{t('recentGames')}</h2>
      {error !== undefined && <div className="error-summary" role="alert">{error}</div>}
      {sessions === undefined ? <p>Loading games…</p> : sessions.length === 0 ? <p>{t('noRecentGames')}</p> : (
        <div className="session-grid">
          {sessions.map((session) => {
            const completed = session.status === 'finalized';
            return (
              <article className="session-card" key={session.id}>
                <div className="session-card__heading">
                  <div>
                    <h3>{session.name}</h3>
                    <p>{session.players.length} players · {session.roundCount} {t('rounds')}</p>
                    <p className="session-card__created">{session.createdAtLabel}</p>
                  </div>
                  <span className="rule-chip">{completed ? t('completed') : t('inProgress')}</span>
                </div>
                <ul className="player-list" aria-label={`${session.name} players`}>
                  {session.players.map((player) => <li key={player}>{player}</li>)}
                </ul>
                <button className="secondary-button" type="button" onClick={() => openScoreSheet(session.id)}>
                  {completed ? t('openGame') : t('continueGame')}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
