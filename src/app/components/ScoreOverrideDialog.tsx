import { useMemo, useState } from 'react';
import type { ScoreSheetRoundView } from '../scoreSheet/scoreSheetViewModel.js';

export interface ScoreOverrideDialogPlayer {
  readonly id: string;
  readonly name: string;
}

export function ScoreOverrideDialog({
  round,
  players,
  onCancel,
  onSubmit,
}: {
  readonly round: ScoreSheetRoundView;
  readonly players: readonly ScoreOverrideDialogPlayer[];
  readonly onCancel: () => void;
  readonly onSubmit: (overridesByPlayerId: Readonly<Record<string, number>>, reason: string) => void;
}) {
  const [valuesByPlayerId, setValuesByPlayerId] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(round.cells.map((cell) => [cell.playerId, String(cell.appliedScore)])),
  );
  const [reason, setReason] = useState('');
  const cellByPlayerId = useMemo(
    () => new Map(round.cells.map((cell) => [cell.playerId, cell])),
    [round.cells],
  );

  const parsedByPlayerId = Object.fromEntries(players.map((player) => {
    const raw = valuesByPlayerId[player.id] ?? '';
    const parsed = Number(raw);
    return [player.id, raw.trim() !== '' && Number.isInteger(parsed) ? parsed : undefined];
  })) as Readonly<Record<string, number | undefined>>;
  const allValuesAreIntegers = players.every((player) => parsedByPlayerId[player.id] !== undefined);
  const changedScores = Object.fromEntries(players.flatMap((player) => {
    const value = parsedByPlayerId[player.id];
    const cell = cellByPlayerId.get(player.id);
    return value !== undefined && cell !== undefined && value !== cell.appliedScore
      ? [[player.id, value] as const]
      : [];
  }));
  const canSave = reason.trim().length > 0
    && allValuesAreIntegers
    && Object.keys(changedScores).length > 0;

  return (
    <div className="score-override-backdrop">
      <section
        className="score-override-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit scores for round ${round.roundNumber}`}
      >
        <header className="score-override-header">
          <div>
            <h3>Edit scores — Round {round.roundNumber}</h3>
            <p>The original calculated scores remain in the audit history.</p>
          </div>
          <button type="button" className="dialog-close-button" aria-label="Cancel score editing" onClick={onCancel}>×</button>
        </header>

        <div className="score-override-player-list">
          {players.map((player) => {
            const cell = cellByPlayerId.get(player.id);
            if (cell === undefined) return null;
            return (
              <div className="score-override-player" key={player.id}>
                <div className="score-override-player__identity">
                  <strong>{player.name}</strong>
                  <span>Calculated: {cell.calculatedScore}</span>
                  <span>Currently applied: {cell.appliedScore}</span>
                  {cell.overridden && <b className="override-status">Edited</b>}
                </div>
                <label>
                  Applied score
                  <input
                    type="number"
                    step="1"
                    aria-label={`${player.name} applied score`}
                    value={valuesByPlayerId[player.id] ?? ''}
                    onChange={(event) => setValuesByPlayerId((current) => ({
                      ...current,
                      [player.id]: event.target.value,
                    }))}
                  />
                </label>
                <button
                  type="button"
                  className="restore-score-button"
                  aria-label={`Restore ${player.name} original score`}
                  disabled={!cell.overridden && cell.appliedScore === cell.calculatedScore}
                  onClick={() => setValuesByPlayerId((current) => ({
                    ...current,
                    [player.id]: String(cell.calculatedScore),
                  }))}
                >
                  Restore original
                </button>
              </div>
            );
          })}
        </div>

        <label className="score-override-reason">
          Override reason
          <textarea
            aria-label="Override reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required: explain why the score is being changed"
          />
        </label>

        <footer className="score-override-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary-button"
            aria-label="Save score overrides"
            disabled={!canSave}
            onClick={() => onSubmit(changedScores, reason.trim())}
          >
            Save changes
          </button>
        </footer>
      </section>
    </div>
  );
}
