import type { Card, CardSuit } from '../../domain/card.js';
import { cardId } from '../../domain/card.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';
import { GameplayHand } from './GameplayHand.js';
import { GameplayRoundResultPanel } from './GameplayRoundResultPanel.js';

const SUIT_SYMBOLS: Readonly<Record<CardSuit, string>> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

function compactCardName(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

function isRedSuit(suit: CardSuit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function GameplayCardPanel({
  snapshot,
  canPlay,
  busy,
  onPlay,
}: {
  readonly snapshot: OnlineGameplayRoundSnapshot;
  readonly canPlay: boolean;
  readonly busy: boolean;
  readonly onPlay: (card: Card) => Promise<void>;
}) {
  const { t } = useI18n();
  const legalIds = new Set(snapshot.legalCards.map((card) => cardId(card)));
  const completedTrickCount = snapshot.completedTricks.at(-1)?.trickNumber ?? 0;

  return (
    <section className="gameplay-card-panel" aria-labelledby="card-play-heading">
      <div className="gameplay-round-heading">
        <h3 id="card-play-heading">{t('cardPlay')}</h3>
        <span className="rule-chip">
          {completedTrickCount} of 13 tricks completed
        </span>
      </div>

      <section className="gameplay-current-trick" aria-labelledby="current-trick-heading">
        <h4 id="current-trick-heading">{t('currentTrick')}</h4>
        {snapshot.currentTrick.length === 0 ? (
          <p>{t('waitingForLead')}</p>
        ) : (
          <ol aria-label="Current trick cards">
            {snapshot.currentTrick.map((entry) => (
              <li key={`${entry.seat}:${cardId(entry.card)}`}>
                <span>Seat {entry.seat + 1}</span>
                <strong className={isRedSuit(entry.card.suit) ? 'playing-card--red' : ''}>
                  {compactCardName(entry.card)}
                </strong>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="gameplay-trick-totals" aria-label="Tricks won">
        {snapshot.players.map((player) => (
          <span key={player.seat}>Seat {player.seat + 1}: {player.actualTricks}</span>
        ))}
      </div>

      {snapshot.phase === 'scored' ? (
        <GameplayRoundResultPanel snapshot={snapshot} />
      ) : snapshot.phase !== 'playing' ? null : (
        <GameplayHand
          ownHand={snapshot.ownHand}
          mode={canPlay && !busy ? 'play' : 'disabled'}
          legalCardIds={legalIds}
          onPlay={onPlay}
        />
      )}
    </section>
  );
}
