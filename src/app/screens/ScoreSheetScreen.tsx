import { useEffect, useMemo, useReducer, useState } from 'react';
import {
  FEDERATION_2026,
  houseRulesV1ScoringProfile,
  type ScoringProfile,
  type UiGameLifecycleResult,
  type UiOpenSessionResult,
  type UiOverrideRoundScoresInput,
  type UiOverrideRoundScoresResult,
  type UiRoundEntryInput,
  type UiSaveRoundResult,
  type UiValidationResult,
} from '../../index.js';
import type { WorkspaceRole } from '../../online/auth/types.js';
import { CurrentRoundRow } from '../components/CurrentRoundRow.js';
import { GameLifecycleDialog, type GameLifecycleDialogMode } from '../components/GameLifecycleDialog.js';
import { ScoreOverrideDialog } from '../components/ScoreOverrideDialog.js';
import { ScoreSheetTable } from '../components/ScoreSheetTable.js';
import type { CurrentRoundDraft } from '../scoreSheet/currentRoundReducer.js';
import {
  resolveAutomaticRiskPlayerId,
  resolveMultipleWithRoundMultiplier,
} from '../scoreSheet/currentRoundReducer.js';
import { buildScoreSheetViewModel } from '../scoreSheet/scoreSheetViewModel.js';

type Awaitable<T> = T | Promise<T>;

const federationProfile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  ruleSet: FEDERATION_2026,
  highContractThreshold: 8,
};

export interface ScoreSheetShellPort {
  openSession(scoreSheetId: string): Awaitable<UiOpenSessionResult>;
  saveRound?(scoreSheetId: string, input: UiRoundEntryInput, nowIso?: string): Awaitable<UiSaveRoundResult>;
  overrideRoundScores?(
    scoreSheetId: string,
    input: UiOverrideRoundScoresInput,
  ): Awaitable<UiOverrideRoundScoresResult>;
  finalizeGame?(scoreSheetId: string, actorId: string, nowIso?: string): Awaitable<UiGameLifecycleResult>;
  reopenGame?(scoreSheetId: string, actorId: string, nowIso?: string): Awaitable<UiGameLifecycleResult>;
  heartbeatGameLock?(scoreSheetId: string): Awaitable<UiValidationResult>;
  releaseGameLock?(scoreSheetId: string): Awaitable<UiValidationResult>;
  forceReleaseGameLock?(scoreSheetId: string): Awaitable<UiValidationResult>;
}

function isPromiseLike<T>(value: Awaitable<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}

export function ScoreSheetScreen({
  scoreSheetId,
  shell,
  onHistory,
  actorId = 'local-user',
  actorRole,
}: {
  readonly scoreSheetId: string;
  readonly shell: ScoreSheetShellPort;
  readonly onHistory?: () => void;
  readonly actorId?: string;
  readonly actorRole?: WorkspaceRole;
}) {
  const [refreshVersion, refresh] = useReducer((value: number) => value + 1, 0);
  const [saveErrors, setSaveErrors] = useState<readonly string[]>([]);
  const [editingRoundNumber, setEditingRoundNumber] = useState<number | undefined>();
  const [lifecycleDialog, setLifecycleDialog] = useState<GameLifecycleDialogMode | undefined>();
  const [asyncOpened, setAsyncOpened] = useState<UiOpenSessionResult | undefined>();
  const [lockLost, setLockLost] = useState(false);
  const [forceReleasing, setForceReleasing] = useState(false);
  const openedRequest = useMemo(
    () => shell.openSession(scoreSheetId),
    [refreshVersion, scoreSheetId, shell],
  );

  useEffect(() => {
    let active = true;
    if (!isPromiseLike(openedRequest)) {
      setAsyncOpened(undefined);
      return () => {
        active = false;
      };
    }

    setAsyncOpened(undefined);
    openedRequest
      .then((result) => {
        if (active) setAsyncOpened(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setAsyncOpened({
          valid: false,
          errors: [reason instanceof Error ? reason.message : 'Game could not be loaded.'],
        });
      });
    return () => {
      active = false;
    };
  }, [openedRequest]);

  const opened = isPromiseLike(openedRequest) ? asyncOpened : openedRequest;
  const hasEditableOnlineLock = opened?.valid === true && opened.editAccess?.mode === 'editable';

  useEffect(() => {
    if (!hasEditableOnlineLock || shell.heartbeatGameLock === undefined) {
      setLockLost(false);
      return;
    }

    setLockLost(false);
    const heartbeat = () => {
      void Promise.resolve(shell.heartbeatGameLock?.(scoreSheetId))
        .then((result) => {
          if (result === undefined || result.valid) return;
          setLockLost(true);
          setSaveErrors(result.errors);
        })
        .catch((reason: unknown) => {
          setLockLost(true);
          setSaveErrors([reason instanceof Error ? reason.message : 'The editing lock was lost.']);
        });
    };
    const timer = window.setInterval(heartbeat, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [hasEditableOnlineLock, scoreSheetId, shell]);

  if (opened === undefined) {
    return (
      <section className="screen-stack" aria-live="polite">
        <h2>Loading game…</h2>
      </section>
    );
  }
  if (!opened.valid || opened.scoreSheet === undefined) {
    return (
      <section className="screen-stack">
        <h2>Score sheet unavailable</h2>
        <div className="error-summary" role="alert">{opened.errors.join('; ')}</div>
      </section>
    );
  }

  const model = buildScoreSheetViewModel(opened);
  const isCompleted = opened.scoreSheet.status === 'finalized';
  const isViewOnly = !isCompleted && (opened.editAccess?.mode === 'view-only' || lockLost);
  const canEdit = !isCompleted && !isViewOnly;
  const isFederation = opened.scoreSheet.gameInput.ruleSet === FEDERATION_2026;
  const ruleSet = isFederation ? 'Federation 2026' : 'House Rules V1';
  const players = model.players.map((player) => ({ id: player.id, name: player.name }));
  const existingTotals = Object.fromEntries(model.players.map((player) => [player.id, player.totalScore]));
  const currentRoundNumber = model.rounds.length + 1;
  const dealerIndex = (currentRoundNumber - 1) % players.length;
  const dealer = players[dealerIndex];
  const editingRound = editingRoundNumber === undefined
    ? undefined
    : model.rounds.find((round) => round.roundNumber === editingRoundNumber);
  const canFinish = canEdit && model.rounds.length >= 18 && shell.finalizeGame !== undefined;

  const saveCurrentRound = !canEdit || shell.saveRound === undefined
    ? undefined
    : async (draft: CurrentRoundDraft) => {
      const bidOwnerPlayerId = draft.bidding.bidOwnerPlayerId;
      if (!draft.bidding.confirmed || bidOwnerPlayerId === undefined || draft.trumpSuit === undefined) {
        setSaveErrors(['The accepted estimates must have a confirmed bid owner and selected trump.']);
        return;
      }

      const riskPlayerId = resolveAutomaticRiskPlayerId(draft);
      const multipleWithMultiplier = resolveMultipleWithRoundMultiplier(draft);
      const input: UiRoundEntryInput = {
        roundNumber: currentRoundNumber,
        bidOwnerPlayerId,
        riskPlayerId,
        multipleWithMultiplier,
        profile: isFederation ? federationProfile : houseRulesV1ScoringProfile,
        bids: players.map((player) => {
          const status = draft.bidding.statusByPlayerId[player.id] ?? 'normal';
          const bidType = status === 'with' ? 'with' as const : status === 'hold' ? 'hold' as const : 'normal' as const;
          return {
            playerId: player.id,
            bidType,
            tricks: draft.estimates[player.id] ?? 0,
            ...(player.id === bidOwnerPlayerId ? { trumpSuit: draft.trumpSuit } : {}),
            ...(status === 'with' ? { withTargetPlayerId: bidOwnerPlayerId } : {}),
          };
        }),
        actualResults: players.map((player) => ({
          playerId: player.id,
          actualTricks: draft.actuals[player.id] ?? 0,
        })),
      };

      try {
        const result = await Promise.resolve(shell.saveRound?.(scoreSheetId, input));
        if (result === undefined || !result.valid) {
          setSaveErrors(result?.errors ?? ['Round could not be saved.']);
          return;
        }
        setSaveErrors([]);
        if (currentRoundNumber === 18) setLifecycleDialog('round-18');
        refresh();
      } catch (reason: unknown) {
        setSaveErrors([reason instanceof Error ? reason.message : 'Round could not be saved.']);
      }
    };

  const submitScoreOverrides = !canEdit || editingRound === undefined || shell.overrideRoundScores === undefined
    ? undefined
    : async (overridesByPlayerId: Readonly<Record<string, number>>, reason: string) => {
      try {
        const result = await Promise.resolve(shell.overrideRoundScores?.(scoreSheetId, {
          roundNumber: editingRound.roundNumber,
          overridesByPlayerId,
          reason,
          actorId,
        }));
        if (result === undefined || !result.valid) {
          setSaveErrors(result?.errors ?? ['Score overrides could not be saved.']);
          return;
        }
        setSaveErrors([]);
        setEditingRoundNumber(undefined);
        refresh();
      } catch (failure: unknown) {
        setSaveErrors([failure instanceof Error ? failure.message : 'Score overrides could not be saved.']);
      }
    };

  async function confirmFinish() {
    try {
      const result = await Promise.resolve(shell.finalizeGame?.(scoreSheetId, actorId));
      if (result === undefined || !result.valid) {
        setSaveErrors(result?.errors ?? ['Game could not be completed.']);
        return;
      }
      setSaveErrors([]);
      setLifecycleDialog(undefined);
      refresh();
    } catch (reason: unknown) {
      setSaveErrors([reason instanceof Error ? reason.message : 'Game could not be completed.']);
    }
  }

  async function confirmReopen() {
    try {
      const result = await Promise.resolve(shell.reopenGame?.(scoreSheetId, actorId));
      if (result === undefined || !result.valid) {
        setSaveErrors(result?.errors ?? ['Game could not be reopened.']);
        return;
      }
      setSaveErrors([]);
      setLifecycleDialog(undefined);
      refresh();
    } catch (reason: unknown) {
      setSaveErrors([reason instanceof Error ? reason.message : 'Game could not be reopened.']);
    }
  }

  async function leaveToHistory() {
    try {
      if (hasEditableOnlineLock && shell.releaseGameLock !== undefined) {
        await Promise.resolve(shell.releaseGameLock(scoreSheetId));
      }
    } finally {
      onHistory?.();
    }
  }

  async function forceReleaseAndRetry() {
    if (shell.forceReleaseGameLock === undefined) return;
    setForceReleasing(true);
    try {
      const result = await Promise.resolve(shell.forceReleaseGameLock(scoreSheetId));
      if (!result.valid) {
        setSaveErrors(result.errors);
        return;
      }
      setSaveErrors([]);
      refresh();
    } catch (reason: unknown) {
      setSaveErrors([reason instanceof Error ? reason.message : 'The editing lock could not be released.']);
    } finally {
      setForceReleasing(false);
    }
  }

  return (
    <section className="score-sheet-screen">
      <header className="game-header">
        <div className="game-identity">
          <span className="game-suit-mark" aria-hidden="true">♠</span>
          <div>
            <h2>{model.name}</h2>
            <p>
              {ruleSet} <span aria-hidden="true">•</span> 4 Players <span aria-hidden="true">•</span> {model.rounds.length} Rounds
              {' '}<span aria-hidden="true">•</span> <strong>{isCompleted ? 'Completed' : 'In progress'}</strong>
            </p>
          </div>
        </div>

        <div className="game-header-actions">
          {canEdit && (
            <div className="round-dealer-card">
              <strong>Round {currentRoundNumber}</strong>
              <span><span aria-hidden="true">♟</span> Dealer: <b>{dealer?.name ?? '—'}</b></span>
            </div>
          )}
          {canFinish && (
            <button className="primary-button game-action-button" type="button" onClick={() => setLifecycleDialog('finish')}>
              Finish Game
            </button>
          )}
          {isCompleted && shell.reopenGame !== undefined && (
            <button className="primary-button game-action-button" type="button" onClick={() => setLifecycleDialog('reopen')}>
              Reopen Game
            </button>
          )}
          <button className="secondary-button game-action-button" type="button" onClick={() => void leaveToHistory()}>
            <span aria-hidden="true">◴</span> History
          </button>
        </div>
      </header>

      {isViewOnly && (
        <div className="lock-status" role="status">
          This game is view-only. {opened.editAccess?.reason ?? 'The editing lock is no longer available.'}
          {actorRole === 'admin' && shell.forceReleaseGameLock !== undefined && (
            <button
              className="secondary-button"
              type="button"
              disabled={forceReleasing}
              onClick={() => void forceReleaseAndRetry()}
            >
              {forceReleasing ? 'Releasing lockâ€¦' : 'Force Release & Edit'}
            </button>
          )}
        </div>
      )}
      {saveErrors.length > 0 && <div className="error-summary" role="alert">{saveErrors.join('; ')}</div>}

      <ScoreSheetTable
        model={model}
        onEditScores={!canEdit || shell.overrideRoundScores === undefined ? undefined : setEditingRoundNumber}
        currentRound={!canEdit ? undefined : (
          <CurrentRoundRow
            key={currentRoundNumber}
            roundNumber={currentRoundNumber}
            players={players}
            existingTotals={existingTotals}
            onSave={saveCurrentRound}
          />
        )}
      />

      {editingRound !== undefined && submitScoreOverrides !== undefined && (
        <ScoreOverrideDialog
          round={editingRound}
          players={players}
          onCancel={() => {
            setSaveErrors([]);
            setEditingRoundNumber(undefined);
          }}
          onSubmit={submitScoreOverrides}
        />
      )}

      {lifecycleDialog !== undefined && (
        <GameLifecycleDialog
          mode={lifecycleDialog}
          onCancel={() => setLifecycleDialog(undefined)}
          onContinue={lifecycleDialog === 'round-18' ? () => setLifecycleDialog(undefined) : undefined}
          onConfirm={lifecycleDialog === 'reopen' ? confirmReopen : confirmFinish}
        />
      )}

      <footer className="score-sheet-legend" aria-label="Score sheet legend">
        <div className="legend-group">
          <span><b className="legend-success">▲</b> Successful (Actual ≥ Estimated)</span>
          <span><b className="legend-failed">▼</b> Failed (Actual &lt; Estimated)</span>
        </div>
        <div className="legend-group">
          <span><b>R</b> Risk</span>
          <span><b>2R / 3R</b> Multi Risk</span>
          <span><b>W</b> With</span>
          <span><b>H</b> Hold</span>
        </div>
        <div className="legend-group legend-suits">
          <span><b>NT</b> No Trump</span>
          <span>♠ Spades</span>
          <span>♥ Hearts</span>
          <span>♦ Diamonds</span>
          <span>♣ Clubs</span>
        </div>
      </footer>
    </section>
  );
}
