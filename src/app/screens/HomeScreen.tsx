import { useApp } from '../AppContext.js';
import { useI18n } from '../i18n/I18nContext.js';

export function HomeScreen() {
  const { services, navigate, openScoreSheet } = useApp();
  const { t } = useI18n();
  const sessions = services.shell.getSessionHistory().sessions;

  return (
    <section className="screen-stack" aria-labelledby="recent-games-heading">
      <button className="primary-button" type="button" onClick={() => navigate('new-game')}>
        {t('startNewGame')}
      </button>

      <h2 id="recent-games-heading">{t('recentGames')}</h2>
      {sessions.length === 0 ? <p>{t('noRecentGames')}</p> : (
        <div className="session-grid">
          {sessions.map((session) => (
            <article className="session-card" key={session.id}>
              <div className="session-card__heading">
                <div>
                  <h3>{session.name}</h3>
                  <p>{session.players.length} players · {session.roundCount} {t('rounds')}</p>
                </div>
                <span className="rule-chip">{session.status}</span>
              </div>
              <ul className="player-list" aria-label={`${session.name} players`}>
                {session.players.map((player) => <li key={player}>{player}</li>)}
              </ul>
              <button className="secondary-button" type="button" onClick={() => openScoreSheet(session.id)}>
                {t('continueGame')}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
