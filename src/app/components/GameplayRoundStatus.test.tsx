import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayRoundStatus } from './GameplayRoundStatus.js';

function presentation(
  overrides: Partial<ActiveRoundPresentation> = {},
): ActiveRoundPresentation {
  return {
    phase: 'estimate',
    tableId: 'table-1',
    roundNumber: 3,
    viewerSeat: 2,
    viewerActionRequired: true,
    activeSeat: 2,
    actionKind: 'bid',
    activeTurnStatus: 'running',
    activeControlOwner: 'human',
    countdownSeconds: 20,
    seatControls: [
      { seat: 0, seatKind: 'human', humanUserId: 'u0', joinedAt: '2026-07-29T09:00:00.000Z', connection: 'connected', controlOwner: 'human', reclaimPending: false },
      { seat: 1, seatKind: 'human', humanUserId: 'u1', joinedAt: '2026-07-29T09:00:00.000Z', connection: 'connected', controlOwner: 'human', reclaimPending: false },
      { seat: 2, seatKind: 'human', humanUserId: 'u2', joinedAt: '2026-07-29T09:00:00.000Z', connection: 'connected', controlOwner: 'human', reclaimPending: false },
      { seat: 3, seatKind: 'bot', botId: 'standard-bot:table-1:3', joinedAt: '2026-07-29T09:00:00.000Z', connection: 'disconnected', controlOwner: 'permanent-bot', reclaimPending: false },
    ],
    estimatesBySeat: [
      { seat: 0, playerId: 'p0', estimate: 4, isViewer: false, isCaller: true },
      { seat: 1, playerId: 'p1', estimate: 2, isViewer: false, isCaller: false },
      { seat: 2, playerId: 'p2', isViewer: true, isCaller: false },
      { seat: 3, playerId: 'p3', estimate: 3, isViewer: false, isCaller: false },
    ],
    callerSeat: 0,
    callerEstimate: 4,
    trump: 'spades',
    totalEstimatedTricks: 9,
    estimateStatus: 'under',
    estimateDistanceFrom13: 4,
    estimatesComplete: false,
    risk: { seat: 2, type: 'pending' },
    currentTrick: [],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    canStartNextRound: false,
    isSynchronizing: false,
    ...overrides,
  };
}

function renderStatus(value: ActiveRoundPresentation) {
  return render(
    <I18nProvider>
      <GameplayRoundStatus presentation={value} />
    </I18nProvider>,
  );
}

describe('GameplayRoundStatus', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());
  it('binds every estimate to its seat and marks the viewer and caller unambiguously', () => {
    renderStatus(presentation());

    const estimates = screen.getByRole('list', { name: 'Estimates by seat' });
    const items = within(estimates).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Seat 1');
    expect(items[0]).toHaveTextContent('Caller');
    expect(items[0]).toHaveTextContent('4');
    expect(items[2]).toHaveTextContent('Seat 3');
    expect(items[2]).toHaveTextContent('You');
    expect(items[2]).toHaveTextContent('Pending');
    expect(items[3]).toHaveTextContent('Standard bot');
  });

  it('separates caller, numeric estimate, and trump while keeping total, balance, and Risk visible', () => {
    renderStatus(presentation());

    const summary = screen.getByRole('group', { name: 'Round estimate summary' });
    expect(within(summary).getByText('Caller')).toBeVisible();
    expect(within(summary).getByText('Seat 1')).toBeVisible();
    expect(within(summary).getByText('Caller estimate')).toBeVisible();
    expect(within(summary).getByText('4')).toBeVisible();
    expect(within(summary).getByText('Trump')).toBeVisible();
    expect(within(summary).getByText('Spades')).toBeVisible();
    expect(within(summary).getByText('Total estimates')).toBeVisible();
    expect(within(summary).getByText('9')).toBeVisible();
    expect(within(summary).getByText('Under by 4')).toBeVisible();
    expect(within(summary).getByText('Seat 3 · Pending')).toBeVisible();
  });

  it('renders compact phase, active action, and timer without duplicating action-banner copy', () => {
    renderStatus(presentation());

    const status = screen.getByRole('region', { name: /Round 3/ });
    expect(status).toHaveClass('gameplay-round-status');
    expect(screen.getAllByRole('region', { name: /Round 3/ })).toHaveLength(1);
    expect(status).toHaveTextContent('Estimate');
    expect(status).toHaveTextContent('Active');
    expect(status).toHaveTextContent('Seat 3');
    expect(status).toHaveTextContent('Seat 3 · Estimate');
    expect(status).not.toHaveTextContent('Â');
    expect(status).not.toHaveTextContent('Seat 3 · Bid');
    expect(status).toHaveTextContent('20 seconds');
    expect(status).not.toHaveTextContent('Submit your estimate');
  });

  it('does not display a stale active timer once the round is scored or paused', () => {
    const { rerender } = renderStatus(presentation({
      phase: 'scored',
      activeSeat: undefined,
      actionKind: undefined,
      countdownSeconds: 17,
    }));

    expect(screen.queryByText('17 seconds')).not.toBeInTheDocument();

    rerender(
      <I18nProvider>
        <GameplayRoundStatus presentation={presentation({
          phase: 'paused',
          activeSeat: 2,
          actionKind: 'bid',
          countdownSeconds: 17,
        })} />
      </I18nProvider>,
    );
    expect(screen.queryByText('17 seconds')).not.toBeInTheDocument();
  });

  it('keeps Over distance and active Risk visible during card play', () => {
    renderStatus(presentation({
      phase: 'playing',
      viewerActionRequired: false,
      totalEstimatedTricks: 14,
      estimateStatus: 'over',
      estimateDistanceFrom13: 1,
      estimatesComplete: true,
      risk: { seat: 2, type: 'round-risk' },
      estimatesBySeat: [
        { seat: 0, playerId: 'p0', estimate: 4, isViewer: false, isCaller: true },
        { seat: 1, playerId: 'p1', estimate: 2, isViewer: false, isCaller: false },
        { seat: 2, playerId: 'p2', estimate: 5, isViewer: true, isCaller: false },
        { seat: 3, playerId: 'p3', estimate: 3, isViewer: false, isCaller: false },
      ],
    }));

    expect(screen.getByText('Over by 1')).toBeVisible();
    expect(screen.getByText('Seat 3 · Round risk')).toBeVisible();
  });

  it('labels a partial total of thirteen as requiring the final estimate to move it', () => {
    renderStatus(presentation({
      totalEstimatedTricks: 13,
      estimateStatus: 'at-13',
      estimateDistanceFrom13: 0,
      estimatesComplete: false,
    }));

    expect(screen.getByText('At 13 · final estimate must move Under or Over')).toBeVisible();
  });

  it('renders round status labels in Arabic without the corresponding English status text', () => {
    window.localStorage.setItem('estimation-language', 'ar');
    renderStatus(presentation());

    expect(screen.getByText('الجولة 3')).toBeVisible();
    expect(screen.getByText('بستوني')).toBeVisible();
    expect(screen.getByText('أقل بـ 4')).toBeVisible();
    expect(screen.getByText('المقعد 3 · قيد الانتظار')).toBeVisible();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Spades')).not.toBeInTheDocument();
    expect(screen.queryByText('Under by 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Round risk')).not.toBeInTheDocument();
  });
});
