import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GameplayContextProvider,
  type GameplayApplicationServices,
  useGameplayApp,
} from './GameplayContext.js';

function Probe() {
  const {
    route,
    activeGameplayTableId,
    services,
    navigate,
    openGameplayTable,
    openActiveGame,
  } = useGameplayApp();

  return (
    <section>
      <p data-testid="route">{route}</p>
      <p data-testid="table">{activeGameplayTableId ?? 'none'}</p>
      <p data-testid="service-count">{Object.keys(services).length}</p>
      <button type="button" onClick={() => navigate('gameplay-lobby')}>Lobby</button>
      <button type="button" onClick={() => openGameplayTable('table-1')}>Table</button>
      <button type="button" onClick={() => openActiveGame('table-1')}>Active</button>
    </section>
  );
}

describe('GameplayContextProvider', () => {
  it('runs with gameplay services only and owns gameplay navigation', () => {
    const services: GameplayApplicationServices = {};

    render(
      <GameplayContextProvider services={services}>
        <Probe />
      </GameplayContextProvider>,
    );

    expect(screen.getByTestId('route')).toHaveTextContent('gameplay-home');
    expect(screen.getByTestId('table')).toHaveTextContent('none');
    expect(screen.getByTestId('service-count')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: 'Lobby' }));
    expect(screen.getByTestId('route')).toHaveTextContent('gameplay-lobby');

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByTestId('route')).toHaveTextContent('gameplay-table');
    expect(screen.getByTestId('table')).toHaveTextContent('table-1');

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getByTestId('route')).toHaveTextContent('active-game');
    expect(screen.getByTestId('table')).toHaveTextContent('table-1');
  });
});
