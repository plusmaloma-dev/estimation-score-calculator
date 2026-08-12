import { useState, type FormEvent } from 'react';
import { cardId } from '../../domain/card.js';
import type { Card, CardSuit } from '../../domain/card.js';
import type { GameplayAuctionAction } from '../../gameplay/types.js';
import { GameplayHand } from './GameplayHand.js';
import type { GameplayTablePresentation } from '../gameplay/GameplayTablePresentation.js';
import { useI18n } from '../i18n/I18nContext.js';
import type { TranslationKey } from '../i18n/translations.js';

const SUIT_SYMBOLS: Readonly<Record<CardSuit, string>> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

function suitKey(suit: string): TranslationKey {
  return suit === 'no-trump' ? 'noTrump' : suit as TranslationKey;
}

function actionKey(action: GameplayAuctionAction): string {
  return JSON.stringify(action);
}

function riskLabel(type: NonNullable<GameplayTablePresentation['risk']>['type']): string {
  if (type === 'pending') return 'pending';
  if (type === 'round-risk') return 'roundRisk';
  if (type === 'dash-call') return 'dashCall';
  if (type === 'high-contract') return 'highContract';
  return type;
}

export function GameplayTable({
  model,
  busy,
  onEstimate,
  onAuctionAction,
  onPlay,
}: {
  readonly model: GameplayTablePresentation;
  readonly busy: boolean;
  readonly onEstimate: (tricks: number) => Promise<void>;
  readonly onAuctionAction: (action: GameplayAuctionAction) => Promise<void>;
  readonly onPlay: (card: Card) => Promise<void>;
}) {
  const { t } = useI18n();
  const [estimate, setEstimate] = useState('');
  const [auction, setAuction] = useState('');
  const auctionActions = model.legalAuctionActions.map((option) => option.action);
  const currentAction = model.phase === 'auction'
    ? t('auction')
    : model.phase === 'estimate'
      ? t('estimate')
      : model.phase === 'playing'
        ? t('cardPlay')
        : t('roundScored');

  async function submitEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = model.estimateOptions.find((option) => String(option.value) === estimate);
    if (value === undefined || !value.enabled) return;
    await onEstimate(value.value);
  }

  async function submitAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = auctionActions.find((candidate) => actionKey(candidate) === auction);
    if (action === undefined) return;
    await onAuctionAction(action);
  }

  return (
    <section className={`gameplay-table gameplay-table--${model.phase}`} aria-label={t('gameTable')}>
      <header className="gameplay-table__topbar">
        <div className="gameplay-table__context">
          <h3>{t('round')} {model.roundNumber ?? '—'}</h3>
          {model.dealerSeat !== undefined && <span>{t('dealer')} {t('seat')} {model.dealerSeat + 1}</span>}
          {model.callerSeat !== undefined && <span>{t('caller')} {t('seat')} {model.callerSeat + 1}</span>}
          {model.callerSeat !== undefined && <span>{t('callerEstimate')}: {model.seats.find((seat) => seat.seat === model.callerSeat)?.bid ?? t('pending')}</span>}
          {model.trump !== undefined && <span>{t('trump')}: {t(suitKey(model.trump))}</span>}
          {model.risk !== undefined && <span>{t('risk')}: {t('seat')} {model.risk.seat + 1} ({t(riskLabel(model.risk.type) as TranslationKey)})</span>}
        </div>
        <div className="gameplay-table__scores" aria-label={t('overallScores')}>
          {model.seats.map((seat) => <span key={seat.seat}>{seat.displayName} {seat.score}</span>)}
        </div>
      </header>

      <ul className="gameplay-table__estimates" aria-label={t('estimatesBySeat')}>
        {model.seats.map((seat) => (
          <li key={seat.seat}>
            <span>{seat.displayName}</span>
            <span>{t('estimate')}: {seat.bid ?? t('pending')}</span>
          </li>
        ))}
      </ul>

      <div className="gameplay-table__round-status" aria-label={t('underOver')}>
        <span>{t('totalEstimates')}: {model.totalEstimatedTricks}</span>
        <span>{t('underOver')}: {model.estimateStatus === 'under' ? t('under') : model.estimateStatus === 'over' ? t('over') : t('atThirteen')}</span>
        <span>{model.estimateStatus === 'under' ? `${t('underBy')} ${model.estimateDistanceFrom13}` : model.estimateStatus === 'over' ? `${t('overBy')} ${model.estimateDistanceFrom13}` : t('atThirteen')}</span>
      </div>

      <div className="gameplay-table__surface">
        {model.seats.map((seat) => (
          <article
            key={seat.seat}
            className={`gameplay-table-seat gameplay-table-seat--${seat.position}${seat.isActive ? ' gameplay-table-seat--active' : ''}`}
          >
            <strong>{seat.displayName}</strong>
            <span className="gameplay-table-seat__badges">
              {seat.isDealer && <small>{t('dealer')}</small>}
              {seat.isCaller && <small>{t('caller')}</small>}
              {seat.isWith && <small>{t('with')}</small>}
              {seat.isRisk && <small>{t('risk')}</small>}
            </span>
            <span>{t('bid')} {seat.bid ?? '—'} · {t('won')} {seat.won}</span>
            <span>{t('score')} {seat.score}</span>
          </article>
        ))}

        <section className="gameplay-table__trick" aria-label={t('currentTrick')}>
          <h3>{t('currentTrick')}</h3>
          <span>{t('trick')} {model.currentTrick.length > 0 ? (model.lastCompletedTrick?.trickNumber ?? 1) : '—'}</span>
          <div className="gameplay-table__cards">
            {model.currentTrick.map((entry) => (
              <span key={entry.seat} className={entry.seat === model.currentWinningSeat ? 'gameplay-card--winner' : ''}>
                {t('seat')} {entry.seat + 1} {entry.card.rank}{SUIT_SYMBOLS[entry.card.suit]}
              </span>
            ))}
          </div>
          {model.activeSeat !== undefined && <small>{t('active')}: {t('seat')} {model.activeSeat + 1}</small>}
        </section>
      </div>

      {model.lastCompletedTrick !== undefined && (
      <div className="gameplay-table__last-trick" aria-label={t('finalTrickCards')}>
          {t('lastCompletedTrick')} · {model.lastCompletedTrick.entries.map((entry) => `${t('seat')} ${entry.seat + 1} ${entry.card.rank}${SUIT_SYMBOLS[entry.card.suit]}`).join(' · ')} → {t('winner')}: {t('seat')} {model.lastCompletedTrick.winnerSeat + 1}
        </div>
      )}

      <section className="gameplay-table__hand">
        <h3>{t('yourHand')}</h3>
        <GameplayHand
          ownHand={model.ownHand}
          mode={model.isSynchronizing
            ? 'disabled'
            : model.phase === 'playing' && model.viewerActionRequired ? 'play' : 'read-only'}
          legalCardIds={new Set(model.legalCards.map(cardId))}
          trumpSuit={model.trump}
          onPlay={onPlay}
        />
      </section>

      <section className="gameplay-table__action-tray" aria-label={t('currentAction')}>
        <h3>{currentAction}</h3>
        {model.phase === 'auction' && model.viewerActionRequired && (
          <form onSubmit={(event) => void submitAuction(event)}>
            <select aria-label={t('auction')} value={auction} onChange={(event) => setAuction(event.target.value)} disabled={busy}>
              <option value="">{t('selectContract')}</option>
              {auctionActions.map((action) => <option key={actionKey(action)} value={actionKey(action)}>
                {action.type === 'pass' ? t('pass') : action.type === 'with' ? t('with') : `${action.tricks} ${t(suitKey(action.trumpSuit))}`}
              </option>)}
            </select>
            <button type="submit" className="primary-button" disabled={busy || auction === ''}>{t('submitAuctionAction')}</button>
          </form>
        )}
        {model.phase === 'estimate' && model.viewerActionRequired && (
          <form onSubmit={(event) => void submitEstimate(event)}>
            <select aria-label={t('estimate')} value={estimate} onChange={(event) => setEstimate(event.target.value)} disabled={busy}>
              <option value="">{t('estimate')}</option>
              {model.estimateOptions.map((option) => (
                <option key={option.value} value={String(option.value)} disabled={!option.enabled}>
                  {option.value}{option.reason === 'would_total_13' ? ` — ${t('finalEstimateMustMove')}` : ''}
                </option>
              ))}
            </select>
            <button type="submit" className="primary-button" disabled={busy || estimate === ''}>{t('submitEstimate')}</button>
          </form>
        )}
      </section>

      <details className="gameplay-table__history">
        <summary>{t('scoreHistory')}</summary>
        {model.scoreHistory.length === 0 ? <p>{t('noScoreHistory')}</p> : (
          <ul>{model.scoreHistory.map((row) => <li key={row.roundNumber}>{t('round')} {row.roundNumber}: {row.deltasBySeat.join(' · ')}</li>)}</ul>
        )}
      </details>
    </section>
  );
}
