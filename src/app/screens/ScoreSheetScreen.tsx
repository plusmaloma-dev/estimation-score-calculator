import type { UiOpenSessionResult } from '../../index.js';
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

  return (
    <section className="screen-stack score-sheet-screen">
      <div className="score-sheet-toolbar">
        <div>
          <h2>{model.name}</h2>
          <p>{ruleSet} · 4 players · {model.rounds.length} rounds</p>
        </div>
        <span className="rule-chip">{ruleSet}</span>
      </div>
      <ScoreSheetTable model={model} />
      {model.rounds.length === 0 && <p className="empty-score-sheet">No completed rounds yet.</p>}
    </section>
  );
}
