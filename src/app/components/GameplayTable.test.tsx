import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { createGameplayTablePresentation } from '../gameplay/GameplayTablePresentation.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { GameplayTable } from './GameplayTable.js';

const round = {
  tableId: 'table-1', roundNumber: 2, phase: 'estimate', version: 7, viewerSeat: 0,
  dealerSeat: 3, callerSeat: 1, trumpSuit: 'hearts', nextBidSeat: 0,
  players: [
    { seat: 0, playerId: 'private-viewer-id', cardCount: 13, actualTricks: 0 },
    { seat: 1, playerId: 'private-human-id', displayName: 'Noura', cardCount: 13, actualTricks: 1 },
    { seat: 2, playerId: 'private-bot-id', cardCount: 13, actualTricks: 2 },
    { seat: 3, playerId: 'private-bot-id-3', cardCount: 13, actualTricks: 3 },
  ],
  ownHand: [{ suit: 'hearts', rank: 'A' }],
  legalNormalEstimates: [],
  estimateOptions: [
    { value: 3, enabled: true },
    { value: 4, enabled: false, reason: 'would_total_13' as const },
  ],
  legalAuctionActions: [], legalCards: [], currentTrick: [], completedTricks: [],
  cumulativeScoresBySeat: [10, 20, 30, 40], scoreHistory: [],
} as unknown as OnlineGameplayRoundSnapshot;

const presentation = {
  phase: 'estimate', roundNumber: 2, viewerSeat: 0, viewerActionRequired: true,
  activeSeat: 0, actionKind: 'bid', totalEstimatedTricks: 9, estimateStatus: 'under',
  estimateDistanceFrom13: 4, estimatesComplete: false, seatControls: [
    { seat: 0, seatKind: 'human' },
    { seat: 1, seatKind: 'human' },
    { seat: 2, seatKind: 'bot' },
    { seat: 3, seatKind: 'bot' },
  ], currentTrick: [], ownHand: round.ownHand, legalNormalEstimates: [], legalCards: [],
  isSynchronizing: false,
} as unknown as ActiveRoundPresentation;

function renderTable(language: 'en' | 'ar' = 'en') {
  window.localStorage.setItem('estimation-language', language);
  const model = createGameplayTablePresentation(presentation, round);
  return render(
    <I18nProvider>
      <GameplayTable model={model} busy={false} onEstimate={vi.fn(async () => undefined)} onAuctionAction={vi.fn(async () => undefined)} onPlay={vi.fn(async () => undefined)} />
    </I18nProvider>,
  );
}

describe('GameplayTable', () => {
  it('renders safe seat names, one estimate list, and disabled exact-13 values', () => {
    renderTable();
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Noura').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Standard Bot 3').length).toBeGreaterThan(0);
    expect(screen.queryByText('private-bot-id')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Estimates by seat' })).toBeVisible();
    expect(screen.getByRole('option', { name: /4/ })).toBeDisabled();
  });

  it('uses Arabic labels for the new table surface', () => {
    renderTable('ar');
    expect(screen.queryByText('Game table')).not.toBeInTheDocument();
    expect(screen.queryByText('Overall scores')).not.toBeInTheDocument();
    expect(screen.queryByText('Current action')).not.toBeInTheDocument();
    expect(screen.queryByText('Score history')).not.toBeInTheDocument();
  });

  it('shows traceable auction history instead of estimate and Under/Over summaries', () => {
    window.localStorage.setItem('estimation-language', 'en');
    const auctionRound = {
      ...round,
      phase: 'auction',
      dealerSeat: 0,
      auctionActiveSeat: 3,
      nextBidSeat: 3,
      passedAuctionSeats: [1],
      consecutiveAuctionPasses: 1,
      currentHighestContract: { seat: 2, playerId: 'private-bot-id', tricks: 4, trumpSuit: 'hearts' },
      auctionHistory: [
        { seat: 2, playerId: 'private-bot-id', action: { type: 'contract', tricks: 4, trumpSuit: 'hearts' } },
        { seat: 1, playerId: 'private-human-id', action: { type: 'pass' } },
      ],
      players: round.players.map((player) => ({ ...player, bid: undefined })),
    } as unknown as OnlineGameplayRoundSnapshot;
    const auctionPresentation = {
      ...presentation,
      phase: 'auction',
      activeSeat: 3,
      viewerActionRequired: false,
      totalEstimatedTricks: 0,
      estimateDistanceFrom13: 13,
    } as unknown as ActiveRoundPresentation;
    render(
      <I18nProvider>
        <GameplayTable
          model={createGameplayTablePresentation(auctionPresentation, auctionRound)}
          busy={false}
          onEstimate={vi.fn(async () => undefined)}
          onAuctionAction={vi.fn(async () => undefined)}
          onPlay={vi.fn(async () => undefined)}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('region', { name: 'Contract auction' })).toBeVisible();
    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.includes('4') && element?.textContent?.includes('Hearts'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pass/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Standard Bot 3/).length).toBeGreaterThan(0);
    expect(screen.getByText('Auction owner: Standard Bot 3')).toBeVisible();
    expect(screen.queryByText('Estimates by seat')).not.toBeInTheDocument();
    expect(screen.queryByText('Total estimates')).not.toBeInTheDocument();
    expect(screen.queryByText('Under by 13')).not.toBeInTheDocument();
  });

  it('shows authoritative trump and lead suit context during card play', () => {
    const playingRound = {
      ...round,
      phase: 'playing',
      currentTrick: [{ seat: 0, card: { suit: 'hearts', rank: '4' } }],
    } as unknown as OnlineGameplayRoundSnapshot;
    const playingPresentation = {
      ...presentation,
      phase: 'playing',
      viewerActionRequired: false,
      activeSeat: 1,
      actionKind: 'card',
      currentTrick: playingRound.currentTrick,
    } as unknown as ActiveRoundPresentation;
    render(
      <I18nProvider>
        <GameplayTable
          model={createGameplayTablePresentation(playingPresentation, playingRound)}
          busy={false}
          onEstimate={vi.fn(async () => undefined)}
          onAuctionAction={vi.fn(async () => undefined)}
          onPlay={vi.fn(async () => undefined)}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.includes('Trump:') && element?.textContent?.includes('Hearts'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.includes('Lead suit:') && element?.textContent?.includes('Hearts')))[0]).toBeVisible();
  });

  it('places each played card at the viewer-relative seat and highlights the authoritative winner', () => {
    const playingRound = {
      ...round,
      phase: 'playing',
      currentTrick: [
        { seat: 0, card: { suit: 'hearts', rank: '4' } },
        { seat: 1, card: { suit: 'clubs', rank: '8' } },
        { seat: 2, card: { suit: 'spades', rank: 'K' } },
        { seat: 3, card: { suit: 'diamonds', rank: '9' } },
      ],
      currentWinningSeat: 1,
      viewerSeat: 2,
    } as unknown as OnlineGameplayRoundSnapshot;
    const playingPresentation = {
      ...presentation,
      phase: 'playing',
      viewerSeat: 2,
      viewerActionRequired: false,
      activeSeat: 0,
      actionKind: 'card',
      currentTrick: playingRound.currentTrick,
    } as unknown as ActiveRoundPresentation;
    render(
      <I18nProvider>
        <GameplayTable
          model={createGameplayTablePresentation(playingPresentation, playingRound)}
          busy={false}
          onEstimate={vi.fn(async () => undefined)}
          onAuctionAction={vi.fn(async () => undefined)}
          onPlay={vi.fn(async () => undefined)}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId('played-card-seat-0')).toHaveClass('gameplay-table__played-card--top');
    expect(screen.getByTestId('played-card-seat-1')).toHaveClass('gameplay-table__played-card--left');
    expect(screen.getByTestId('played-card-seat-2')).toHaveClass('gameplay-table__played-card--bottom');
    expect(screen.getByTestId('played-card-seat-3')).toHaveClass('gameplay-table__played-card--right');
    expect(screen.getByTestId('played-card-seat-1')).toHaveClass('gameplay-card--winner');
    expect(screen.getByTestId('played-card-seat-0')).toHaveClass('playing-card--red');
    expect(screen.getByTestId('played-card-seat-1')).toHaveClass('playing-card--black');
    expect(screen.getAllByTestId(/played-card-seat-/)).toHaveLength(4);
  });
});
