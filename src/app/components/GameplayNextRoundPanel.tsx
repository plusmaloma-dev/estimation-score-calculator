import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { useI18n } from '../i18n/I18nContext.js';

export function GameplayNextRoundPanel({
  presentation,
  isHost,
  pending,
  error,
  onStartNextRound,
}: {
  readonly presentation: ActiveRoundPresentation;
  readonly isHost: boolean;
  readonly pending: boolean;
  readonly error?: string;
  readonly onStartNextRound: () => void;
}) {
  const { t } = useI18n();
  if (presentation.phase !== 'scored' || presentation.isSynchronizing) return null;

  return (
    <section className="gameplay-next-round-panel" aria-labelledby="next-round-heading">
      <div>
        <h3 id="next-round-heading">{t('nextRound')}</h3>
        {isHost && presentation.canStartNextRound ? (
          <p>{t('startNextRoundHostPrompt')}</p>
        ) : (
          <p>{t('waitingForHostNextRound')}</p>
        )}
      </div>
      {error !== undefined && (
        <p className="gameplay-next-round-error" role="alert">{error}</p>
      )}
      {isHost && presentation.canStartNextRound && (
        <button
          className="primary-button"
          type="button"
          disabled={pending}
          onClick={onStartNextRound}
        >
          {pending ? t('startingNextRound') : t('startNextRound')}
        </button>
      )}
    </section>
  );
}
