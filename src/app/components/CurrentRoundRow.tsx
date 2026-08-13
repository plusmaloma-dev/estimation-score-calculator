import { useEffect, useReducer, useState } from 'react';
import { useMobilePortraitScoreSheet, useMobileScoreEntry } from '../mobile/deviceMode.js';
import type { CurrentRoundDraft } from '../scoreSheet/currentRoundReducer.js';
import {
  createCurrentRoundDraft,
  currentRoundReducer,
  resolveAutomaticRiskPlayerId,
  resolveHighestEstimatePlayerId,
  resolveHoldPlayerIds,
  resolveMultipleWithRoundMultiplier,
  resolveWithPlayerIds,
  validateAcceptedEstimates,
  validateActualTricks,
} from '../scoreSheet/currentRoundReducer.js';
import { NumberPickerDialog } from './NumberPickerDialog.js';

export interface CurrentRoundPlayer {
  readonly id: string;
  readonly name: string;
}

interface NumberPickerTarget {
  readonly playerId: string;
  readonly playerName: string;
  readonly entryType: 'estimate' | 'actual';
}

function numberValue(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function CurrentRoundRow({
  roundNumber,
  players,
  existingTotals,
  onSave,
}: {
  readonly roundNumber: number;
  readonly players: readonly CurrentRoundPlayer[];
  readonly existingTotals: Readonly<Record<string, number>>;
  readonly onSave?: (draft: CurrentRoundDraft) => void;
}) {
  const playerOrder = players.map((player) => player.id);
  const [draft, dispatch] = useReducer(currentRoundReducer, playerOrder, createCurrentRoundDraft);
  const mobileEntry = useMobileScoreEntry();
  const mobilePortrait = useMobilePortraitScoreSheet();
  const [numberPickerTarget, setNumberPickerTarget] = useState<NumberPickerTarget | undefined>();

  useEffect(() => {
    if (mobilePortrait || !mobileEntry) setNumberPickerTarget(undefined);
  }, [mobileEntry, mobilePortrait]);

  const isEstimating = draft.phase === 'estimating';
  const estimateErrors = validateAcceptedEstimates(draft);
  const actualErrors = validateActualTricks(draft);
  const winnerPlayerId = resolveHighestEstimatePlayerId(draft);
  const withPlayerIds = new Set(resolveWithPlayerIds(draft));
  const holdPlayerIds = new Set(resolveHoldPlayerIds(draft));
  const riskPlayerId = resolveAutomaticRiskPlayerId(draft);
  const multipleWithMultiplier = resolveMultipleWithRoundMultiplier(draft);
  const overUnderLabel = draft.overUnder > 0 ? `+${draft.overUnder}` : String(draft.overUnder);
  const totalEstimates = draft.overUnder + 13;
  const hint = isEstimating
    ? estimateErrors[0]
    : actualErrors[0] ?? (onSave === undefined ? 'Round calculation and saving are being connected.' : undefined);

  return (
    <>
      <tr className={isEstimating ? 'current-round-row' : 'current-round-row current-round-row--accepted'}>
        <th className="round-column" scope="row">
          <strong>{roundNumber}</strong>
          <small>{isEstimating ? 'Current' : 'Accepted'}</small>
        </th>
        {players.flatMap((player) => {
          const isWinner = winnerPlayerId === player.id;
          const estimate = draft.estimates[player.id] ?? 0;
          const isHold = holdPlayerIds.has(player.id);
          const canToggleHold = isEstimating && !isWinner && estimate > 0;
          const annotations = [
            ...(withPlayerIds.has(player.id) ? ['W'] : []),
            ...(holdPlayerIds.has(player.id) ? ['H'] : []),
            ...(riskPlayerId === player.id ? ['R'] : []),
          ];
          return [
            <td key={`${player.id}-estimate`} className={isWinner ? 'current-estimate current-estimate--winner' : 'current-estimate'}>
              <div className="current-cell">
                {mobileEntry ? (
                  <button
                    className="estimate-input number-picker-trigger"
                    aria-label={`${player.name} estimate`}
                    type="button"
                    disabled={!isEstimating}
                    onClick={() => setNumberPickerTarget({
                      playerId: player.id,
                      playerName: player.name,
                      entryType: 'estimate',
                    })}
                  >
                    {draft.estimates[player.id] ?? '—'}
                  </button>
                ) : (
                  <input
                    className="estimate-input"
                    aria-label={`${player.name} estimate`}
                    type="number"
                    min="0"
                    max="12"
                    inputMode="numeric"
                    disabled={!isEstimating}
                    value={draft.estimates[player.id] ?? ''}
                    onChange={(event) => dispatch({
                      type: 'set-estimate',
                      playerId: player.id,
                      value: numberValue(event.target.value),
                    })}
                  />
                )}
                {canToggleHold && (
                  <button
                    type="button"
                    className={isHold ? 'hold-toggle hold-toggle--selected' : 'hold-toggle'}
                    aria-label={`${player.name} Hold`}
                    aria-pressed={isHold}
                    onClick={() => dispatch({ type: 'toggle-hold', playerId: player.id })}
                  >
                    H
                  </button>
                )}
                {isWinner && (
                  <select
                    className="trump-select"
                    aria-label={`${player.name} trump`}
                    value={draft.trumpSuit ?? ''}
                    disabled={!isEstimating}
                    onChange={(event) => dispatch({ type: 'set-trump', suit: event.target.value as 'no-trump' | 'spades' | 'hearts' | 'diamonds' | 'clubs' })}
                  >
                    <option value="">Trump</option>
                    <option value="no-trump">NT</option>
                    <option value="spades">♠</option>
                    <option value="hearts">♥</option>
                    <option value="diamonds">♦</option>
                    <option value="clubs">♣</option>
                  </select>
                )}
              </div>
              {annotations.length > 0 && (
                <span className="estimate-annotations" aria-label={`${player.name} estimate annotations`}>
                  {annotations.join(' ')}
                </span>
              )}
            </td>,
            <td key={`${player.id}-actual`}>
              {mobileEntry ? (
                <button
                  className="trick-input number-picker-trigger"
                  aria-label={`${player.name} actual tricks`}
                  type="button"
                  disabled={isEstimating}
                  onClick={() => setNumberPickerTarget({
                    playerId: player.id,
                    playerName: player.name,
                    entryType: 'actual',
                  })}
                >
                  {draft.actuals[player.id] ?? '—'}
                </button>
              ) : (
                <input
                  className="trick-input"
                  aria-label={`${player.name} actual tricks`}
                  type="number"
                  min="0"
                  max="13"
                  inputMode="numeric"
                  disabled={isEstimating}
                  value={draft.actuals[player.id] ?? ''}
                  onChange={(event) => dispatch({
                    type: 'set-actual',
                    playerId: player.id,
                    value: numberValue(event.target.value),
                  })}
                />
              )}
            </td>,
            <td key={`${player.id}-round`} className="pending-score">—</td>,
            <td key={`${player.id}-total`} className="running-total">{existingTotals[player.id] ?? 0}</td>,
          ];
        })}
        <td className="ou-column current-ou">{overUnderLabel}</td>
      </tr>
      <tr className="current-round-actions">
        <td colSpan={18}>
          <div className="round-summary">
            <span>Total estimates: <strong>{totalEstimates}</strong></span>
            <span>O/U ({totalEstimates} − 13) = <strong>{overUnderLabel}</strong></span>
            {multipleWithMultiplier === 2 && <span className="multiple-with-label">Multiple WITH: ×2</span>}
            {!isEstimating && <span className="accepted-bid-label">Estimates accepted and frozen</span>}
          </div>
          <div className="round-action-panel">
            {hint !== undefined && <span className="current-round-hint">{hint}</span>}
            {isEstimating ? (
              <button
                className="primary-button"
                type="button"
                disabled={estimateErrors.length > 0}
                onClick={() => dispatch({ type: 'accept-estimates' })}
              >
                Accept estimates <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                disabled={actualErrors.length > 0 || onSave === undefined}
                onClick={() => onSave?.(draft)}
              >
                Calculate scores <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </td>
      </tr>
      {numberPickerTarget !== undefined && !mobilePortrait && (
        <NumberPickerDialog
          title={`${numberPickerTarget.playerName} — ${
            numberPickerTarget.entryType === 'estimate' ? 'Estimate' : 'Actual tricks'
          }`}
          value={numberPickerTarget.entryType === 'estimate'
            ? draft.estimates[numberPickerTarget.playerId]
            : draft.actuals[numberPickerTarget.playerId]}
          max={numberPickerTarget.entryType === 'estimate' ? 12 : 13}
          onSelect={(value) => {
            dispatch(numberPickerTarget.entryType === 'estimate'
              ? { type: 'set-estimate', playerId: numberPickerTarget.playerId, value }
              : { type: 'set-actual', playerId: numberPickerTarget.playerId, value });
            setNumberPickerTarget(undefined);
          }}
          onClear={() => {
            dispatch(numberPickerTarget.entryType === 'estimate'
              ? { type: 'set-estimate', playerId: numberPickerTarget.playerId, value: undefined }
              : { type: 'set-actual', playerId: numberPickerTarget.playerId, value: undefined });
            setNumberPickerTarget(undefined);
          }}
          onCancel={() => setNumberPickerTarget(undefined)}
        />
      )}
    </>
  );
}
