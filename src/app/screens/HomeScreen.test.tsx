import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { HomeScreen } from './HomeScreen.js';

function createServices(): AppServices {
  return {
    shell: {
      getSessionHistory: () => ({
        sessions: [{
          id: 'score-sheet-1',
          name: 'Thursday Table',
          status: 'draft',
          players: ['Ahmed', 'Mona', 'Rami', 'Dina'],
          roundCount: 7,
          updatedAtIso: '2026-07-22T10:00:00.000Z',
          updatedAtLabel: '22 Jul 2026',
        }],
      }),
      createScoreSheet: vi.fn(),
      openSession: vi.fn(),
      saveRound: vi.fn(),
    },
  };
}

describe('HomeScreen', () => {
  it('shows the recent game and all four player names', () => {
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
    expect(screen.getByRole('button', { name: 'Continue game' })).toBeInTheDocument();
  });
});
