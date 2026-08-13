import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayActionBanner } from './GameplayActionBanner.js';

function presentation(
  overrides: Partial<ActiveRoundPresentation> = {},
): ActiveRoundPresentation {
  return {
    phase: 'auction',
    tableId: 'table-1',
    roundNumber: 2,
    viewerSeat: 2,
    viewerActionRequired: true,
    activeSeat: 2,
    actionKind: 'bid',
    activeTurnStatus: 'running',
    activeControlOwner: 'human',
    countdownSeconds: 11,
    seatControls: [],
    estimatesBySeat: [],
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

function renderBanner(value: ActiveRoundPresentation) {
  return render(
    <I18nProvider>
      <GameplayActionBanner presentation={value} />
    </I18nProvider>,
  );
}

describe('GameplayActionBanner', () => {
  it('makes the viewer auction action and active-control countdown prominent in one status region', () => {
    renderBanner(presentation());

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Submit contract action');
    expect(screen.getByLabelText('Turn countdown')).toHaveTextContent('11 seconds');
    expect(screen.getByLabelText('Turn countdown')).toHaveClass('gameplay-countdown');
  });

  it('renders one authoritative waiting message without claiming an action for another seat', () => {
    renderBanner(presentation({
      viewerActionRequired: false,
      activeSeat: 1,
      actionKind: 'card',
      activeControlOwner: 'human',
    }));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for Seat 2');
    expect(screen.queryByText('Play a card')).not.toBeInTheDocument();
  });

  it('identifies automated control instead of telling a human to act', () => {
    renderBanner(presentation({
      phase: 'playing',
      viewerActionRequired: false,
      activeSeat: 3,
      actionKind: 'card',
      activeTurnStatus: 'bot-processing',
      activeControlOwner: 'permanent-bot',
    }));

    expect(screen.getByRole('status')).toHaveTextContent('Standard bot in Seat 4 is acting');
  });

  it.each([
    ['loading', 'Loading active round'],
    ['synchronizing', 'Synchronizing round state'],
    ['paused', 'Game paused'],
    ['scored', 'Round scored'],
    ['terminated', 'Game terminated'],
  ] as const)('renders exactly one neutral status for %s', (phase, expected) => {
    renderBanner(presentation({
      phase,
      viewerActionRequired: false,
      ...(phase === 'synchronizing' ? { isSynchronizing: true } : {}),
    }));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });
});
