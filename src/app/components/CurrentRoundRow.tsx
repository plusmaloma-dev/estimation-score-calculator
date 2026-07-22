import { useReducer } from 'react';
import type { CurrentRoundDraft } from '../scoreSheet/currentRoundReducer.js';
import {
  createCurrentRoundDraft,
  currentRoundReducer,
  resolveHighestEstimatePlayerId,
  validateCurrentRoundDraft,
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
  existingTotals,
  onSave,
}: {
  readonly roundNumber: number;
  readonly players: readonly CurrentRoundPlayer[];
  readonly existingTotals: Readonly<Record<string, number>>;
  readonly onSave?: (draft: CurrentRoundDraft) => void;
}) {
  const [draft, dispatch] = useReducer(currentRoundReducer, players.map((player) => player.id), createCurrentRoundDraft);
  const errors = validateCurrentRoundDraft(draft);
  const saveUnavailable = onSave === undefined;
  const winnerPlayerId = resolveHighestEstimatePlayerId(draft);
  const overUnderLabel = draft.overUnder > 0 ? `+${draft.overUnder}` : String(draft.overUnder);
  const totalEstimates = draft.overUnder + 13;
  const hint = errors[0] ?? (saveUnavailable ? 'Round calculation and saving are being connected.' : undefined);

  return (
    <>
      <tr className="current-round-row">
        <th className="round-column" scope="row">
          <strong>{roundNumber}</strong>
          <small>Current</small>
        </th>
        {players.flatMap((player) => {
          const isWinner = winnerPlayerId === player.id;
          return [
            <td key={`${player.id}-estimate`} className={isWinner ? 'current-estimate current-estimate--winner' : 'current-estimate'}>
              <div className="current-cell">
                <input
                  className="estimate-input"
                  aria-label={`${player.name} estimate`}
                  type="number"
                  min="0"
                  max="13"
                  inputMode="numeric"
                  value={draft.estimates[player.id] ?? ''}
                  onChange={(event) => dispatch({ type: 'set-estimate', playerId: player.id, value: numberValue(event.target.value) })}
                />
                {isWinner && (
                  <select
                    className="trump-select"
                    aria-label={`${player.name} trump`}
                    value={draft.trumpSuit ?? ''}
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
            </td>,
            <td key={`${player.id}-actual`}>
              <input
                className="trick-input"
                aria-label={`${player.name} actual tricks`}
                type="number"
                min="0"
                max="13"
                inputMode="numeric"
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
          </div>
          <div className="round-action-panel">
            {hint !== undefined && <span className="current-round-hint">{hint}</span>}
            <button
              className="primary-button"
              type="button"
              disabled={errors.length > 0 || saveUnavailable}
              onClick={() => onSave?.(draft)}
            >
              Calculate and save →
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}