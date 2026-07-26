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
        risk_player_id: 'p4', trump_suit: 'spades', is_all_loser_round: false,
        consecutive_all_loser_count_before_round: 0, carried_all_loser_multiplier: 1,
        carry_consumed: false, multiple_with_multiplier: 1,
        bids: [
          { player_id: 'p1', bid_type: 'normal', tricks: 5, trump_suit: 'spades', with_target_player_id: null },
          { player_id: 'p2', bid_type: 'normal', tricks: 4, trump_suit: null, with_target_player_id: null },
          { player_id: 'p3', bid_type: 'hold', tricks: 3, trump_suit: null, with_target_player_id: null },
          { player_id: 'p4', bid_type: 'dash-call', tricks: 0, trump_suit: null, with_target_player_id: null },
        ],
        actuals: [
          { player_id: 'p1', actual_tricks: 5 }, { player_id: 'p2', actual_tricks: 4 },
          { player_id: 'p3', actual_tricks: 2 }, { player_id: 'p4', actual_tricks: 2 },
        ],
        scores: [
          { player_id: 'p1', bid_tricks: 5, actual_tricks: 5, delta: 0, did_match_bid: true, role: 'bid-owner', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'success', calculated_score: 25, applied_score: 30, notes: [] },
          { player_id: 'p2', bid_tricks: 4, actual_tricks: 4, delta: 0, did_match_bid: true, role: 'other-player', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'success', calculated_score: 14, applied_score: 14, notes: [] },
          { player_id: 'p3', bid_tricks: 3, actual_tricks: 2, delta: -1, did_match_bid: false, role: 'other-player', risk_type: 'none', is_risk_taker: false, risk_modifier: 0, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'failed', calculated_score: -1, applied_score: -1, notes: [] },
          { player_id: 'p4', bid_tricks: 0, actual_tricks: 2, delta: 2, did_match_bid: false, role: 'risk-taker', risk_type: 'round-risk', is_risk_taker: true, risk_modifier: 10, is_high_contract: false, is_only_winner: false, is_only_loser: false, status: 'failed', calculated_score: -37, applied_score: -37, notes: [] },
        ],
      }],
      overrides: [{
        id: 'override-1',
        round_number: 1,
        player_id: 'p1',
        calculated_score: 25,
        previous_applied_score: 25,
        new_applied_score: 30,
        reason: 'Manual adjustment',
        changed_at: '2026-07-23T10:30:00.000Z',
        changed_by: 'user-1',
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
    expect(opened.scoreSheet?.gameInput.rounds[0]?.bids[2]).toEqual(expect.objectContaining({
      playerId: 'p3',
      bidType: 'hold',
      tricks: 3,
    }));
    expect(opened.roundHistory?.[0]?.playerScores[0]?.score).toBe(30);
    expect(opened.roundHistory?.[0]?.playerScores[3]?.riskTypes).toEqual(['dash-call', 'round-risk']);
    expect(opened.roundHistory?.[0]?.riskTypes).toEqual(['dash-call', 'round-risk']);
    expect(opened.leaderboard?.[0]).toEqual(expect.objectContaining({ playerId: 'p1', totalScore: 30 }));
  });

  it('opens a locked in-progress game as view-only instead of claiming edit access', async () => {
    const snapshot = {
      game: {
        id: 'game-1', name: 'Locked Table', status: 'draft', rule_set: 'HOUSE_RULES_V1', version: 1,
        created_at: '2026-07-23T10:00:00.000Z', updated_at: '2026-07-23T10:00:00.000Z',
        finalized_at: null, finalized_by: null,
      },
      players: [
        { player_id: 'p1', seat_number: 1, player_name_snapshot: 'Ahmed' },
        { player_id: 'p2', seat_number: 2, player_name_snapshot: 'Mona' },
        { player_id: 'p3', seat_number: 3, player_name_snapshot: 'Rami' },
        { player_id: 'p4', seat_number: 4, player_name_snapshot: 'Dina' },
      ],
      rounds: [],
      overrides: [],
      lock: {
        holder_user_id: 'other-user',
        expires_at: '2026-07-23T10:15:00.000Z',
      },
    };
    const rpc = vi.fn(async (name: string) => name === 'get_game_snapshot'
      ? { data: snapshot, error: null }
      : { data: null, error: { message: 'Game is being edited by another user.' } });
    const service = new OnlineBrowserShellService({ from: vi.fn(), rpc }, session);

    const opened = await service.openSession('game-1');

    expect(opened.valid).toBe(true);
    expect(opened.editAccess).toEqual({
      mode: 'view-only',
      holderUserId: 'other-user',
      expiresAtIso: '2026-07-23T10:15:00.000Z',
      reason: 'Game is being edited by another user.',
    });
    expect(rpc).toHaveBeenCalledWith('acquire_game_lock', expect.objectContaining({
      p_game_id: 'game-1',
      p_actor_user_id: 'user-1',
    }));
  });

  it('persists the full-game x2 carry result as the original online calculation', async () => {
    const snapshot = {
      game: {
        id: 'game-carry', name: 'Carry Table', status: 'draft', rule_set: 'HOUSE_RULES_V1', version: 2,
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
        risk_player_id: null, trump_suit: 'hearts', is_all_loser_round: true,
        consecutive_all_loser_count_before_round: 0, carried_all_loser_multiplier: 1,
        carry_consumed: false, multiple_with_multiplier: 1,
        bids: [
          { player_id: 'p1', bid_type: 'normal', tricks: 5, trump_suit: 'hearts', with_target_player_id: null },
          { player_id: 'p2', bid_type: 'normal', tricks: 4, trump_suit: null, with_target_player_id: null },
          { player_id: 'p3', bid_type: 'normal', tricks: 2, trump_suit: null, with_target_player_id: null },
          { player_id: 'p4', bid_type: 'normal', tricks: 1, trump_suit: null, with_target_player_id: null },
        ],
        actuals: [
          { player_id: 'p1', actual_tricks: 4 }, { player_id: 'p2', actual_tricks: 3 },
          { player_id: 'p3', actual_tricks: 3 }, { player_id: 'p4', actual_tricks: 3 },
        ],
        scores: ['p1', 'p2', 'p3', 'p4'].map((playerId, index) => ({
          player_id: playerId, bid_tricks: [5, 4, 2, 1][index], actual_tricks: [4, 3, 3, 3][index],
          delta: [1, 1, 1, 2][index], did_match_bid: false,
          role: index === 0 ? 'bid-owner' : 'other-player', risk_type: 'none',
          is_risk_taker: false, risk_modifier: 0, is_high_contract: false,
          is_only_winner: false, is_only_loser: false, status: 'failed',
          calculated_score: 0, applied_score: 0, notes: [],
        })),
      }],
      overrides: [],
      lock: null,
    };
    const rpc = vi.fn(async (name: string, _args?: Readonly<Record<string, unknown>>) => {
      if (name === 'get_game_snapshot') return { data: snapshot, error: null };
      if (name === 'acquire_game_lock') {
        return {
          data: { game_id: 'game-carry', holder_user_id: 'user-1', expires_at: '2026-07-23T11:15:00.000Z' },
          error: null,
        };
      }
      if (name === 'save_game_round') {
        const payload = _args?.p_round_payload as any;
        (snapshot.rounds as any[]).push({
          id: 'round-2',
          round_number: payload.roundNumber,
          round_type: payload.roundResult.bidValidation.roundType,
          bid_owner_player_id: payload.roundInput.bidOwnerPlayerId,
          risk_player_id: payload.roundInput.riskPlayerId ?? null,
          trump_suit: payload.roundInput.bids.find((bid: any) => bid.playerId === payload.roundInput.bidOwnerPlayerId)?.trumpSuit,
          is_all_loser_round: payload.roundResult.isAllLoserRound,
          consecutive_all_loser_count_before_round: payload.roundResult.consecutiveAllLoserCountBeforeRound,
          carried_all_loser_multiplier: payload.roundResult.carriedAllLoserMultiplier,
          carry_consumed: payload.roundResult.carryConsumed,
          multiple_with_multiplier: payload.roundInput.multipleWithMultiplier ?? 1,
          bids: payload.roundInput.bids.map((bid: any) => ({
            player_id: bid.playerId,
            bid_type: bid.bidType,
            tricks: bid.tricks,
            trump_suit: bid.trumpSuit ?? null,
            with_target_player_id: bid.withTargetPlayerId ?? null,
          })),
          actuals: payload.roundInput.actualResults.map((actual: any) => ({
            player_id: actual.playerId,
            actual_tricks: actual.actualTricks,
          })),
          scores: payload.roundResult.scoreResult.playerScores.map((score: any) => ({
            player_id: score.playerId,
            bid_tricks: score.bidTricks,
            actual_tricks: score.actualTricks,
            delta: score.delta,
            did_match_bid: score.didMatchBid,
            role: score.role,
            risk_type: score.riskType,
            is_risk_taker: score.isRiskTaker,
            risk_modifier: score.riskModifier,
            is_high_contract: score.isHighContract,
            is_only_winner: score.isOnlyWinner,
            is_only_loser: score.isOnlyLoser,
            status: score.status,
            calculated_score: score.score,
            applied_score: score.score,
            notes: score.notes,
          })),
        });
        snapshot.game.version += 1;
        return {
          data: {
            game_id: 'game-carry',
            round_number: payload.roundNumber,
            version: snapshot.game.version,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } };
    });
    const service = new OnlineBrowserShellService({ from: vi.fn(), rpc }, session);
    await service.openSession('game-carry');

    const profile = {
      id: 'house-rules-v1', name: 'House Rules V1', type: 'standard' as const, ruleSet: 'HOUSE_RULES_V1' as const,
    };
    const scoredInput = {
      roundNumber: 2,
      bidOwnerPlayerId: 'p1',
      profile,
      bids: [
        { playerId: 'p1', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
        { playerId: 'p2', bidType: 'normal', tricks: 4 },
        { playerId: 'p3', bidType: 'normal', tricks: 2 },
        { playerId: 'p4', bidType: 'normal', tricks: 0 },
      ],
      actualResults: [
        { playerId: 'p1', actualTricks: 5 }, { playerId: 'p2', actualTricks: 4 },
        { playerId: 'p3', actualTricks: 2 }, { playerId: 'p4', actualTricks: 2 },
      ],
    } as const;
    const result = await service.saveRound('game-carry', scoredInput);

    expect(result.valid).toBe(true);
    const rpcCalls = rpc.mock.calls as unknown as Array<[string, Readonly<Record<string, unknown>>]>;
    const saveCall = rpcCalls.find(([name]) => name === 'save_game_round');
    const payload = saveCall?.[1]?.p_round_payload as any;
    expect(payload.roundResult.carriedAllLoserMultiplier).toBe(2);
    expect(payload.roundResult.carryConsumed).toBe(true);
    expect(payload.roundResult.scoreResult.playerScores.map((score: any) => score.score)).toEqual([50, 28, 24, -24]);
    expect(snapshot.overrides).toEqual([]);

    const reopened = await service.openSession('game-carry');
    expect(reopened.roundHistory?.[1]?.playerScores.map((score) => score.score)).toEqual([50, 28, 24, -24]);
    expect((snapshot.rounds[1] as any).scores.every(
      (score: any) => score.calculated_score === score.applied_score,
    )).toBe(true);

    const storedCarryRound = snapshot.rounds[1] as any;
    storedCarryRound.scores = storedCarryRound.scores.map((score: any) => ({
      ...score,
      calculated_score: score.calculated_score / 2,
      applied_score: score.applied_score / 2,
    }));
    const legacyReopened = await service.openSession('game-carry');
    expect(legacyReopened.roundHistory?.[1]?.playerScores.map((score) => score.score))
      .toEqual([50, 28, 24, -24]);
    expect(legacyReopened.scoreSheet?.scoreOverrides).toEqual([]);

    (snapshot.overrides as any[]).push({
      id: 'override-1',
      round_number: 2,
      player_id: 'p1',
      calculated_score: 25,
      previous_applied_score: 25,
      new_applied_score: 7,
      reason: 'UAT manual edit',
      changed_at: '2026-07-23T11:05:00.000Z',
      changed_by: 'user-1',
    });
    storedCarryRound.scores[0].applied_score = 7;
    const activelyOverridden = await service.openSession('game-carry');
    expect(activelyOverridden.roundHistory?.[1]?.playerScores.map((score) => score.score))
      .toEqual([7, 28, 24, -24]);
    expect(activelyOverridden.scoreSheet?.scoreOverrides).toHaveLength(1);

    (snapshot.overrides as any[]).push({
      id: 'override-2',
      round_number: 2,
      player_id: 'p1',
      calculated_score: 25,
      previous_applied_score: 7,
      new_applied_score: 25,
      reason: 'Restore original',
      changed_at: '2026-07-23T11:06:00.000Z',
      changed_by: 'user-1',
    });
    storedCarryRound.scores[0].applied_score = 25;
    const restored = await service.openSession('game-carry');
    expect(restored.roundHistory?.[1]?.playerScores.map((score) => score.score))
      .toEqual([50, 28, 24, -24]);
    expect(restored.scoreSheet?.scoreOverrides).toHaveLength(2);

    const allLoserInput = {
      bidOwnerPlayerId: 'p1',
      profile,
      bids: [
        { playerId: 'p1', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
        { playerId: 'p2', bidType: 'normal', tricks: 4 },
        { playerId: 'p3', bidType: 'normal', tricks: 2 },
        { playerId: 'p4', bidType: 'normal', tricks: 1 },
      ],
      actualResults: [
        { playerId: 'p1', actualTricks: 4 }, { playerId: 'p2', actualTricks: 3 },
        { playerId: 'p3', actualTricks: 3 }, { playerId: 'p4', actualTricks: 3 },
      ],
    } as const;
    await service.saveRound('game-carry', { ...allLoserInput, roundNumber: 3 });
    await service.saveRound('game-carry', { ...allLoserInput, roundNumber: 4 });
    await service.saveRound('game-carry', { ...scoredInput, roundNumber: 5 });

    const finalSaveCall = rpcCalls.filter(([name]) => name === 'save_game_round').at(-1);
    const x4Payload = finalSaveCall?.[1].p_round_payload as any;
    expect(x4Payload.roundResult.carriedAllLoserMultiplier).toBe(4);
    expect(x4Payload.roundResult.scoreResult.playerScores.map((score: any) => score.score)).toEqual([100, 56, 48, -48]);
    expect(snapshot.overrides).toHaveLength(2);
  });
});
