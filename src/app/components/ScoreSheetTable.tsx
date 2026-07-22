import type { ReactNode } from 'react';
import { RankingBadge } from './RankingBadge.js';
import type { ScoreSheetViewModel } from '../scoreSheet/scoreSheetViewModel.js';

function formatScore(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function ScoreSheetTable({
  model,
  currentRound,
}: {
  readonly model: ScoreSheetViewModel;
  readonly currentRound?: ReactNode;
}) {
  return (
    <div className="score-sheet-scroll" tabIndex={0} aria-label="Scrollable score sheet">
      <table className="score-sheet-table" aria-label={`${model.name} score sheet`}>
        <thead>
          <tr>
            <th className="round-column" rowSpan={2}>Rnd</th>
            {model.players.map((player) => (
              <th key={player.id} colSpan={4} className="player-heading">
                <div className="player-heading__content">
                  <RankingBadge title={player.rankTitle} />
                  <span className="player-heading__name">{player.name}</span>
                  <strong>Total {player.totalScore}</strong>
                </div>
              </th>
            ))}
            <th className="ou-column" rowSpan={2}>O/U</th>
          </tr>
          <tr>
            {model.players.flatMap((player) => [
              <th key={`${player.id}-estimate`}>Estimate</th>,
              <th key={`${player.id}-actual`}>Actual</th>,
              <th key={`${player.id}-round`}>Round</th>,
              <th key={`${player.id}-total`}>Total</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {model.rounds.map((round) => (
            <tr key={round.roundNumber}>
              <th className="round-column" scope="row">{round.roundNumber}</th>
              {round.cells.flatMap((cell) => [
                <td key={`${round.roundNumber}-${cell.playerId}-estimate`} className={cell.successful ? 'score-success' : 'score-failed'}>
                  <span aria-hidden="true">{cell.successful ? '▲' : '▼'}</span> {cell.estimateLabel}
                </td>,
                <td key={`${round.roundNumber}-${cell.playerId}-actual`}>{cell.actualTricks}</td>,
                <td key={`${round.roundNumber}-${cell.playerId}-round`} className={cell.roundScore >= 0 ? 'score-positive' : 'score-negative'}>{formatScore(cell.roundScore)}</td>,
                <td key={`${round.roundNumber}-${cell.playerId}-total`}>{cell.cumulativeScore}</td>,
              ])}
              <td className="ou-column">{round.overUnder}</td>
            </tr>
          ))}
          {currentRound}
        </tbody>
      </table>
    </div>
  );
}
