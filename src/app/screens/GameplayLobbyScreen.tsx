import { useEffect, useState } from 'react';
import type { OnlineGameplayLobbyCard } from '../../online/gameplay/types.js';
import { useApp } from '../AppContext.js';
import { useI18n } from '../i18n/I18nContext.js';

export function GameplayLobbyScreen() {
  const { services, navigate, openGameplayTable } = useApp();
  const { t } = useI18n();
  const [tables, setTables] = useState<readonly OnlineGameplayLobbyCard[] | undefined>();
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    let active = true;
    const service = services.gameplayTables;
    if (service === undefined) {
      setTables([]);
      setErrors(['Online gameplay is not configured for this session.']);
      return () => {
        active = false;
      };
    }

    service.listLobby()
      .then((result) => {
        if (!active) return;
        if (!result.valid || result.value === undefined) {
          setTables([]);
          setErrors(result.errors);
          return;
        }
        setTables(result.value.filter((table) => table.lifecycle === 'lobby'));
        setErrors([]);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setTables([]);
        setErrors([reason instanceof Error ? reason.message : 'Online tables could not be loaded.']);
      });

    return () => {
      active = false;
    };
  }, [services.gameplayTables]);

  return (
    <section className="screen-stack" aria-labelledby="online-tables-heading">
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={() => navigate('home')}>
          {t('backHome')}
        </button>
      </div>
      <h2 id="online-tables-heading">{t('onlineTables')}</h2>
      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {tables === undefined ? (
        <p>{t('loadingTables')}</p>
      ) : tables.length === 0 ? (
        <p>{t('noOpenTables')}</p>
      ) : (
        <div className="session-grid">
          {tables.map((table) => (
            <article className="session-card" key={table.tableId}>
              <div className="session-card__heading">
                <div>
                  <h3>{table.name}</h3>
                  <p>{table.occupiedSeatCount} of 4 seats</p>
                  <p>{table.turnTimerSeconds}s turn timer</p>
                </div>
                <span className="rule-chip">
                  {table.joinPolicy === 'open' ? 'Open join' : 'Host approval'}
                </span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => openGameplayTable(table.tableId)}
              >
                {t('openTable')}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
