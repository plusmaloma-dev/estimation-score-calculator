import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  DisconnectGraceSeconds,
  GameplayTableJoinPolicy,
  GameplayTableVisibility,
  TurnTimerSeconds,
} from '../../gameplay/table/types.js';
import type { OnlineGameplayLobbyCard } from '../../online/gameplay/types.js';
import { useApp } from '../AppContext.js';
import { useI18n } from '../i18n/I18nContext.js';

function newCommandId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId === undefined
    ? `${prefix}:${Date.now()}:${Math.floor(performance.now())}`
    : `${prefix}:${randomId}`;
}

export function GameplayLobbyScreen() {
  const { services, navigate, openGameplayTable } = useApp();
  const { t } = useI18n();
  const [tables, setTables] = useState<readonly OnlineGameplayLobbyCard[] | undefined>();
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<GameplayTableVisibility>('public');
  const [joinPolicy, setJoinPolicy] = useState<GameplayTableJoinPolicy>('open');
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<TurnTimerSeconds>(45);
  const [disconnectGraceSeconds, setDisconnectGraceSeconds] = useState<DisconnectGraceSeconds>(60);
  const [creating, setCreating] = useState(false);

  const loadTables = useCallback(async () => {
    const service = services.gameplayTables;
    if (service === undefined) {
      setTables([]);
      setErrors(['Online gameplay is not configured for this session.']);
      return;
    }

    try {
      const result = await service.listLobby();
      if (!result.valid || result.value === undefined) {
        setTables([]);
        setErrors(result.errors);
        return;
      }
      setTables(result.value.filter((table) => table.lifecycle === 'lobby'));
      setErrors([]);
    } catch (reason: unknown) {
      setTables([]);
      setErrors([reason instanceof Error ? reason.message : 'Online tables could not be loaded.']);
    }
  }, [services.gameplayTables]);

  useEffect(() => {
    let active = true;
    void loadTables().catch(() => {
      if (active) setErrors(['Online tables could not be loaded.']);
    });
    return () => {
      active = false;
    };
  }, [loadTables]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const service = services.gameplayTables;
    if (service === undefined || creating) return;

    setCreating(true);
    setErrors([]);
    try {
      const result = await service.createTable({
        commandId: newCommandId('create-table'),
        name,
        visibility,
        joinPolicy,
        turnTimerSeconds,
        disconnectGraceSeconds,
      });
      if (!result.valid || result.value === undefined) {
        setErrors(result.errors);
        return;
      }
      openGameplayTable(result.value.tableId);
    } catch (reason: unknown) {
      setErrors([reason instanceof Error ? reason.message : 'Table could not be created.']);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="screen-stack" aria-labelledby="online-tables-heading">
      <div className="screen-actions gameplay-lobby-actions">
        <button className="secondary-button" type="button" onClick={() => navigate('home')}>
          {t('backHome')}
        </button>
        <button className="secondary-button" type="button" onClick={() => void loadTables()}>
          {t('refreshTables')}
        </button>
      </div>
      <h2 id="online-tables-heading">{t('onlineTables')}</h2>

      <form className="setup-form gameplay-create-form" onSubmit={(event) => void handleCreate(event)}>
        <h3>{t('createTable')}</h3>
        <label>
          {t('tableName')}
          <input
            type="text"
            value={name}
            required
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="gameplay-form-grid">
          <label>
            {t('visibility')}
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as GameplayTableVisibility)}
            >
              <option value="public">{t('publicTable')}</option>
              <option value="private">{t('privateTable')}</option>
            </select>
          </label>
          <label>
            {t('joinPolicy')}
            <select
              value={joinPolicy}
              onChange={(event) => setJoinPolicy(event.target.value as GameplayTableJoinPolicy)}
            >
              <option value="open">{t('openJoin')}</option>
              <option value="approval-required">{t('hostApproval')}</option>
            </select>
          </label>
          <label>
            {t('turnTimer')}
            <select
              value={turnTimerSeconds}
              onChange={(event) => setTurnTimerSeconds(Number(event.target.value) as TurnTimerSeconds)}
            >
              {[20, 30, 45, 60, 90].map((seconds) => (
                <option value={seconds} key={seconds}>{seconds} seconds</option>
              ))}
            </select>
          </label>
          <label>
            {t('disconnectGrace')}
            <select
              value={disconnectGraceSeconds}
              onChange={(event) => setDisconnectGraceSeconds(
                Number(event.target.value) as DisconnectGraceSeconds,
              )}
            >
              {[30, 60, 90, 120].map((seconds) => (
                <option value={seconds} key={seconds}>{seconds} seconds</option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary-button" type="submit" disabled={creating || name.trim().length === 0}>
          {creating ? t('creatingTable') : t('createTable')}
        </button>
      </form>

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
        <div className="session-grid gameplay-lobby-grid">
          {tables.map((table) => (
            <article className="session-card" key={table.tableId}>
              <div className="session-card__heading">
                <div>
                  <h3>{table.name}</h3>
                  <p>{table.occupiedSeatCount} of 4 seats</p>
                  <p>{table.turnTimerSeconds}s turn timer</p>
                </div>
                <span className="rule-chip">
                  {table.joinPolicy === 'open' ? t('openJoin') : t('hostApproval')}
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
