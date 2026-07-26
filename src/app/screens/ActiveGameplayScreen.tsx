import { useEffect, useState } from 'react';
import type { EstimationBid } from '../../domain/bid.js';
import type { Card } from '../../domain/card.js';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useApp } from '../AppContext.js';
import { ActiveSeatStatus } from '../components/ActiveSeatStatus.js';
import { GameplayBidPanel } from '../components/GameplayBidPanel.js';
import { GameplayCardPanel } from '../components/GameplayCardPanel.js';
import { useI18n } from '../i18n/I18nContext.js';

function commandId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId === undefined
    ? `${prefix}:${Date.now()}:${Math.floor(performance.now())}`
    : `${prefix}:${randomId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function lifecycleLabel(snapshot: OnlineActiveGameControlSnapshot): string {
  if (snapshot.lifecycle === 'paused') return 'Game paused';
  if (snapshot.lifecycle === 'terminated') return 'Game terminated';
  return 'Game active';
}

function turnLabel(snapshot: OnlineActiveGameControlSnapshot): string | undefined {
  const turn = snapshot.turn;
  if (turn === undefined) return undefined;
  const action = turn.actionKind === 'card' ? 'Card turn' : 'Bid turn';
  return `${action} · Seat ${turn.seat + 1}`;
}

function remainingSeconds(snapshot: OnlineActiveGameControlSnapshot): number | undefined {
  const turn = snapshot.turn;
  if (turn === undefined) return undefined;
  if (turn.remainingMs !== undefined) return Math.max(0, Math.ceil(turn.remainingMs / 1_000));
  if (turn.deadlineAt === undefined) return undefined;
  return Math.max(0, Math.ceil((Date.parse(turn.deadlineAt) - Date.now()) / 1_000));
}

export function ActiveGameplayScreen({
  tableId,
  currentUserId,
}: {
  readonly tableId: string;
  readonly currentUserId: string;
}) {
  const { services, navigate } = useApp();
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<OnlineActiveGameControlSnapshot | undefined>();
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [roundSnapshot, setRoundSnapshot] = useState<OnlineGameplayRoundSnapshot | undefined>();
  const [roundErrors, setRoundErrors] = useState<readonly string[]>([]);
  const [roundBusy, setRoundBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeConfirmed, setCloseConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    const service = services.activeGameControl;
    if (service === undefined) {
      setErrors(['Active-game control is not configured for this session.']);
      return () => {
        active = false;
      };
    }

    service.getSnapshot(tableId)
      .then((result) => {
        if (!active) return;
        if (!result.valid || result.value === undefined) {
          setErrors(result.errors);
          return;
        }
        setSnapshot(result.value);
        setErrors([]);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setErrors([reason instanceof Error ? reason.message : 'Active game could not be loaded.']);
      });

    return () => {
      active = false;
    };
  }, [services.activeGameControl, tableId]);

  useEffect(() => {
    let active = true;
    const service = services.gameplayRound;
    if (service === undefined) {
      return () => {
        active = false;
      };
    }

    service.getSnapshot(tableId)
      .then((result) => {
        if (!active) return;
        if (!result.valid || result.value === undefined) {
          setRoundErrors(result.errors);
          return;
        }
        setRoundSnapshot(result.value);
        setRoundErrors([]);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setRoundErrors([reason instanceof Error ? reason.message : 'Active round could not be loaded.']);
      });

    return () => {
      active = false;
    };
  }, [services.gameplayRound, tableId]);

  useEffect(() => {
    let active = true;
    const realtime = services.activeGameRealtime;
    if (realtime === undefined) {
      return () => {
        active = false;
      };
    }

    void realtime.connect(
      tableId,
      (value) => {
        if (!active) return;
        setSnapshot(value);
        setErrors([]);
      },
      (realtimeErrors) => {
        if (!active) return;
        setErrors(realtimeErrors);
      },
    ).catch((reason: unknown) => {
      if (!active) return;
      setErrors([reason instanceof Error ? reason.message : 'Realtime synchronization failed.']);
    });

    return () => {
      active = false;
      void realtime.disconnect();
    };
  }, [services.activeGameRealtime, tableId]);

  async function mutate(
    operation: () => Promise<{
      readonly valid: boolean;
      readonly errors: readonly string[];
      readonly value?: OnlineActiveGameControlSnapshot;
    }>,
  ) {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const result = services.activeGameRealtime === undefined
        ? await operation()
        : await services.activeGameRealtime.runMutation(operation);
      if (!result.valid || result.value === undefined) {
        setErrors(result.errors);
        if (services.activeGameRealtime === undefined) {
          const reload = await services.activeGameControl?.getSnapshot(tableId);
          if (reload?.valid && reload.value !== undefined) setSnapshot(reload.value);
        }
        return;
      }
      setSnapshot(result.value);
    } catch (reason: unknown) {
      setErrors([reason instanceof Error ? reason.message : 'Active-game action failed.']);
      const reload = await services.activeGameControl?.getSnapshot(tableId);
      if (reload?.valid && reload.value !== undefined) setSnapshot(reload.value);
    } finally {
      setBusy(false);
    }
  }

  async function submitEstimate(bid: EstimationBid) {
    const service = services.gameplayRound;
    if (service === undefined || roundSnapshot === undefined || roundBusy) return;

    setRoundBusy(true);
    setRoundErrors([]);
    try {
      const result = await service.submitBid(
        tableId,
        roundSnapshot.version,
        commandId('submit-bid'),
        bid,
      );
      if (!result.valid || result.value === undefined) {
        setRoundErrors(result.errors);
        const reload = await service.getSnapshot(tableId);
        if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
        return;
      }
      setRoundSnapshot(result.value);
    } catch (reason: unknown) {
      setRoundErrors([reason instanceof Error ? reason.message : 'Estimate could not be submitted.']);
      const reload = await service.getSnapshot(tableId);
      if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
    } finally {
      setRoundBusy(false);
    }
  }

  async function playCard(card: Card) {
    const service = services.gameplayRound;
    if (service === undefined || roundSnapshot === undefined || roundBusy) return;

    setRoundBusy(true);
    setRoundErrors([]);
    try {
      const result = await service.playCard(
        tableId,
        roundSnapshot.version,
        commandId('play-card'),
        card,
      );
      if (!result.valid || result.value === undefined) {
        setRoundErrors(result.errors);
        const reload = await service.getSnapshot(tableId);
        if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
        return;
      }
      setRoundSnapshot(result.value);
    } catch (reason: unknown) {
      setRoundErrors([reason instanceof Error ? reason.message : 'Card could not be played.']);
      const reload = await service.getSnapshot(tableId);
      if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
    } finally {
      setRoundBusy(false);
    }
  }

  async function pause() {
    const service = services.activeGameControl;
    if (service === undefined || snapshot === undefined) return;
    await mutate(() => service.pause(
      tableId,
      snapshot.version,
      commandId('pause-game'),
      nowIso(),
    ));
  }

  async function resume() {
    const service = services.activeGameControl;
    if (service === undefined || snapshot === undefined) return;
    await mutate(() => service.resume(
      tableId,
      snapshot.version,
      commandId('resume-game'),
      nowIso(),
    ));
  }

  async function terminate() {
    const service = services.activeGameControl;
    if (service === undefined || snapshot === undefined || !closeConfirmed) return;
    await mutate(() => service.terminate(
      tableId,
      snapshot.version,
      true,
      commandId('terminate-game'),
      nowIso(),
    ));
    setCloseOpen(false);
    setCloseConfirmed(false);
  }

  const isHost = snapshot?.hostUserId === currentUserId;
  const seconds = snapshot === undefined ? undefined : remainingSeconds(snapshot);
  const turn = snapshot === undefined ? undefined : turnLabel(snapshot);

  return (
    <section className="screen-stack active-game-screen" aria-labelledby="active-game-heading">
      <div className="screen-actions gameplay-lobby-actions">
        <button className="secondary-button" type="button" onClick={() => navigate('gameplay-table')}>
          {t('backToLobby')}
        </button>
        {snapshot !== undefined && snapshot.lifecycle !== 'terminated' && (
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void mutate(() => services.activeGameControl!.getSnapshot(tableId))}
          >
            {t('refreshGame')}
          </button>
        )}
      </div>

      <h2 id="active-game-heading">{t('activeOnlineGame')}</h2>
      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {roundErrors.length > 0 && (
        <div className="error-summary" role="alert">
          {roundErrors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}

      {snapshot === undefined ? (
        <p>{t('loadingActiveGame')}</p>
      ) : (
        <>
          <div className={`active-lifecycle active-lifecycle--${snapshot.lifecycle}`} role="status">
            <strong>{lifecycleLabel(snapshot)}</strong>
            <span>Version {snapshot.version}</span>
          </div>

          {turn !== undefined && snapshot.lifecycle !== 'terminated' && (
            <section className="active-turn-card" aria-labelledby="active-turn-heading">
              <h3 id="active-turn-heading">{turn}</h3>
              {seconds !== undefined && <p>{seconds} seconds remaining</p>}
              <p>{snapshot.turn?.status === 'bot-processing' ? 'Bot action processing' : 'Waiting for action'}</p>
            </section>
          )}

          <ActiveSeatStatus seats={snapshot.seats} activeSeat={snapshot.turn?.seat} />

          {roundSnapshot !== undefined && snapshot.lifecycle !== 'terminated' && (
            <>
              <GameplayBidPanel
                snapshot={roundSnapshot}
                busy={roundBusy || snapshot.lifecycle === 'paused'}
                onSubmit={submitEstimate}
              />
              {(roundSnapshot.phase === 'playing' || roundSnapshot.phase === 'scored') && (
                <GameplayCardPanel
                  snapshot={roundSnapshot}
                  busy={roundBusy || snapshot.lifecycle === 'paused'}
                  onPlay={playCard}
                />
              )}
            </>
          )}

          {isHost && snapshot.lifecycle !== 'terminated' && (
            <div className="active-host-controls" aria-label="Host controls">
              {snapshot.lifecycle === 'paused' ? (
                <button className="primary-button" type="button" disabled={busy} onClick={() => void resume()}>
                  {t('resumeGame')}
                </button>
              ) : (
                <button className="primary-button" type="button" disabled={busy} onClick={() => void pause()}>
                  {t('pauseGame')}
                </button>
              )}
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setCloseOpen(true)}>
                {t('closeTable')}
              </button>
            </div>
          )}
        </>
      )}

      {closeOpen && (
        <div className="score-override-backdrop">
          <section
            className="score-override-dialog game-lifecycle-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('closeActiveTable')}
          >
            <header className="score-override-header">
              <div>
                <h3>{t('closeActiveTable')}</h3>
                <p>{t('closeActiveTableWarning')}</p>
              </div>
              <button
                type="button"
                className="dialog-close-button"
                aria-label="Cancel close table"
                onClick={() => {
                  setCloseOpen(false);
                  setCloseConfirmed(false);
                }}
              >
                ×
              </button>
            </header>
            <label className="termination-confirmation">
              <input
                type="checkbox"
                checked={closeConfirmed}
                onChange={(event) => setCloseConfirmed(event.target.checked)}
              />
              {t('understandEndsGame')}
            </label>
            <footer className="score-override-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setCloseOpen(false);
                  setCloseConfirmed(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!closeConfirmed || busy}
                onClick={() => void terminate()}
              >
                {t('confirmCloseTable')}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
