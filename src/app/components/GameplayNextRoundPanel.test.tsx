import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActiveRoundPresentation } from '../gameplay/ActiveRoundPresentation.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { GameplayNextRoundPanel } from './GameplayNextRoundPanel.js';

function presentation(
  overrides: Partial<ActiveRoundPresentation> = {},
): ActiveRoundPresentation {
  return {
    phase: 'scored',
    tableId: 'table-1',
    roundNumber: 1,
    viewerSeat: 0,
    viewerActionRequired: false,
    seatControls: [],
    estimatesBySeat: [],
    totalEstimatedTricks: 12,
    estimateStatus: 'under',
    estimateDistanceFrom13: 1,
    estimatesComplete: true,
    currentTrick: [],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    canStartNextRound: true,
    isSynchronizing: false,
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof GameplayNextRoundPanel>[0]> = {}) {
  return render(
    <I18nProvider>
      <GameplayNextRoundPanel
        presentation={presentation()}
        isHost
        pending={false}
        onStartNextRound={vi.fn()}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('GameplayNextRoundPanel', () => {
  it('shows the host start control only in a compatible scored state', async () => {
    const user = userEvent.setup();
    const onStartNextRound = vi.fn();
    renderPanel({ onStartNextRound });

    await user.click(screen.getByRole('button', { name: 'Start Next Round' }));

    expect(onStartNextRound).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Waiting for host to start the next round')).not.toBeInTheDocument();
  });

  it('shows non-host humans the waiting state without a start control', () => {
    renderPanel({ isHost: false, presentation: presentation({ canStartNextRound: false }) });

    expect(screen.getByText('Waiting for host to start the next round')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start Next Round' })).not.toBeInTheDocument();
  });

  it('disables duplicate submissions while pending and stays keyboard accessible', () => {
    renderPanel({ pending: true });

    const button = screen.getByRole('button', { name: 'Starting next round' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'button');
  });

  it.each(['auction', 'estimate', 'playing', 'synchronizing', 'paused', 'terminated'] as const)(
    'does not render a start control while %s',
    (phase) => {
      renderPanel({
        presentation: presentation({
          phase,
          canStartNextRound: false,
          isSynchronizing: phase === 'synchronizing',
        }),
      });

      expect(screen.queryByRole('button', { name: 'Start Next Round' })).not.toBeInTheDocument();
      expect(screen.queryByText('Starting next round')).not.toBeInTheDocument();
    },
  );

  it('does not start automatically on render', () => {
    const onStartNextRound = vi.fn();
    renderPanel({ onStartNextRound });

    expect(onStartNextRound).not.toHaveBeenCalled();
  });

  it('renders the new host and waiting copy in Arabic without hardcoded English', () => {
    window.localStorage.setItem('estimation-language', 'ar');
    const host = renderPanel();

    expect(screen.getByRole('button', { name: 'بدء الجولة التالية' })).toBeVisible();
    expect(screen.queryByText('Start Next Round')).not.toBeInTheDocument();
    host.unmount();

    renderPanel({ isHost: false, presentation: presentation({ canStartNextRound: false }) });

    expect(screen.getByText('في انتظار المضيف لبدء الجولة التالية')).toBeVisible();
    expect(screen.queryByText('Waiting for host to start the next round')).not.toBeInTheDocument();
    window.localStorage.removeItem('estimation-language');
  });
});
