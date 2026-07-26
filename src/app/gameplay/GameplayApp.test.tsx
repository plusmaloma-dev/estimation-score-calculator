import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GameplayApplicationServices } from './GameplayContext.js';
import { GameplayApp } from './GameplayApp.js';

const services: GameplayApplicationServices = {
  gameplayTables: {
    listLobby: async () => ({ valid: true, errors: [], value: [] }),
  } as unknown as GameplayApplicationServices['gameplayTables'],
};

describe('GameplayApp', () => {
  it('opens the gameplay lobby without score-sheet application actions', async () => {
    render(<GameplayApp services={services} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Online tables' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Create table' })).toBeInTheDocument();
    expect(screen.queryByText(/start a new game/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/score sheet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recent games/i)).not.toBeInTheDocument();
  });
});
