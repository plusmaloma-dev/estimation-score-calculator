import type { CardSuit } from '../../domain/card.js';
import type { CompletedGameplayTrick } from '../../gameplay/types.js';
import { useI18n } from '../i18n/I18nContext.js';

const SUIT_SYMBOLS: Readonly<Record<CardSuit, string>> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function GameplayFinalTrick({
  trick,
}: {
  readonly trick: CompletedGameplayTrick;
}) {
  const { t } = useI18n();

  return (
    <section className="gameplay-final-trick" aria-labelledby="final-trick-heading">
      <h4 id="final-trick-heading">
        {t('finalTrick')} · {t('trick')} {trick.trickNumber}
      </h4>
      <ol aria-label={t('finalTrickCards')}>
        {trick.entries.map((entry) => {
          const winner = entry.seat === trick.winnerSeat;
          return (
            <li
              key={entry.seat}
              className={winner ? 'gameplay-final-trick--winner' : ''}
            >
              <span>{t('seat')} {entry.seat + 1}</span>
              <strong className={entry.card.suit === 'hearts' || entry.card.suit === 'diamonds'
                ? 'playing-card--red'
                : ''}
              >
                {entry.card.rank}{SUIT_SYMBOLS[entry.card.suit]}
              </strong>
              {winner && <small>{t('winner')}</small>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
