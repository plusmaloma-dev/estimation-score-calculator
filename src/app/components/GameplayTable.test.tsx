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
});
