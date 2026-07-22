import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { NewGameScreen } from './NewGameScreen.js';

const createScoreSheet = vi.fn(() => ({ valid: false, errors: ['stop after call'] }));

const services: AppServices = {
  shell: {
    getSessionHistory: () => ({ sessions: [] }),
    createScoreSheet,
    openSession: vi.fn(),
  },
};

describe('NewGameScreen', () => {
  it('submits four named players and the selected rule set', async () => {
    const user = userEvent.setup();
    createScoreSheet.mockClear();

    render(
      <I18nProvider>
        <AppProvider services={services} initialRoute="new-game">
          <NewGameScreen />
        </AppProvider>
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText('Game name'), 'Thursday Table');
    for (const [index, name] of ['Ahmed', 'Mona', 'Rami', 'Dina'].entries()) {
      await user.type(screen.getByLabelText(`Player ${index + 1}`), name);
    }
    await user.click(screen.getByLabelText('Federation 2026'));
    await user.click(screen.getByRole('button', { name: 'Create game' }));

    expect(createScoreSheet).toHaveBeenCalledWith({
      name: 'Thursday Table',
      ruleSet: 'FEDERATION_2026',
      players: [
        { id: 'player-1', name: 'Ahmed' },
        { id: 'player-2', name: 'Mona' },
        { id: 'player-3', name: 'Rami' },
        { id: 'player-4', name: 'Dina' },
      ],
    });
  });
});
