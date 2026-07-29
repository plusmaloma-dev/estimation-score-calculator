import type { Card, CardSuit, Rank } from '../../domain/card.js';
import { cardId } from '../../domain/card.js';
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

function isRedSuit(suit: CardSuit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

function cardClass(card: Card, legal: boolean): string {
  return [
    'playing-card',
    isRedSuit(card.suit) ? 'playing-card--red' : '',
    legal ? 'playing-card--legal' : '',
  ].filter(Boolean).join(' ');
}

function CardFace({ card }: { readonly card: Card }) {
  return (
    <>
      <span>{card.rank}</span>
      <span aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
    </>
  );
}

export function GameplayHand({
  ownHand,
  mode,
  legalCardIds,
  onPlay,
}: {
  readonly ownHand: readonly Card[];
  readonly mode: 'read-only' | 'disabled' | 'play';
  readonly legalCardIds: ReadonlySet<string>;
  readonly onPlay?: (card: Card) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <div
      className={`gameplay-hand gameplay-hand--${mode}`}
      role="group"
      aria-label={t('yourHand')}
    >
      {ownHand.map((card) => {
        const id = cardId(card);
        const legal = mode === 'play' && legalCardIds.has(id);
        const name = accessibleCardName(card);

        if (mode === 'read-only') {
          return (
            <span
              key={id}
              className={cardClass(card, false)}
              role="img"
              aria-label={name}
            >
              <CardFace card={card} />
            </span>
          );
        }

        return (
          <button
            key={id}
            type="button"
            className={cardClass(card, legal)}
            aria-label={name}
            disabled={!legal}
            onClick={() => onPlay === undefined ? undefined : void onPlay(card)}
          >
            <CardFace card={card} />
          </button>
        );
      })}
    </div>
  );
}
