import type { RiskType } from '../../scoring/types.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function statusLabel(status: 'success' | 'failed' | 'pending-rule'): string {
  if (status === 'success') return 'Success';
  if (status === 'failed') return 'Failed';
  return 'Pending rule';
}

function riskLabel(riskType: RiskType): string {
  switch (riskType) {
    case 'none': return 'None';
    case 'dash': return 'Dash';
    case 'dash-call': return 'Dash Call';
    case 'with': return 'WITH';
    case 'high-contract': return 'High contract';
    case 'round-risk': return 'Round risk';
    case 'custom': return 'Custom';
  }
}

export function GameplayRoundResultPanel({
  snapshot,
}: {
  readonly snapshot: OnlineGameplayRoundSnapshot;
}) {
  const { t } = useI18n();
  const result = snapshot.scoreResult;
  const scores = result?.scoreResult;
  const roundType = result?.bidValidation.roundType;
  if (
    snapshot.phase !== 'scored'
    || result?.valid !== true
    || scores?.valid !== true
    || roundType === undefined
  ) return null;

  const byPlayer = new Map(scores.playerScores.map((score) => [score.playerId, score]));

  return (
    <section className="gameplay-round-results" aria-labelledby="round-results-heading">
      <div className="gameplay-round-heading">
        <h3 id="round-results-heading">Round {snapshot.roundNumber} results</h3>
        <span className="rule-chip">
          {roundType === 'over' ? 'Over' : 'Under'} · {result.bidValidation.totalEstimatedTricks} estimated tricks
        </span>
      </div>

      <div className="gameplay-score-table-scroll">
        <table className="gameplay-score-table" aria-label={t('roundScores')}>
          <thead>
            <tr>
              <th scope="col">{t('seat')}</th>
              <th scope="col">{t('estimate')}</th>
              <th scope="col">{t('actualTricks')}</th>
              <th scope="col">{t('score')}</th>
              <th scope="col">{t('outcome')}</th>
              <th scope="col">{t('riskType')}</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.players.map((player) => {
              const score = byPlayer.get(player.playerId);
              if (score === undefined) return null;
              return (
                <tr key={player.seat}>
                  <th scope="row">Seat {player.seat + 1}</th>
                  <td>{score.bidTricks}</td>
                  <td>{score.actualTricks}</td>
                  <td className={score.score < 0 ? 'gameplay-score--negative' : 'gameplay-score--positive'}>
                    {scoreLabel(score.score)}
                  </td>
                  <td>{statusLabel(score.status)}</td>
                  <td>{riskLabel(score.riskType)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
