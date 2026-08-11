import { useEffect, useMemo, useRef, useState } from 'react';
import type { EstimationBid } from '../../domain/bid.js';
import type { Card } from '../../domain/card.js';
import type { GameplayAuctionAction } from '../../gameplay/types.js';
import { BotDirectiveCoordinator } from '../../online/gameplay/BotDirectiveCoordinator.js';
import type {
  OnlineActiveGameControlSnapshot,
  OnlineBotActionDirective,
} from '../../online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { ActiveSeatStatus } from '../components/ActiveSeatStatus.js';
import { GameplayActionBanner } from '../components/GameplayActionBanner.js';
import { GameplayBidPanel } from '../components/GameplayBidPanel.js';
import { GameplayCardPanel } from '../components/GameplayCardPanel.js';
import { GameplayNextRoundPanel } from '../components/GameplayNextRoundPanel.js';
import { GameplayRoundStatus } from '../components/GameplayRoundStatus.js';
import { createActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { useGameplayApp } from '../gameplay/GameplayContext.js';
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

function recoverableDirective(
  snapshot: OnlineActiveGameControlSnapshot,
): OnlineBotActionDirective | undefined {
  const turn = snapshot.turn;
  if (
    turn === undefined
    || turn.status !== 'assistant-pending' && turn.status !== 'bot-processing'
  ) return undefined;
  const seat = snapshot.seats[turn.seat];
  if (seat === undefined) return undefined;
  const source = seat.controlOwner === 'permanent-bot'
    ? 'permanent-bot'
    : seat.controlOwner === 'temporary-bot'
      ? 'disconnect-substitute'
      : 'timeout-assistant';
  return {
    directiveId: `bot-action:${snapshot.tableId}:${turn.turnId}:${turn.seat}`,
    tableId: snapshot.tableId,
    turnId: turn.turnId,
    seat: turn.seat,
    actionKind: turn.actionKind,
    source,
    issuedAt: turn.startedAt,
  };
}

export function ActiveGameplayScreen({
  tableId,
  currentUserId,
}: {
  readonly tableId: string;
  readonly currentUserId: string;
}) {
  const { services, navigate } = useGameplayApp();
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<OnlineActiveGameControlSnapshot | undefined>();
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [roundSnapshot, setRoundSnapshot] = useState<OnlineGameplayRoundSnapshot | undefined>();
  const [roundErrors, setRoundErrors] = useState<readonly string[]>([]);
  const [roundBusy, setRoundBusy] = useState(false);
  const [nextRoundBusy, setNextRoundBusy] = useState(false);
  const [nextRoundError, setNextRoundError] = useState<string | undefined>();
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [synchronizationRetry, setSynchronizationRetry] = useState(0);
  const evaluatedTurns = useRef(new Set<string>());
  const refreshedSynchronizationKeys = useRef(new Set<string>());
  const pendingNextRoundCommandId = useRef<string | undefined>(undefined);
  const directiveCoordinator = useMemo(() => {
    const processBotDirective = services.gameplayRound?.processBotDirective;
    if (processBotDirective === undefined) return undefined;
    return new BotDirectiveCoordinator({
      processBotDirective: (directiveTableId, directiveId) => (
        processBotDirective.call(services.gameplayRound, directiveTableId, directiveId)
      ),
    });
  }, [services.gameplayRound]);

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

  const presentation = useMemo(() => createActiveRoundPresentation({
    activeControl: snapshot,
    round: roundSnapshot,
    viewerUserId: currentUserId,
    nowMs,
  }), [currentUserId, nowMs, roundSnapshot, snapshot]);

  useEffect(() => {
    const deadlineAt = snapshot?.lifecycle === 'active' ? snapshot.turn?.deadlineAt : undefined;
    if (deadlineAt === undefined) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [snapshot?.lifecycle, snapshot?.turn?.deadlineAt]);

  useEffect(() => {
    if (!presentation.isSynchronizing || presentation.synchronizationKey === undefined) return;
    const key = presentation.synchronizationKey;
    if (refreshedSynchronizationKeys.current.has(key)) return;
    refreshedSynchronizationKeys.current.add(key);

    let active = true;
    const refresh = async () => {
      const activeGameControl = services.activeGameControl;
      const gameplayRound = services.gameplayRound;
      if (activeGameControl === undefined || gameplayRound === undefined) {
        throw new Error('Authoritative gameplay projections are unavailable.');
      }
      const [controlResult, roundResult] = await Promise.all([
        activeGameControl.getSnapshot(tableId),
        gameplayRound.getSnapshot(tableId),
      ]);
      if (!active) return;
      if (
        !controlResult.valid
        || controlResult.value === undefined
        || !roundResult.valid
        || roundResult.value === undefined
      ) {
        throw new Error('Authoritative gameplay projections are invalid.');
      }
      setSnapshot(controlResult.value);
      setRoundSnapshot(roundResult.value);
      setErrors([]);
      setRoundErrors([]);
    };
    void refresh().catch(() => {
      if (!active) return;
      refreshedSynchronizationKeys.current.delete(key);
      setRoundErrors([t('roundSynchronizationFailed')]);
    });
    return () => {
      active = false;
    };
  }, [
    presentation.isSynchronizing,
    presentation.synchronizationKey,
    services.activeGameControl,
    services.gameplayRound,
    synchronizationRetry,
    t,
    tableId,
  ]);

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

  useEffect(() => {
    let active = true;
    const realtime = services.gameplayRoundRealtime;
    if (realtime === undefined) {
      return () => {
        active = false;
      };
    }

    void realtime.connect(
      tableId,
      (value) => {
        if (!active) return;
        setRoundSnapshot(value);
        setRoundErrors([]);
      },
      (realtimeErrors) => {
        if (!active) return;
        setRoundErrors(realtimeErrors);
      },
    ).catch((reason: unknown) => {
      if (!active) return;
      setRoundErrors([reason instanceof Error ? reason.message : 'Round Realtime synchronization failed.']);
    });

    return () => {
      active = false;
      void realtime.disconnect();
    };
  }, [services.gameplayRoundRealtime, tableId]);

  useEffect(() => {
    const service = services.activeGameControl;
    const turn = snapshot?.turn;
    if (
      service === undefined
      || snapshot === undefined
      || snapshot.lifecycle !== 'active'
      || turn === undefined
      || turn.status !== 'running'
    ) return;

    const seat = snapshot.seats[turn.seat];
    if (seat === undefined) return;
    const key = `${turn.turnId}:${snapshot.version}`;
    if (evaluatedTurns.current.has(key)) return;
    const delay = seat.controlOwner === 'human'
      ? Math.max(0, Date.parse(turn.deadlineAt ?? turn.startedAt) - Date.now())
      : 0;

    const timer = window.setTimeout(() => {
      if (evaluatedTurns.current.has(key)) return;
      evaluatedTurns.current.add(key);
      const occurredAt = nowIso();
      const evaluation = () => service.evaluateDeadlines(
        tableId,
        snapshot.version,
        `evaluate-deadline:${turn.turnId}:${snapshot.version}:${currentUserId}`,
        occurredAt,
      );
      const maybeResult = services.activeGameRealtime === undefined
        ? evaluation()
        : services.activeGameRealtime.runMutation(evaluation);
      void Promise.resolve(maybeResult).then((result) => {
        if (result === undefined) return;
        if (result.valid && result.value !== undefined) {
          setSnapshot(result.value);
          return;
        }
        if (!result.errors.includes('No active deadline transition was produced.')) {
          setErrors(result.errors);
        }
      }).catch((reason: unknown) => {
        evaluatedTurns.current.delete(key);
        setErrors([reason instanceof Error ? reason.message : 'Turn deadline could not be evaluated.']);
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentUserId, services.activeGameControl, services.activeGameRealtime, snapshot, tableId]);

  useEffect(() => {
    if (snapshot === undefined || directiveCoordinator === undefined) return;
    const fallback = recoverableDirective(snapshot);
    const directives = snapshot.directives.length > 0
      ? snapshot.directives
      : fallback === undefined ? [] : [fallback];
    if (directives.length === 0) return;

    void directiveCoordinator.process(
      directives,
      (value) => {
        setRoundSnapshot(value);
        setRoundErrors([]);
      },
      (directiveErrors) => setRoundErrors(directiveErrors),
    ).catch((reason: unknown) => {
      setRoundErrors([reason instanceof Error ? reason.message : 'Bot directive processing failed.']);
    });
  }, [directiveCoordinator, snapshot]);

  useEffect(() => () => directiveCoordinator?.reset(), [directiveCoordinator]);

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
      const operation = () => service.submitBid(
        tableId,
        roundSnapshot.version,
        commandId('submit-bid'),
        bid,
      );
      const result = services.gameplayRoundRealtime === undefined
        ? await operation()
        : await services.gameplayRoundRealtime.runMutation(operation);
      if (!result.valid || result.value === undefined) {
        setRoundErrors(result.errors);
        if (services.gameplayRoundRealtime === undefined) {
          const reload = await service.getSnapshot(tableId);
          if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
        }
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
      const operation = () => service.playCard(
        tableId,
        roundSnapshot.version,
        commandId('play-card'),
        card,
      );
      const result = services.gameplayRoundRealtime === undefined
        ? await operation()
        : await services.gameplayRoundRealtime.runMutation(operation);
      if (!result.valid || result.value === undefined) {
        setRoundErrors(result.errors);
        if (services.gameplayRoundRealtime === undefined) {
          const reload = await service.getSnapshot(tableId);
          if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
        }
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

  async function submitAuctionAction(action: GameplayAuctionAction) {
    const service = services.gameplayRound;
    if (service === undefined || service.submitAuctionAction === undefined || roundSnapshot === undefined || roundBusy) return;
    const submitAction = service.submitAuctionAction;

    setRoundBusy(true);
    setRoundErrors([]);
    try {
      const operation = () => submitAction(
        tableId,
        roundSnapshot.version,
        commandId('submit-auction-action'),
        action,
      );
      const result = services.gameplayRoundRealtime === undefined
        ? await operation()
        : await services.gameplayRoundRealtime.runMutation(operation);
      if (!result.valid || result.value === undefined) {
        setRoundErrors(result.errors);
        if (services.gameplayRoundRealtime === undefined) {
          const reload = await service.getSnapshot(tableId);
          if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
        }
        return;
      }
      setRoundSnapshot(result.value);
    } catch (reason: unknown) {
      setRoundErrors([reason instanceof Error ? reason.message : 'Auction action could not be submitted.']);
      const reload = await service.getSnapshot(tableId);
      if (reload.valid && reload.value !== undefined) setRoundSnapshot(reload.value);
    } finally {
      setRoundBusy(false);
    }
  }

  function nextRoundPublicError(nextErrors: readonly string[]): string {
    return nextErrors.some((error) => /state changed|stale|concurrent|version/i.test(error))
      ? t('nextRoundStateChanged')
      : t('nextRoundStartFailed');
  }

  async function refreshAuthoritativeGameplayState() {
    const activeGameControl = services.activeGameControl;
    const gameplayRound = services.gameplayRound;
    if (activeGameControl === undefined || gameplayRound === undefined) return;
    try {
      const [controlResult, roundResult] = await Promise.all([
        activeGameControl.getSnapshot(tableId),
        gameplayRound.getSnapshot(tableId),
      ]);
      if (controlResult.valid && controlResult.value !== undefined) {
        setSnapshot(controlResult.value);
        setErrors([]);
      } else if (!controlResult.valid) {
        setErrors([t('roundSynchronizationFailed')]);
      }
      if (roundResult.valid && roundResult.value !== undefined) {
        setRoundSnapshot(roundResult.value);
        setRoundErrors([]);
      } else if (!roundResult.valid) {
        setRoundErrors([t('roundSynchronizationFailed')]);
      }
    } catch {
      setRoundErrors([t('roundSynchronizationFailed')]);
    }
  }

  async function startNextRound() {
    const service = services.gameplayRound;
    if (
      service === undefined
      || service.startNextRound === undefined
      || snapshot === undefined
      || roundSnapshot === undefined
      || nextRoundBusy
      || !presentation.canStartNextRound
      || presentation.roundNumber === undefined
    ) return;
    const startNextRoundCommand = service.startNextRound;

    const command = pendingNextRoundCommandId.current ?? commandId('start-next-round');
    pendingNextRoundCommandId.current = command;
    setNextRoundBusy(true);
    setNextRoundError(undefined);
    try {
      const operation = () => startNextRoundCommand(
        tableId,
        presentation.roundNumber!,
        roundSnapshot.version,
        snapshot.version,
        command,
      );
      const result = services.gameplayRoundRealtime === undefined
        ? await operation()
        : await services.gameplayRoundRealtime.runMutation(operation) as Awaited<ReturnType<typeof startNextRoundCommand>>;
      if (!result.valid || result.value === undefined) {
        if (result.failureKind === 'definitive-rejection') {
          pendingNextRoundCommandId.current = undefined;
        }
        setNextRoundError(nextRoundPublicError(result.errors));
        await refreshAuthoritativeGameplayState();
        return;
      }
      pendingNextRoundCommandId.current = undefined;
      setRoundSnapshot(result.value);
      setRoundErrors([]);
      await refreshAuthoritativeGameplayState();
    } catch {
      setNextRoundError(t('nextRoundStartFailed'));
      await refreshAuthoritativeGameplayState();
    } finally {
      setNextRoundBusy(false);
    }
  }

  function refreshGame() {
    if (presentation.isSynchronizing) {
      if (presentation.synchronizationKey !== undefined) {
        refreshedSynchronizationKeys.current.delete(presentation.synchronizationKey);
      }
      setErrors([]);
      setRoundErrors([]);
      setSynchronizationRetry((attempt) => attempt + 1);
      return;
    }
    void mutate(() => services.activeGameControl!.getSnapshot(tableId));
  }

  const isHost = snapshot?.hostUserId === currentUserId;
  const canRenderRound = roundSnapshot !== undefined && presentation.phase !== 'loading';

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
            onClick={refreshGame}
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

      <GameplayActionBanner presentation={presentation} />

      {snapshot !== undefined && (
        <ActiveSeatStatus seats={snapshot.seats} activeSeat={presentation.activeSeat} />
      )}

      {canRenderRound && (
        <>
          <GameplayRoundStatus presentation={presentation} />
          {presentation.phase !== 'terminated' && (
            <>
              <GameplayBidPanel
                snapshot={roundSnapshot}
                canSubmit={(presentation.phase === 'auction' || presentation.phase === 'estimate' || presentation.phase === 'bidding')
                  && presentation.viewerActionRequired}
                busy={roundBusy || presentation.phase === 'paused'}
                onSubmit={submitEstimate}
                onSubmitAuctionAction={submitAuctionAction}
              />
              {(roundSnapshot.phase === 'playing' || roundSnapshot.phase === 'scored') && (
                <GameplayCardPanel
                  snapshot={roundSnapshot}
                  canPlay={presentation.phase === 'playing' && presentation.viewerActionRequired}
                  busy={roundBusy || presentation.phase === 'paused'}
                  onPlay={playCard}
                />
              )}
              <GameplayNextRoundPanel
                presentation={presentation}
                isHost={isHost}
                pending={nextRoundBusy}
                error={nextRoundError}
                onStartNextRound={() => void startNextRound()}
              />
            </>
          )}
        </>
      )}

      {snapshot !== undefined && (
        <>
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
