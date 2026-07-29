import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { useI18n } from '../i18n/I18nContext.js';

function actionMessage(
  presentation: ActiveRoundPresentation,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (presentation.phase) {
    case 'loading':
      return t('loadingActiveRound');
    case 'synchronizing':
      return t('synchronizingRoundState');
    case 'paused':
      return t('gamePaused');
    case 'scored':
      return t('roundScored');
    case 'terminated':
      return t('gameTerminated');
    default:
      break;
  }

  if (presentation.viewerActionRequired) {
    return presentation.actionKind === 'bid'
      ? t('submitYourEstimate')
      : t('playACard');
  }

  if (presentation.activeSeat !== undefined) {
    const seatNumber = presentation.activeSeat + 1;
    const automated = presentation.activeControlOwner !== 'human'
      || presentation.activeTurnStatus !== 'running';
    return automated
      ? `${t('standardBotInSeat')} ${seatNumber} ${t('isActing')}`
      : `${t('waitingForSeat')} ${seatNumber}`;
  }

  return t('waitingForAction');
}

export function GameplayActionBanner({
  presentation,
}: {
  readonly presentation: ActiveRoundPresentation;
}) {
  const { t } = useI18n();

  return (
    <section
      className={`gameplay-action-banner gameplay-action-banner--${presentation.phase}`}
      role="status"
      aria-live="polite"
    >
      <strong>{actionMessage(presentation, t)}</strong>
      {presentation.countdownSeconds !== undefined
        && presentation.phase !== 'loading'
        && presentation.phase !== 'synchronizing'
        && presentation.phase !== 'scored'
        && presentation.phase !== 'terminated' && (
          <span className="gameplay-countdown" aria-label={t('turnCountdown')}>
            {presentation.countdownSeconds} {t('seconds')}
          </span>
      )}
    </section>
  );
}
