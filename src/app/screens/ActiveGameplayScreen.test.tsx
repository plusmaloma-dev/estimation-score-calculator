import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineActiveGameControlSnapshot } from '../../online/gameplay/activeControlTypes.js';
import { AppProvider, type AppServices } from '../AppContext.js';
import { I18nProvider } from '../i18n/I18nContext.js';
import { ActiveGameplayScreen } from './ActiveGameplayScreen.js';

function activeSnapshot(
  overrides: Partial<OnlineActiveGameControlSnapshot> = {},
): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version: 7,
    turn: {
      turnId: 'turn-1',
      seat: 2,
      actionKind: 'card',
      startedAt: '2026-07-26T08:00:00.000Z',
      remainingMs: 30_000,
      status: 'bot-processing',
    },
    seats: [
      {
        seat: 0,
        seatKind: 'human',
        humanUserId: 'host-user',
        joinedAt: '2026-07-26T07:50:00.000Z',
        connectedAt: '2026-07-26T07:50:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
      {
        seat: 1,
        seatKind: 'bot',
        botId: 'standard-bot:table-1:1',
        joinedAt: '2026-07-26T08:00:00.000Z',
        connection: 'disconnected',
        controlOwner: 'permanent-bot',
        reclaimPending: false,
      },
      {
        seat: 2,
        seatKind: 'human',
        humanUserId: 'guest-user',
        joinedAt: '2026-07-26T07:55:00.000Z',
        connectedAt: '2026-07-26T08:02:00.000Z',
        connection: 'connected',
        controlOwner: 'temporary-bot',
        reclaimPending: true,
      },
      {
        seat: 3,
        seatKind: 'human',
        humanUserId: 'member-user',
        joinedAt: '2026-07-26T07:56:00.000Z',
        connectedAt: '2026-07-26T07:56:00.000Z',
        connection: 'connected',
        controlOwner: 'human',
        reclaimPending: false,
      },
    ],
    events: [],
    directives: [],
    ...overrides,
  };
}

function services(
  initial: OnlineActiveGameControlSnapshot,
  overrides: Partial<NonNullable<AppServices['activeGameControl']>> = {},
): AppServices {
  return {
    shell: {
      getSessionHistory: () => ({ sessions: [] }),
      createScoreSheet: vi.fn(), openSession: vi.fn(), saveRound: vi.fn(),
    },
    playerDirectory: {
      listActivePlayers: async () => [],
      createPlayer: async () => ({ valid: false, errors: ['not used'] }),
    },
    activeGameControl: {
      initialize: vi.fn(),
      getSnapshot: vi.fn(async () => ({ valid: true, errors: [], value: initial })),
      pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(),
      disconnect: vi.fn(), reconnect: vi.fn(), evaluateGrace: vi.fn(),
      evaluateDeadlines: vi.fn(), startTurn: vi.fn(), beginBotAction: vi.fn(),
      completeActionBoundary: vi.fn(),
      ...overrides,
    },
  };
}

function renderActive(appServices: AppServices, currentUserId: string) {
  return render(
    <I18nProvider>
      <AppProvider services={appServices} initialRoute="active-game">
        <ActiveGameplayScreen tableId="table-1" currentUserId={currentUserId} />
      </AppProvider>
    </I18nProvider>,
  );
}

describe('ActiveGameplayScreen', () => {
  it('shows authoritative turn and seat-control status without exposing host controls to guests', async () => {
    renderActive(services(activeSnapshot()), 'member-user');

    expect(await screen.findByRole('heading', { name: 'Active online game' })).toBeVisible();
    expect(screen.getByText('Card turn · Seat 3')).toBeVisible();
    expect(screen.getByText('30 seconds remaining')).toBeVisible();
    const seats = screen.getByRole('list', { name: 'Active seat control' });
    expect(within(seats).getAllByRole('listitem')).toHaveLength(4);
    expect(within(seats).getByText('Permanent Standard bot')).toBeVisible();
    expect(within(seats).getByText('Temporary bot · reclaim pending')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pause game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close table' })).not.toBeInTheDocument();
  });

  it('lets the active host pause and then resume from the returned authoritative snapshots', async () => {
    const user = userEvent.setup();
    const paused = activeSnapshot({
      lifecycle: 'paused',
      version: 8,
      pausedAt: '2026-07-26T08:05:00.000Z',
    });
    const resumed = activeSnapshot({ version: 9 });
    const pause = vi.fn(async () => ({ valid: true, errors: [], value: paused }));
    const resume = vi.fn(async () => ({ valid: true, errors: [], value: resumed }));
    renderActive(services(activeSnapshot(), { pause, resume }), 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Pause game' }));
    expect(pause).toHaveBeenCalledWith('table-1', 7, expect.any(String), expect.any(String));
    expect(screen.getByRole('status')).toHaveTextContent('Game paused');

    await user.click(screen.getByRole('button', { name: 'Resume game' }));
    expect(resume).toHaveBeenCalledWith('table-1', 8, expect.any(String), expect.any(String));
    expect(screen.getByRole('button', { name: 'Pause game' })).toBeVisible();
  });

  it('requires explicit confirmation before the host terminates the game', async () => {
    const user = userEvent.setup();
    const terminated = activeSnapshot({
      lifecycle: 'terminated',
      version: 8,
      turn: undefined,
      terminatedAt: '2026-07-26T08:06:00.000Z',
      terminatedBy: 'host-user',
    });
    const terminate = vi.fn(async () => ({ valid: true, errors: [], value: terminated }));
    renderActive(services(activeSnapshot(), { terminate }), 'host-user');

    await user.click(await screen.findByRole('button', { name: 'Close table' }));
    const dialog = screen.getByRole('dialog', { name: 'Close active table' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm close table' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByLabelText('I understand this ends the game'));
    await user.click(confirm);

    expect(terminate).toHaveBeenCalledWith(
      'table-1', 7, true, expect.any(String), expect.any(String),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Game terminated');
  });
});
