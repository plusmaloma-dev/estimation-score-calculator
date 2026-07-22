import { useReducer } from 'react';
import type { CurrentRoundDraft } from '../scoreSheet/currentRoundReducer.js';
import {
  createCurrentRoundDraft,
  currentRoundReducer,
  resolveAutomaticRiskPlayerId,
  resolveHighestEstimatePlayerId,
  resolveWithPlayerIds,
  validateAcceptedEstimates,
  validateActualTricks,
} from '../scoreSheet/currentRoundReducer.js';

export interface CurrentRoundPlayer {
  readonly id: string;
  readonly name: string;
}

function numberValue(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function CurrentRoundRow({
  roundNumber,
  players,
  biddingOrder,
  existingTotals,
  onSave,
}: {
  readonly roundNumber: number;
  readonly players: readonly CurrentRoundPlayer[];
  readonly biddingOrder?: readonly string[];
  readonly existingTotals: Readonly<Record<string, number>>;
  readonly onSave?: (draft: CurrentRoundDraft) => void;
}) {
  const draftOrder = biddingOrder ?? players.map((player) => player.id);
  const [draft, dispatch] = useReducer(currentRoundReducer, draftOrder, createCurrentRoundDraft);
  const isEstimating = draft.phase === 'estimating';
  const estimateErrors = validateAcceptedEstimates(draft);
  const actualErrors = validateActualTricks(draft);
  const winnerPlayerId = resolveHighestEstimatePlayerId(draft);
  const withPlayerIds = new Set(resolveWithPlayerIds(draft));
  const riskPlayerId = resolveAutomaticRiskPlayerId(draft);
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
          const annotations = [
            ...(withPlayerIds.has(player.id) ? ['W'] : []),
            ...(riskPlayerId === player.id ? ['R'] : []),
          ];
          return [
            <td key={`${player.id}-estimate`} className={isWinner ? 'current-estimate current-estimate--winner' : 'current-estimate'}>
              <div className="current-cell">
                <input
                  className="estimate-input"
                  aria-label={`${player.name} estimate`}
                  type="number"
                  min="0"
                  max="12"
                  inputMode="numeric"
                  disabled={!isEstimating}
                  value={draft.estimates[player.id] ?? ''}
                  onChange={(event) => dispatch({ type: 'set-estimate', playerId: player.id, value: numberValue(event.target.value) })}
                />
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
              <input
                className="trick-input"
                aria-label={`${player.name} actual tricks`}
                type="number"
                min="0"
                max="13"
                inputMode="numeric"
                disabled={isEstimating}
                value={draft.actuals[player.id] ?? ''}
                onChange={(event) => dispatch({ type: 'set-actual', playerId: player.id, value: numberValue(event.target.value) })}
              />
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
    </>
  );
}
