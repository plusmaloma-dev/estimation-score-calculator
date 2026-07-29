import type { ContractSuit } from '../../domain/card.js';
import type { RiskType } from '../../scoring/types.js';
import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { useI18n } from '../i18n/I18nContext.js';

function contractLabel(contract: ContractSuit | undefined): string {
  if (contract === undefined) return 'Pending';
  if (contract === 'no-trump') return 'No Trump';
  return contract[0]!.toUpperCase() + contract.slice(1);
}

function riskLabel(type: 'pending' | RiskType): string {
  if (type === 'pending') return 'Pending';
  if (type === 'round-risk') return 'Round risk';
  return type.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join(' ');
}

function balanceLabel(presentation: ActiveRoundPresentation): string {
  if (presentation.estimateStatus === 'at-13') {
    return presentation.estimatesComplete
      ? 'At 13'
      : 'At 13 · final estimate must move Under or Over';
  }
  const direction = presentation.estimateStatus === 'under' ? 'Under' : 'Over';
  return `${direction} by ${presentation.estimateDistanceFrom13}`;
}

export function GameplayRoundStatus({
  presentation,
}: {
  readonly presentation: ActiveRoundPresentation;
}) {
  const { t } = useI18n();
  const controlBySeat = new Map(
    presentation.seatControls.map((control) => [control.seat, control]),
  );

  return (
    <section className="gameplay-round-status" aria-labelledby="round-status-heading">
      <div className="gameplay-round-heading">
        <h3 id="round-status-heading">
          {t('round')} {presentation.roundNumber ?? '—'}
        </h3>
      </div>

      <ul className="gameplay-estimate-list" aria-label={t('estimatesBySeat')}>
        {presentation.estimatesBySeat.map((estimate) => {
          const control = controlBySeat.get(estimate.seat);
          return (
            <li
              key={estimate.seat}
              className={presentation.activeSeat === estimate.seat
                ? 'gameplay-estimate--active'
                : ''}
            >
              <span>
                {t('seat')} {estimate.seat + 1}
                {estimate.isViewer ? ` · ${t('you')}` : ''}
              </span>
              <strong>{estimate.estimate ?? t('pending')}</strong>
              <small>
                {estimate.isCaller ? t('caller') : ''}
                {control?.seatKind === 'bot'
                  ? `${estimate.isCaller ? ' · ' : ''}${t('standardBot')}`
                  : ''}
              </small>
            </li>
          );
        })}
      </ul>

      <dl
        className="gameplay-round-summary"
        role="group"
        aria-label={t('roundEstimateSummary')}
      >
        <div>
          <dt>{t('caller')}</dt>
          <dd>
            {presentation.callerSeat === undefined
              ? t('pending')
              : `${t('seat')} ${presentation.callerSeat + 1}`}
          </dd>
        </div>
        <div>
          <dt>{t('callerEstimate')}</dt>
          <dd>{presentation.callerEstimate ?? t('pending')}</dd>
        </div>
        <div>
          <dt>{t('trump')}</dt>
          <dd>{contractLabel(presentation.trump)}</dd>
        </div>
        <div>
          <dt>{t('totalEstimates')}</dt>
          <dd>{presentation.totalEstimatedTricks}</dd>
        </div>
        <div className="gameplay-round-summary--balance">
          <dt>{t('underOver')}</dt>
          <dd>{balanceLabel(presentation)}</dd>
        </div>
        <div>
          <dt>{t('risk')}</dt>
          <dd>
            {presentation.risk === undefined
              ? t('pending')
              : `${t('seat')} ${presentation.risk.seat + 1} · ${riskLabel(presentation.risk.type)}`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
