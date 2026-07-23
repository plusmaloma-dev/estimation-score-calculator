import { describe, expect, it } from 'vitest';
import {
  confirmBidding,
  createBiddingState,
  resolveMultipleWithMultiplier,
  resolveRiskPlayerId,
  setBiddingEstimate,
  setBiddingTrump,
  toggleBiddingHold,
} from './biddingState.js';

describe('biddingState', () => {
  it('selects Hold only through an explicit non-owner toggle and can remove it', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P3', 5);

    expect(state.statusByPlayerId.P3).toBe('with');
    state = toggleBiddingHold(state, 'P3');
    expect(state.statusByPlayerId.P3).toBe('hold');
    expect(state.estimatesByPlayerId.P3).toBe(5);

    state = toggleBiddingHold(state, 'P3');
    expect(state.statusByPlayerId.P3).toBe('with');
  });

  it('keeps manual Hold through owner estimate and trump changes without inferring new Holds', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P3', 4);
    state = toggleBiddingHold(state, 'P3');

    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingTrump(state, 'spades');

    expect(state.statusByPlayerId.P3).toBe('hold');
    expect(state.estimatesByPlayerId.P3).toBe(4);
    expect(state.statusByPlayerId.P4).toBe('normal');
    expect(confirmBidding(state).errors).toEqual([]);
  });

  it('clears Hold when its estimate is removed or its player becomes owner', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingEstimate(state, 'P3', 3);
    state = toggleBiddingHold(state, 'P3');

    state = setBiddingEstimate(state, 'P3', undefined);
    expect(state.statusByPlayerId.P3).toBe('normal');

    state = setBiddingEstimate(state, 'P3', 3);
    state = toggleBiddingHold(state, 'P3');
    state = setBiddingEstimate(state, 'P3', 0);
    expect(state.statusByPlayerId.P3).toBe('normal');

    state = setBiddingEstimate(state, 'P3', 3);
    state = toggleBiddingHold(state, 'P3');
    state = setBiddingEstimate(state, 'P3', 6);
    expect(state.bidOwnerPlayerId).toBe('P3');
    expect(state.statusByPlayerId.P3).toBe('normal');
  });

  it('moves Risk past an explicitly selected Hold and excludes it from multiple WITH', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingTrump(state, 'clubs');
    state = setBiddingEstimate(state, 'P2', 2);
    state = setBiddingEstimate(state, 'P3', 5);
    state = setBiddingEstimate(state, 'P4', 5);

    expect(resolveRiskPlayerId(state)).toBe('P4');
    expect(resolveMultipleWithMultiplier(state)).toBe(2);

    state = toggleBiddingHold(state, 'P4');
    expect(resolveRiskPlayerId(state)).toBe('P3');
    expect(resolveMultipleWithMultiplier(state)).toBe(1);
  });

  it('does not activate Risk from Hold when the estimate total is outside a Risk threshold', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 5);
    state = setBiddingTrump(state, 'diamonds');
    state = setBiddingEstimate(state, 'P2', 3);
    state = setBiddingEstimate(state, 'P3', 4);
    state = toggleBiddingHold(state, 'P3');

    expect(state.statusByPlayerId.P3).toBe('hold');
    expect(resolveRiskPlayerId(state)).toBeUndefined();
  });

  it('does not infer Hold when bid ownership transfers', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P2', 5);

    expect(state.bidOwnerPlayerId).toBe('P2');
    expect(state.statusByPlayerId.P1).toBe('normal');
    expect(state.statusByPlayerId.P2).toBe('normal');
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

  it('does not activate Risk without the agreed Over or Under threshold', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 4);
    state = setBiddingTrump(state, 'hearts');
    state = setBiddingEstimate(state, 'P2', 3);
    state = setBiddingEstimate(state, 'P3', 3);
    state = setBiddingEstimate(state, 'P4', 4);

    expect(resolveRiskPlayerId(state)).toBeUndefined();
  });

  it('assigns Risk to the last caller when an Over-by-two round ends with a one-trick estimate', () => {
    let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
    state = setBiddingEstimate(state, 'P1', 8);
    state = setBiddingTrump(state, 'spades');
    state = setBiddingEstimate(state, 'P2', 5);
    state = setBiddingEstimate(state, 'P3', 1);
    state = setBiddingEstimate(state, 'P4', 1);

    expect(resolveRiskPlayerId(state)).toBe('P4');
  });
});
