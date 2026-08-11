import type { ContractSuit } from '../../domain/card.js';
import type { RiskType } from '../../scoring/types.js';
import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { useI18n } from '../i18n/I18nContext.js';
import type { TranslationKey } from '../i18n/translations.js';

function contractLabel(contract: ContractSuit | undefined, t: (key: TranslationKey) => string): string {
  if (contract === undefined) return t('pending');
  switch (contract) {
    case 'no-trump': return t('noTrump');
    case 'spades': return t('spades');
    case 'hearts': return t('hearts');
    case 'diamonds': return t('diamonds');
    case 'clubs': return t('clubs');
  }
}

function riskLabel(type: 'pending' | RiskType, t: (key: TranslationKey) => string): string {
  switch (type) {
    case 'pending': return t('pending');
    case 'none': return t('none');
    case 'dash': return t('dash');
    case 'dash-call': return t('dashCall');
    case 'with': return t('with');
    case 'high-contract': return t('highContract');
    case 'round-risk': return t('roundRisk');
    case 'custom': return t('custom');
  }
}

function balanceLabel(presentation: ActiveRoundPresentation, t: (key: TranslationKey) => string): string {
  if (presentation.estimateStatus === 'at-13') {
    return presentation.estimatesComplete
      ? t('atThirteen')
      : `${t('atThirteen')} · ${t('finalEstimateMustMove')}`;
  }
  const direction = presentation.estimateStatus === 'under' ? t('underBy') : t('overBy');
  return `${direction} ${presentation.estimateDistanceFrom13}`;
}

function phaseLabel(phase: ActiveRoundPresentation['phase'], t: (key: TranslationKey) => string): string {
  switch (phase) {
    case 'auction': return t('auction');
    case 'estimate': return t('estimate');
    case 'playing': return t('playing');
    case 'scored': return t('scored');
    case 'paused': return t('paused');
    case 'terminated': return t('terminated');
    case 'loading': return t('loadingActiveRound');
    case 'synchronizing': return t('synchronizingRoundState');
  }
}

function actionLabel(action: ActiveRoundPresentation['actionKind'], t: (key: TranslationKey) => string): string {
  switch (action) {
    case 'bid': return t('bid');
    case 'card': return t('card');
    case undefined: return t('pending');
  }
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
        <div className="gameplay-round-status__meta">
          <span className="rule-chip">{phaseLabel(presentation.phase, t)}</span>
          {presentation.activeSeat !== undefined && (
            <span className="rule-chip">
              {t('active')}: {t('seat')} {presentation.activeSeat + 1} · {actionLabel(presentation.actionKind, t)}
            </span>
          )}
          {presentation.phase !== 'paused'
            && presentation.phase !== 'scored'
            && presentation.countdownSeconds !== undefined
            && (
              <span className="rule-chip">
                {presentation.countdownSeconds} {t('seconds')}
              </span>
            )}
        </div>
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
          <dd>{contractLabel(presentation.trump, t)}</dd>
        </div>
        <div>
          <dt>{t('totalEstimates')}</dt>
          <dd>{presentation.totalEstimatedTricks}</dd>
        </div>
        <div className="gameplay-round-summary--balance">
          <dt>{t('underOver')}</dt>
          <dd>{balanceLabel(presentation, t)}</dd>
        </div>
        <div>
          <dt>{t('risk')}</dt>
          <dd>
            {presentation.risk === undefined
              ? t('pending')
              : `${t('seat')} ${presentation.risk.seat + 1} · ${riskLabel(presentation.risk.type, t)}`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
