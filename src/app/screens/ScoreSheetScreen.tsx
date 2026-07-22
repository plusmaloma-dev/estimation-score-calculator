import type { UiOpenSessionResult } from '../../index.js';
import { CurrentRoundRow } from '../components/CurrentRoundRow.js';
import { ScoreSheetTable } from '../components/ScoreSheetTable.js';
import { buildScoreSheetViewModel } from '../scoreSheet/scoreSheetViewModel.js';

export interface ScoreSheetShellPort {
  openSession(scoreSheetId: string): UiOpenSessionResult;
}

export function ScoreSheetScreen({
  scoreSheetId,
  shell,
}: {
  readonly scoreSheetId: string;
  readonly shell: ScoreSheetShellPort;
}) {
  const opened = shell.openSession(scoreSheetId);
  if (!opened.valid || opened.scoreSheet === undefined) {
    return (
      <section className="screen-stack">
        <h2>Score sheet unavailable</h2>
        <div className="error-summary" role="alert">{opened.errors.join('; ')}</div>
      </section>
    );
  }

  const model = buildScoreSheetViewModel(opened);
  const ruleSet = opened.scoreSheet.gameInput.ruleSet === 'FEDERATION_2026' ? 'Federation 2026' : 'House Rules V1';
  const players = model.players.map((player) => ({ id: player.id, name: player.name }));
  const existingTotals = Object.fromEntries(model.players.map((player) => [player.id, player.totalScore]));

  return (
    <section className="screen-stack score-sheet-screen">
      <div className="score-sheet-toolbar">
        <div>
          <h2>{model.name}</h2>
          <p>{ruleSet} · 4 players · {model.rounds.length} rounds</p>
        </div>
        <span className="rule-chip">{ruleSet}</span>
      </div>
      <ScoreSheetTable
        model={model}
        currentRound={(
          <CurrentRoundRow
            roundNumber={model.rounds.length + 1}
            players={players}
            existingTotals={existingTotals}
          />
        )}
      />
    </section>
  );
}
