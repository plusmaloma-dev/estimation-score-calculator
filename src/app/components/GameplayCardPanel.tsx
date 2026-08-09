import type { Card, CardSuit, ContractSuit } from '../../domain/card.js';
import { cardId } from '../../domain/card.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';
import { GameplayFinalTrick } from './GameplayFinalTrick.js';
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

function suitLabel(suit: CardSuit, t: ReturnType<typeof useI18n>['t']): string {
  switch (suit) {
    case 'spades': return t('spades');
    case 'hearts': return t('hearts');
    case 'diamonds': return t('diamonds');
    case 'clubs': return t('clubs');
  }
}

function currentContract(snapshot: OnlineGameplayRoundSnapshot): ContractSuit | undefined {
  return snapshot.players.find((player) => player.seat === snapshot.bidOwnerSeat)?.bid?.trumpSuit;
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
  const lastCompletedTrick = snapshot.completedTricks.at(-1);
  const leadSuit = snapshot.currentTrick[0]?.card.suit;
  const contractSuit = currentContract(snapshot);

  return (
    <section className="gameplay-card-panel" aria-labelledby="card-play-heading">
      <div className="gameplay-round-heading">
        <h3 id="card-play-heading">{t('cardPlay')}</h3>
        <span className="rule-chip">
          {completedTrickCount} {t('tricksCompleted')}
        </span>
      </div>

      {snapshot.phase === 'playing' && (
        <section className="gameplay-current-trick" aria-labelledby="current-trick-heading">
          <h4 id="current-trick-heading">{t('currentTrick')}</h4>
          <p>
            {leadSuit === undefined
              ? t('waitingForFirstCard')
              : `${t('suitToFollow')}: ${suitLabel(leadSuit, t)}`}
          </p>
          <table aria-label={t('currentTrickCards')} className="gameplay-current-trick-table">
            <caption>
              {leadSuit === undefined
                ? t('waitingForFirstCard')
                : `${t('suitToFollow')}: ${suitLabel(leadSuit, t)}`}
            </caption>
            <thead>
              <tr>
                <th>{t('seat')}</th>
                <th>{t('card')}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.players.map((player) => {
                const entry = snapshot.currentTrick.find((candidate) => candidate.seat === player.seat);
                return (
                  <tr key={player.seat}>
                    <th scope="row">{t('seat')} {player.seat + 1}</th>
                    <td>
                      {entry === undefined ? (
                        <span>{t('waiting')}</span>
                      ) : (
                        <strong className={isRedSuit(entry.card.suit) ? 'playing-card--red' : ''}>
                          {compactCardName(entry.card)}
                        </strong>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {snapshot.phase === 'playing' && lastCompletedTrick !== undefined && (
        <GameplayFinalTrick trick={lastCompletedTrick} label="last-completed" />
      )}

      <div className="gameplay-trick-totals" aria-label={t('tricksWon')}>
        {snapshot.players.map((player) => (
          <span key={player.seat}>{t('seat')} {player.seat + 1}: {player.actualTricks}</span>
        ))}
      </div>

      {snapshot.phase === 'scored' ? (
        <>
          {snapshot.completedTricks.at(-1) !== undefined && (
            <GameplayFinalTrick trick={snapshot.completedTricks.at(-1)!} />
          )}
          <GameplayRoundResultPanel snapshot={snapshot} />
        </>
      ) : snapshot.phase !== 'playing' ? null : (
        <GameplayHand
          ownHand={snapshot.ownHand}
          mode={canPlay && !busy ? 'play' : 'disabled'}
          legalCardIds={legalIds}
          trumpSuit={contractSuit}
          onPlay={onPlay}
        />
      )}
    </section>
  );
}
