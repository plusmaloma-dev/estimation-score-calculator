import { useReducer, useState } from 'react';
import {
  FEDERATION_2026,
  houseRulesV1ScoringProfile,
  type ScoringProfile,
  type UiOpenSessionResult,
  type UiRoundEntryInput,
  type UiSaveRoundResult,
} from '../../index.js';
import { CurrentRoundRow } from '../components/CurrentRoundRow.js';
import { ScoreSheetTable } from '../components/ScoreSheetTable.js';
import type { CurrentRoundDraft } from '../scoreSheet/currentRoundReducer.js';
import { resolveHighestEstimatePlayerId } from '../scoreSheet/currentRoundReducer.js';
import { buildScoreSheetViewModel } from '../scoreSheet/scoreSheetViewModel.js';

const federationProfile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  ruleSet: FEDERATION_2026,
  highContractThreshold: 8,
};

export interface ScoreSheetShellPort {
  openSession(scoreSheetId: string): UiOpenSessionResult;
  saveRound?(scoreSheetId: string, input: UiRoundEntryInput, nowIso?: string): UiSaveRoundResult;
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
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const [saveErrors, setSaveErrors] = useState<readonly string[]>([]);
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
  const isFederation = opened.scoreSheet.gameInput.ruleSet === FEDERATION_2026;
  const ruleSet = isFederation ? 'Federation 2026' : 'House Rules V1';
  const players = model.players.map((player) => ({ id: player.id, name: player.name }));
  const existingTotals = Object.fromEntries(model.players.map((player) => [player.id, player.totalScore]));
  const currentRoundNumber = model.rounds.length + 1;
  const dealer = players[(currentRoundNumber - 1) % players.length];

  const saveCurrentRound = shell.saveRound === undefined
    ? undefined
    : (draft: CurrentRoundDraft) => {
      const bidOwnerPlayerId = resolveHighestEstimatePlayerId(draft);
      if (bidOwnerPlayerId === undefined || draft.trumpSuit === undefined) {
        setSaveErrors(['The accepted estimates must have one highest estimator and a selected trump.']);
        return;
      }

      const input: UiRoundEntryInput = {
        roundNumber: currentRoundNumber,
        bidOwnerPlayerId,
        profile: isFederation ? federationProfile : houseRulesV1ScoringProfile,
        bids: players.map((player) => ({
          playerId: player.id,
          bidType: 'normal' as const,
          tricks: draft.estimates[player.id] ?? 0,
          ...(player.id === bidOwnerPlayerId ? { trumpSuit: draft.trumpSuit } : {}),
        })),
        actualResults: players.map((player) => ({
          playerId: player.id,
          actualTricks: draft.actuals[player.id] ?? 0,
        })),
      };

      const result = shell.saveRound?.(scoreSheetId, input);
      if (result === undefined || !result.valid) {
        setSaveErrors(result?.errors ?? ['Round could not be saved.']);
        return;
      }

      setSaveErrors([]);
      refresh();
    };

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

      {saveErrors.length > 0 && <div className="error-summary" role="alert">{saveErrors.join('; ')}</div>}

      <ScoreSheetTable
        model={model}
        currentRound={(
          <CurrentRoundRow
            key={currentRoundNumber}
            roundNumber={currentRoundNumber}
            players={players}
            existingTotals={existingTotals}
            onSave={saveCurrentRound}
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
