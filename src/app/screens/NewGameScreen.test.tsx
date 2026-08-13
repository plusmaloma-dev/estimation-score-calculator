import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DirectoryPlayer } from '../../online/players/types.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { NewGameScreen } from './NewGameScreen.js';

const createScoreSheet = vi.fn(() => ({ valid: false, errors: ['stop after call'] }));

function createServices(): AppServices {
  const players: DirectoryPlayer[] = [];
  return {
    shell: {
      getSessionHistory: () => ({ sessions: [] }),
      createScoreSheet,
      openSession: vi.fn(),
      saveRound: vi.fn(),
    },
    playerDirectory: {
      listActivePlayers: async (query = '') => players.filter((player) =>
        player.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
      createPlayer: async (name) => {
        const player = { id: `directory-player-${players.length + 1}`, name: name.trim(), archived: false };
        players.push(player);
        return { valid: true, errors: [], value: player };
      },
    },
  };
}

describe('NewGameScreen', () => {
  it('creates or selects four directory players and submits their persistent ids', async () => {
    const user = userEvent.setup();
    createScoreSheet.mockClear();

    render(
      <I18nProvider>
        <AppProvider services={createServices()} initialRoute="new-game">
          <NewGameScreen />
        </AppProvider>
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText('Game name'), 'Thursday Table');
    for (const [index, name] of ['Ahmed', 'Mona', 'Rami', 'Dina'].entries()) {
      await user.type(screen.getByLabelText(`Player ${index + 1}`), name);
      await user.click(await screen.findByRole('option', { name: `Create player “${name}”` }));
    }
    await user.click(screen.getByLabelText('Federation 2026'));
    await user.click(screen.getByRole('button', { name: 'Create game' }));

    expect(createScoreSheet).toHaveBeenCalledWith({
      name: 'Thursday Table',
      ruleSet: 'FEDERATION_2026',
      players: [
        { id: 'directory-player-1', name: 'Ahmed' },
        { id: 'directory-player-2', name: 'Mona' },
        { id: 'directory-player-3', name: 'Rami' },
        { id: 'directory-player-4', name: 'Dina' },
      ],
    });
  });
});
