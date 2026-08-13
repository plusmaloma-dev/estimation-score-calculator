import type { RiskType } from '../../scoring/types.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function statusLabel(
  status: 'success' | 'failed' | 'pending-rule',
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (status === 'success') return t('made');
  if (status === 'failed') return t('lost');
  return t('pendingRule');
}

function riskLabel(riskType: RiskType, t: ReturnType<typeof useI18n>['t']): string {
  switch (riskType) {
    case 'none': return t('none');
    case 'dash': return t('dash');
    case 'dash-call': return t('dashCall');
    case 'with': return t('with');
    case 'high-contract': return t('highContract');
    case 'round-risk': return t('roundRisk');
    case 'custom': return t('custom');
  }
}

function roleLabel(role: string, t: ReturnType<typeof useI18n>['t']): string | undefined {
  if (role === 'bid-owner') return t('caller');
  if (role === 'with-player') return t('with');
  return undefined;
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
  const scoreMultiplier = result.carriedAllLoserMultiplier ?? 1;

  return (
    <section className="gameplay-round-results" aria-labelledby="round-results-heading">
      <div className="gameplay-round-heading">
        <h3 id="round-results-heading">{t('round')} {snapshot.roundNumber} {t('results')}</h3>
        <div className="gameplay-result-summary">
          <span className="rule-chip">
            {roundType === 'over' ? t('over') : t('under')} · {result.bidValidation.totalEstimatedTricks} {t('estimatedTricks')}
          </span>
          <span className="rule-chip">{t('scoreMultiplier')} ×{scoreMultiplier}</span>
        </div>
      </div>

      <ul className="gameplay-result-list" aria-label={t('roundScores')}>
        {snapshot.players.map((player) => {
          const score = byPlayer.get(player.playerId);
          if (score === undefined) return null;
          return (
            <li key={player.seat} className="gameplay-result-card">
              <div className="gameplay-result-card-heading">
                <h4>{t('seat')} {player.seat + 1}</h4>
                <div>
                  {player.seat === snapshot.viewerSeat && <span>{t('you')}</span>}
                  {player.seat === snapshot.bidOwnerSeat && <span>{t('caller')}</span>}
                  {roleLabel(score.role, t) !== undefined && player.seat !== snapshot.bidOwnerSeat && (
                    <span>{roleLabel(score.role, t)}</span>
                  )}
                </div>
              </div>
              <dl>
                <div>
                  <dt>{t('estimate')}</dt>
                  <dd>{score.bidTricks}</dd>
                </div>
                <div>
                  <dt>{t('actualTricks')}</dt>
                  <dd>{score.actualTricks}</dd>
                </div>
                <div>
                  <dt>{t('outcome')}</dt>
                  <dd>{statusLabel(score.status, t)}</dd>
                </div>
                <div>
                  <dt>{t('score')}</dt>
                  <dd className={score.score < 0
                    ? 'gameplay-score--negative'
                    : 'gameplay-score--positive'}
                  >
                    {scoreLabel(score.score)}
                  </dd>
                </div>
                <div className="gameplay-result-card-risk">
                  <dt>{t('riskType')}</dt>
                  <dd>{riskLabel(score.riskType, t)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
