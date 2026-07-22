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
  onHistory,
  onNewRound,
}: {
  readonly scoreSheetId: string;
  readonly shell: ScoreSheetShellPort;
  readonly onHistory?: () => void;
  readonly onNewRound?: () => void;
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
  const currentRoundNumber = model.rounds.length + 1;
  const dealer = players[(currentRoundNumber - 1) % players.length];

  return (
    <section className="score-sheet-screen">
      <header className="game-header">
        <div className="game-identity">
          <span className="game-suit-mark" aria-hidden="true">♠</span>
          <div>
            <h2>{model.name}</h2>
            <p>{ruleSet} <span aria-hidden="true">•</span> 4 Players <span aria-hidden="true">•</span> {model.rounds.length} Rounds</p>
          </div>
        </div>

        <div className="game-header-actions">
          <div className="round-dealer-card">
            <strong>Round {currentRoundNumber}</strong>
            <span><span aria-hidden="true">♟</span> Dealer: <b>{dealer?.name ?? '—'}</b></span>
          </div>
          <button className="secondary-button game-action-button" type="button" onClick={onHistory}>
            <span aria-hidden="true">◴</span> History
          </button>
          <button className="primary-button game-action-button" type="button" onClick={onNewRound}>
            <span aria-hidden="true">＋</span> New Round
          </button>
        </div>
      </header>

      <ScoreSheetTable
        model={model}
        currentRound={(
          <CurrentRoundRow
            roundNumber={currentRoundNumber}
            players={players}
            existingTotals={existingTotals}
          />
        )}
      />

      <footer className="score-sheet-legend" aria-label="Score sheet legend">
        <div className="legend-group">
          <span><b className="legend-success">▲</b> Successful (Actual ≥ Estimated)</span>
          <span><b className="legend-failed">▼</b> Failed (Actual &lt; Estimated)</span>
        </div>
        <div className="legend-group">
          <span><b>R</b> Risk</span>
          <span><b>2R / 3R</b> Multi Risk</span>
          <span><b>W</b> With</span>
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