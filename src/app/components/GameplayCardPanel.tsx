import type { Card, CardSuit, Rank } from '../../domain/card.js';
import { cardId } from '../../domain/card.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';

const SUIT_SYMBOLS: Readonly<Record<CardSuit, string>> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const RANK_LABELS: Readonly<Record<Rank, string>> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};

function accessibleCardName(card: Card): string {
  return `${RANK_LABELS[card.rank]} of ${card.suit}`;
}

function compactCardName(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

function isRedSuit(suit: CardSuit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function GameplayCardPanel({
  snapshot,
  busy,
  onPlay,
}: {
  readonly snapshot: OnlineGameplayRoundSnapshot;
  readonly busy: boolean;
  readonly onPlay: (card: Card) => Promise<void>;
}) {
  const { t } = useI18n();
  const legalIds = new Set(snapshot.legalCards.map((card) => cardId(card)));
  const isViewerTurn = snapshot.phase === 'playing'
    && snapshot.currentTurnSeat === snapshot.viewerSeat;
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
        <p role="status">{t('roundScored')}</p>
      ) : snapshot.phase !== 'playing' ? null : (
        <>
          <p role="status">
            {isViewerTurn ? t('yourCardTurn') : `Waiting for Seat ${(snapshot.currentTurnSeat ?? 0) + 1}`}
          </p>
          <div className="gameplay-hand" role="group" aria-label={t('yourHand')}>
            {snapshot.ownHand.map((card) => {
              const legal = isViewerTurn && legalIds.has(cardId(card));
              return (
                <button
                  key={cardId(card)}
                  type="button"
                  className={`playing-card${isRedSuit(card.suit) ? ' playing-card--red' : ''}${legal ? ' playing-card--legal' : ''}`}
                  aria-label={accessibleCardName(card)}
                  disabled={busy || !legal}
                  onClick={() => void onPlay(card)}
                >
                  <span>{card.rank}</span>
                  <span aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
