import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { HomeScreen } from './HomeScreen.js';

function createServices(status: 'draft' | 'finalized' = 'draft'): AppServices {
  return {
    shell: {
      getSessionHistory: () => ({
        sessions: [{
          id: 'score-sheet-1',
          name: 'Thursday Table',
          status,
          players: ['Ahmed', 'Mona', 'Rami', 'Dina'],
          roundCount: 7,
          createdAtIso: '2026-07-23T10:42:00.000Z',
          createdAtLabel: 'Created 23 Jul 2026, 1:42 PM',
          updatedAtIso: '2026-07-23T11:00:00.000Z',
          updatedAtLabel: '23 Jul 2026',
        }],
      }),
      createScoreSheet: vi.fn(),
      openSession: vi.fn(),
      saveRound: vi.fn(),
    },
    playerDirectory: {
      listActivePlayers: async () => [],
      createPlayer: async () => ({ valid: false, errors: ['not used'] }),
    },
  };
}

describe('HomeScreen', () => {
  it('shows approved in-progress status and immutable creation timestamp', () => {
    render(
      <I18nProvider>
        <AppProvider services={createServices()}>
          <HomeScreen />
        </AppProvider>
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Recent games' })).toBeInTheDocument();
    expect(screen.getByText('Thursday Table')).toBeInTheDocument();
    for (const player of ['Ahmed', 'Mona', 'Rami', 'Dina']) {
      expect(screen.getByText(player)).toBeInTheDocument();
    }
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Created 23 Jul 2026, 1:42 PM')).toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue game' })).toBeInTheDocument();
  });

  it('shows completed games with the approved status label', () => {
    render(
      <I18nProvider>
        <AppProvider services={createServices('finalized')}>
          <HomeScreen />
        </AppProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('finalized')).not.toBeInTheDocument();
  });
});
