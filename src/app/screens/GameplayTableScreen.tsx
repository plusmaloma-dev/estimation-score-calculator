import { useEffect, useState } from 'react';
import type { OnlineGameplayTableSnapshot } from '../../online/gameplay/types.js';
import { useApp } from '../AppContext.js';
import { useI18n } from '../i18n/I18nContext.js';

export function GameplayTableScreen({ tableId }: { readonly tableId: string }) {
  const { services, navigate, openActiveGame } = useApp();
  const { t } = useI18n();
  const [table, setTable] = useState<OnlineGameplayTableSnapshot | undefined>();
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    let active = true;
    const service = services.gameplayTables;
    if (service === undefined) {
      setErrors(['Online gameplay is not configured for this session.']);
      return () => {
        active = false;
      };
    }

    service.openTable(tableId)
      .then((result) => {
        if (!active) return;
        if (!result.valid || result.value === undefined) {
          setErrors(result.errors);
          return;
        }
        setTable(result.value);
        setErrors([]);
        if (result.value.lifecycle === 'active' || result.value.lifecycle === 'paused') {
          openActiveGame(result.value.tableId);
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setErrors([reason instanceof Error ? reason.message : 'Gameplay table could not be loaded.']);
      });

    return () => {
      active = false;
    };
  }, [openActiveGame, services.gameplayTables, tableId]);

  return (
    <section className="screen-stack" aria-labelledby="gameplay-table-heading">
      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={() => navigate('gameplay-lobby')}>
          {t('backToLobby')}
        </button>
      </div>
      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {table === undefined ? (
        <p>{t('loadingTable')}</p>
      ) : (
        <>
          <h2 id="gameplay-table-heading">{table.name}</h2>
          <p>{table.occupiedSeatCount} of 4 seats occupied</p>
          <ol className="player-list" aria-label={`${table.name} seats`}>
            {[0, 1, 2, 3].map((seatIndex) => {
              const seat = table.seats.find((candidate) => candidate.seat === seatIndex);
              return (
                <li key={seatIndex}>
                  Seat {seatIndex + 1}: {seat?.displayName ?? 'Vacant'}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
