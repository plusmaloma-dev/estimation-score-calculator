import { describe, expect, it } from 'vitest';
import {
  confirmBidding,
  createBiddingState,
  resolveFollow,
  resolveHold,
  resolveMultipleWithMultiplier,
  resolveRiskPlayerId,
  setBiddingEstimate,
  setBiddingTrump,
} from './biddingState.js';

describe('biddingState', () => {
  it('keeps the original owner and trump when a With player follows an owner raise', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P3', 4);

    expect(state.bidOwnerPlayerId).toBe('P1');
    expect(state.statusByPlayerId.P3).toBe('with');

    state = setBiddingEstimate(state, 'P1', 5);

    expect(state.pendingDecisionPlayerIds).toEqual(['P3']);
    expect(state.bidOwnerPlayerId).toBe('P1');
    expect(state.trumpSuit).toBe('hearts');

    state = resolveFollow(state, 'P3');

    expect(state.estimatesByPlayerId.P3).toBe(5);
    expect(state.statusByPlayerId.P3).toBe('with');
    expect(state.pendingDecisionPlayerIds).toEqual([]);
    expect(state.bidOwnerPlayerId).toBe('P1');
    expect(state.trumpSuit).toBe('hearts');
  });

  it('marks multiple former With players Hold and selects the remaining eligible Risk candidate', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'spades');
    state = setBiddingEstimate(state, 'P2', 2);
    state = setBiddingEstimate(state, 'P3', 4);
    state = setBiddingEstimate(state, 'P4', 4);
    state = setBiddingEstimate(state, 'P1', 5);
    state = resolveHold(state, 'P3');
    state = resolveHold(state, 'P4');

    expect(state.statusByPlayerId.P3).toBe('hold');
    expect(state.statusByPlayerId.P4).toBe('hold');
    expect(state.estimatesByPlayerId.P3).toBe(4);
    expect(state.estimatesByPlayerId.P4).toBe(4);
    expect(resolveRiskPlayerId(state)).toBe('P2');
    expect(resolveMultipleWithMultiplier(state)).toBe(1);
  });

  it('transfers ownership only on a strict overbid and clears the old trump', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingTrump(state, 'diamonds');
    state = setBiddingEstimate(state, 'P3', 5);

    expect(state.bidOwnerPlayerId).toBe('P1');
    expect(state.trumpSuit).toBe('diamonds');

    state = setBiddingEstimate(state, 'P3', 6);

    expect(state.bidOwnerPlayerId).toBe('P3');
    expect(state.winningEstimate).toBe(6);
    expect(state.trumpSuit).toBeUndefined();
    expect(state.statusByPlayerId.P1).toBe('normal');
  });

  it('updates the winning estimate when the owner lowers their bid but remains highest', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 9);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P2', 3);
    state = setBiddingEstimate(state, 'P3', 3);
    state = setBiddingEstimate(state, 'P4', 3);

    state = setBiddingEstimate(state, 'P1', 6);

    expect(state.bidOwnerPlayerId).toBe('P1');
    expect(state.winningEstimate).toBe(6);
    expect(state.trumpSuit).toBe('hearts');
    expect(confirmBidding(state).errors).toEqual([]);
  });

  it('requires every pending With player to Follow or Hold before confirmation', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'no-trump');
    state = setBiddingEstimate(state, 'P3', 4);
    state = setBiddingEstimate(state, 'P1', 5);

    expect(confirmBidding(state).errors).toContain('Every With player must choose Follow or Hold.');

    state = resolveFollow(state, 'P3');
    const confirmed = confirmBidding(state);

    expect(confirmed.errors).toEqual([]);
    expect(confirmed.state.confirmed).toBe(true);
  });

  it('returns x2 only when at least two active With players remain at confirmation', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingTrump(state, 'clubs');
    state = setBiddingEstimate(state, 'P2', 1);
    state = setBiddingEstimate(state, 'P3', 5);
    state = setBiddingEstimate(state, 'P4', 5);

    expect(resolveMultipleWithMultiplier(state)).toBe(2);

    state = setBiddingEstimate(state, 'P1', 6);
    state = resolveFollow(state, 'P3');
    state = resolveHold(state, 'P4');

    expect(resolveMultipleWithMultiplier(state)).toBe(1);
  });

  it('does not activate Risk without the agreed Over or Under threshold', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P2', 3);
    state = setBiddingEstimate(state, 'P3', 3);
    state = setBiddingEstimate(state, 'P4', 4);

    expect(resolveRiskPlayerId(state)).toBeUndefined();
  });
});