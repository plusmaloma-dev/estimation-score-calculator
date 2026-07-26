import { useEffect, useState, type FormEvent } from 'react';
import type {
  DisconnectGraceSeconds,
  TurnTimerSeconds,
} from '../../gameplay/table/types.js';
import type { OnlineGameplayTableSnapshot } from '../../online/gameplay/types.js';
import { useApp } from '../AppContext.js';
import { GameplaySeatGrid } from '../components/GameplaySeatGrid.js';
import { useI18n } from '../i18n/I18nContext.js';

function newCommandId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId === undefined
    ? `${prefix}:${Date.now()}:${Math.floor(performance.now())}`
    : `${prefix}:${randomId}`;
}

export function GameplayTableScreen({
  tableId,
  currentUserId,
}: {
  readonly tableId: string;
  readonly currentUserId: string;
}) {
  const { services, navigate, openActiveGame } = useApp();
  const { t } = useI18n();
  const [table, setTable] = useState<OnlineGameplayTableSnapshot | undefined>();
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [requestedSeat, setRequestedSeat] = useState<0 | 1 | 2 | 3>(1);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<TurnTimerSeconds>(45);
  const [disconnectGraceSeconds, setDisconnectGraceSeconds] = useState<DisconnectGraceSeconds>(60);

  function applySnapshot(snapshot: OnlineGameplayTableSnapshot) {
    setTable(snapshot);
    setTurnTimerSeconds(snapshot.turnTimerSeconds);
    setDisconnectGraceSeconds(snapshot.disconnectGraceSeconds);
    setErrors([]);
    if (snapshot.lifecycle === 'active' || snapshot.lifecycle === 'paused') {
      openActiveGame(snapshot.tableId);
    }
  }

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
        applySnapshot(result.value);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setErrors([reason instanceof Error ? reason.message : 'Gameplay table could not be loaded.']);
      });

    return () => {
      active = false;
    };
  }, [services.gameplayTables, tableId]);

  async function mutate(
    operation: () => Promise<{
      readonly valid: boolean;
      readonly errors: readonly string[];
      readonly value?: OnlineGameplayTableSnapshot;
    }>,
  ) {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const result = await operation();
      if (!result.valid || result.value === undefined) {
        setErrors(result.errors);
        return;
      }
      applySnapshot(result.value);
    } catch (reason: unknown) {
      setErrors([reason instanceof Error ? reason.message : 'Table action failed.']);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const service = services.gameplayTables;
    if (service === undefined || table === undefined) return;
    await mutate(() => service.updateSettings(
      table.tableId,
      table.version,
      { turnTimerSeconds, disconnectGraceSeconds },
      newCommandId('update-settings'),
    ));
  }

  async function joinOrRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const service = services.gameplayTables;
    if (service === undefined || table === undefined) return;
    if (table.joinPolicy === 'open') {
      await mutate(() => service.joinTable(
        table.tableId,
        table.version,
        { displayName, requestedSeat },
        newCommandId('join-table'),
      ));
      return;
    }
    await mutate(() => service.requestJoin(
      table.tableId,
      table.version,
      {
        requestId: newCommandId('join-request'),
        displayName,
        requestedSeat,
      },
      newCommandId('request-join'),
    ));
  }

  async function respond(
    requestId: string,
    decision: 'accept' | 'reject',
  ) {
    const service = services.gameplayTables;
    if (service === undefined || table === undefined) return;
    await mutate(() => service.respondJoinRequest(
      table.tableId,
      table.version,
      requestId,
      decision,
      newCommandId('respond-join'),
    ));
  }

  async function startGame() {
    const service = services.gameplayTables;
    if (service === undefined || table === undefined) return;
    await mutate(() => service.startTable(
      table.tableId,
      table.version,
      newCommandId('start-table'),
    ));
  }

  async function leaveTable() {
    const service = services.gameplayTables;
    if (service === undefined || table === undefined) return;
    await mutate(async () => {
      const result = await service.leaveTable(
        table.tableId,
        table.version,
        newCommandId('leave-table'),
      );
      if (result.valid) navigate('gameplay-lobby');
      return result;
    });
  }

  const isHost = table?.hostUserId === currentUserId;
  const currentSeat = table?.seats.find(
    (seat) => seat.kind === 'human' && seat.userId === currentUserId,
  );
  const pendingRequests = table?.joinRequests.filter((request) => request.status === 'pending') ?? [];
  const ownPendingRequest = pendingRequests.find((request) => request.userId === currentUserId);

  return (
    <section className="screen-stack gameplay-table-screen" aria-labelledby="gameplay-table-heading">
      <div className="screen-actions gameplay-lobby-actions">
        <button className="secondary-button" type="button" onClick={() => navigate('gameplay-lobby')}>
          {t('backToLobby')}
        </button>
        {currentSeat !== undefined && table?.lifecycle === 'lobby' && (
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void leaveTable()}>
            {t('leaveTable')}
          </button>
        )}
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
          <div className="gameplay-table-heading">
            <div>
              <h2 id="gameplay-table-heading">{table.name}</h2>
              <p>{table.occupiedSeatCount} of 4 seats occupied</p>
            </div>
            <span className="rule-chip">
              {table.visibility === 'private' ? t('privateTable') : t('publicTable')}
            </span>
          </div>

          <GameplaySeatGrid tableName={table.name} seats={table.seats} />

          {isHost && !table.settingsLocked && (
            <form className="setup-form gameplay-table-settings" onSubmit={(event) => void saveSettings(event)}>
              <h3>{t('tableSettings')}</h3>
              <div className="gameplay-form-grid">
                <label>
                  {t('turnTimer')}
                  <select
                    value={turnTimerSeconds}
                    disabled={busy}
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
                    disabled={busy}
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
              <button className="secondary-button" type="submit" disabled={busy}>
                {t('saveSettings')}
              </button>
            </form>
          )}

          {isHost && pendingRequests.length > 0 && (
            <section className="setup-form" aria-labelledby="pending-requests-heading">
              <h3 id="pending-requests-heading">{t('pendingJoinRequests')}</h3>
              <ul className="gameplay-request-list">
                {pendingRequests.map((request) => (
                  <li key={request.requestId}>
                    <span>
                      <strong>{request.displayName}</strong>
                      {request.requestedSeat === undefined ? '' : ` · Seat ${request.requestedSeat + 1}`}
                    </span>
                    <span className="gameplay-request-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busy}
                        aria-label={`Accept ${request.displayName}`}
                        onClick={() => void respond(request.requestId, 'accept')}
                      >
                        Accept
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busy}
                        aria-label={`Reject ${request.displayName}`}
                        onClick={() => void respond(request.requestId, 'reject')}
                      >
                        Reject
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {currentSeat === undefined && ownPendingRequest === undefined && table.lifecycle === 'lobby' && (
            <form className="setup-form gameplay-join-form" onSubmit={(event) => void joinOrRequest(event)}>
              <label>
                {t('displayName')}
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <label>
                {t('seat')}
                <select
                  value={requestedSeat}
                  onChange={(event) => setRequestedSeat(Number(event.target.value) as 0 | 1 | 2 | 3)}
                >
                  {[0, 1, 2, 3].map((seat) => (
                    <option
                      key={seat}
                      value={seat}
                      disabled={table.seats.some((candidate) => candidate.seat === seat)}
                    >
                      Seat {seat + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={busy || displayName.trim().length === 0}
              >
                {table.joinPolicy === 'open' ? t('joinTable') : t('requestToJoin')}
              </button>
            </form>
          )}

          {ownPendingRequest !== undefined && (
            <p role="status">Join request pending for {ownPendingRequest.displayName}.</p>
          )}

          {isHost && table.lifecycle === 'lobby' && (
            <button
              className="primary-button"
              type="button"
              disabled={busy || pendingRequests.length > 0}
              onClick={() => void startGame()}
            >
              {t('startGame')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
