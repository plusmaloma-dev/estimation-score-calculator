import { useReducer } from 'react';
import type { CurrentRoundDraft } from '../scoreSheet/currentRoundReducer.js';
import {
  createCurrentRoundDraft,
  currentRoundReducer,
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
  const overUnderLabel = draft.overUnder > 0 ? `+${draft.overUnder}` : String(draft.overUnder);
  const hint = errors[0] ?? (saveUnavailable ? 'Round calculation and saving are being connected.' : undefined);

  return (
    <>
      <tr className="current-round-row">
        <th className="round-column" scope="row">
          <span>{roundNumber}</span>
          <small>Current</small>
        </th>
        {players.flatMap((player) => [
          <td key={`${player.id}-estimate`}>
            <div className="current-cell">
              <input
                aria-label={`${player.name} estimate`}
                type="number"
                min="0"
                max="13"
                value={draft.estimates[player.id] ?? ''}
                onChange={(event) => dispatch({ type: 'set-estimate', playerId: player.id, value: numberValue(event.target.value) })}
              />
              <label className="bid-owner-control">
                <input
                  type="radio"
                  name="bid-owner"
                  checked={draft.bidOwnerPlayerId === player.id}
                  onChange={() => dispatch({ type: 'set-bid-owner', playerId: player.id })}
                />
                Winner
              </label>
              {draft.bidOwnerPlayerId === player.id && (
                <select
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
              value={draft.actuals[player.id] ?? ''}
              onChange={(event) => dispatch({ type: 'set-actual', playerId: player.id, value: numberValue(event.target.value) })}
            />
          </td>,
          <td key={`${player.id}-round`}>—</td>,
          <td key={`${player.id}-total`}>{existingTotals[player.id] ?? 0}</td>,
        ])}
        <td className="ou-column">O/U {overUnderLabel}</td>
      </tr>
      <tr className="current-round-actions">
        <td colSpan={18}>
          {hint !== undefined && <span className="current-round-hint">{hint}</span>}
          <button
            className="primary-button"
            type="button"
            disabled={errors.length > 0 || saveUnavailable}
            onClick={() => onSave?.(draft)}
          >
            Calculate and save
          </button>
        </td>
      </tr>
    </>
  );
}
