import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../auth/types.js';
import { OnlineBrowserShellService } from './OnlineBrowserShellService.js';

const session: AuthSessionState = {
  user: { id: 'user-1', email: 'tester@example.com' },
  membership: { workspaceId: 'workspace-1', workspaceSlug: 'estimation-uat', role: 'tester' },
};

function thenableQuery(result: unknown) {
  const query: any = {};
  for (const method of ['select', 'eq', 'order']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

describe('OnlineBrowserShellService', () => {
  it('lists shared games with immutable creation metadata and duplicate names', async () => {
    const query = thenableQuery({
      data: [
        {
          id: 'game-1', name: 'Thursday Table', status: 'draft', version: 2,
          created_at: '2026-07-23T10:42:00.000Z', updated_at: '2026-07-23T11:00:00.000Z',
          game_players: [
            { seat_number: 1, player_name_snapshot: 'Ahmed' },
            { seat_number: 2, player_name_snapshot: 'Mona' },
            { seat_number: 3, player_name_snapshot: 'Rami' },
            { seat_number: 4, player_name_snapshot: 'Dina' },
          ],
          rounds: [{ count: 1 }],
        },
        {
          id: 'game-2', name: 'Thursday Table', status: 'finalized', version: 19,
          created_at: '2026-07-23T12:42:00.000Z', updated_at: '2026-07-23T13:00:00.000Z',
          game_players: [], rounds: [{ count: 18 }],
        },
      ],
      error: null,
    });
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    const service = new OnlineBrowserShellService(client, session);

    const result = await service.getSessionHistory();

    expect(result.sessions.map((game) => game.id)).toEqual(['game-1', 'game-2']);
    expect(result.sessions[0]).toEqual(expect.objectContaining({
      name: 'Thursday Table', status: 'draft', roundCount: 1,
      players: ['Ahmed', 'Mona', 'Rami', 'Dina'],
      createdAtIso: '2026-07-23T10:42:00.000Z',
    }));
    expect(result.sessions[1]?.name).toBe('Thursday Table');
  });

  it('creates a shared game and returns its immutable ID', async () => {
    const client = {
      from: vi.fn(),
      rpc: vi.fn(async () => ({ data: { game_id: 'game-9' }, error: null })),
    };
    const service = new OnlineBrowserShellService(client, session);

    const result = await service.createScoreSheet({
      name: 'Shared Table',
      ruleSet: 'HOUSE_RULES_V1',
      players: [
        { id: 'p1', name: 'Ahmed' }, { id: 'p2', name: 'Mona' },
        { id: 'p3', name: 'Rami' }, { id: 'p4', name: 'Dina' },
      ],
      nowIso: '2026-07-23T14:00:00.000Z',
    });

    expect(result.valid).toBe(true);
    expect(result.scoreSheet?.id).toBe('game-9');
    expect(result.scoreSheet?.status).toBe('draft');
  });

  it('maps the shared snapshot into score history and applied leaderboard totals', async () => {
    const snapshot = {
      game: {
        id: 'game-1', name: 'Shared Table', status: 'draft', rule_set: 'HOUSE_RULES_V1', version: 2,
        created_at: '2026-07-23T10:00:00.000Z', updated_at: '2026-07-23T11:00:00.000Z',
        finalized_at: null, finalized_by: null,
      },
      players: [
        { player_id: 'p1', seat_number: 1, player_name_snapshot: 'Ahmed' },
        { player_id: 'p2', seat_number: 2, player_name_snapshot: 'Mona' },
        { player_id: 'p3', seat_number: 3, player_name_snapshot: 'Rami' },
        { player_id: 'p4', seat_number: 4, player_name_snapshot: 'Dina' },
      ],
      rounds: [{
        id: 'round-1', round_number: 1, round_type: 'under', bid_owner_player_id: 'p1',
        risk_player_id: null, trump_suit: 'spades', is_all_loser_round: false,
        consecutive_all_loser_count_before_round: 0, carried_all_loser_multiplier: 1,
        carry_consumed: false, multiple_with_multiplier: 1,
        bids: [
          { player_id: 'p1', bid_type: 'normal', tricks: 5, trump_suit: 'spades', with_target_player_id: null },
          { player_id: 'p2', bid_type: 'normal', tricks: 4, trump_suit: null, with_target_player_id: null },
          { player_id: 'p3', bid_type: 'normal', tricks: 3, trump_suit: null, with_target_player_id: null },
          { player_id: 'p4', bid_type: 'dash', tricks: 0, trump_suit: null, with_target_player_id: null },
        ],
        actuals: [
          { player_id: 'p1', actual_tricks: 5 }, { player_id: 'p2', actual_tricks: 4 },
          { player_id: 'p3', actual_tricks: 2 }, { player_id: 'p4', actual_tricks: 2 },
        ],
        scores: [
          { player_id: 'p1', bid_tricks: 5, actual_tricks: 5, delta: 0, did_match_bid: true, role: 'bid-owner', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'success', calculated_score: 25, applied_score: 30, notes: [] },
          { player_id: 'p2', bid_tricks: 4, actual_tricks: 4, delta: 0, did_match_bid: true, role: 'other-player', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'success', calculated_score: 14, applied_score: 14, notes: [] },
          { player_id: 'p3', bid_tricks: 3, actual_tricks: 2, delta: -1, did_match_bid: false, role: 'other-player', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'failed', calculated_score: -1, applied_score: -1, notes: [] },
          { player_id: 'p4', bid_tricks: 0, actual_tricks: 2, delta: 2, did_match_bid: false, role: 'other-player', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'failed', calculated_score: -10, applied_score: -10, notes: [] },
        ],
      }],
    };
    const client = {
      from: vi.fn(),
      rpc: vi.fn(async () => ({ data: snapshot, error: null })),
    };
    const service = new OnlineBrowserShellService(client, session);

    const opened = await service.openSession('game-1');

    expect(opened.valid).toBe(true);
    expect(opened.scoreSheet?.roundCount).toBe(1);
    expect(opened.roundHistory?.[0]?.playerScores[0]?.score).toBe(30);
    expect(opened.leaderboard?.[0]).toEqual(expect.objectContaining({ playerId: 'p1', totalScore: 30 }));
  });
});
