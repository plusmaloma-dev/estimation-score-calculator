import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  HouseRulesRoundEngine,
  type CreateHouseRulesRoundInput,
  type GameplayStateTransition,
  type HouseRulesRoundState,
  type SeatIndex,
} from '../src/index.js';

type AuctionAction =
  | { readonly type: 'pass' }
  | { readonly type: 'contract'; readonly tricks: number; readonly trumpSuit: 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no-trump' }
  | { readonly type: 'with'; readonly referenceSeat: SeatIndex };

interface AuctionState {
  readonly phase: 'auction' | 'estimate' | 'playing' | 'scored';
  readonly dealerSeat: SeatIndex;
  readonly auctionActiveSeat?: SeatIndex;
  readonly passedAuctionSeats: readonly SeatIndex[];
  readonly consecutiveAuctionPasses: number;
  readonly currentHighestContract?: { readonly seat: SeatIndex; readonly tricks: number; readonly trumpSuit: string };
  readonly callerSeat?: SeatIndex;
  readonly trumpSuit?: string;
  readonly estimateOrder: readonly SeatIndex[];
  readonly currentEstimateIndex: number;
  readonly auctionHistory: readonly { readonly seat: SeatIndex; readonly action: AuctionAction }[];
}

interface AuctionRoundEngine {
  submitAuctionAction(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    action: AuctionAction,
  ): GameplayStateTransition;
}

const players = [
  { seat: 0, playerId: 'p0' },
  { seat: 1, playerId: 'p1' },
  { seat: 2, playerId: 'p2' },
  { seat: 3, playerId: 'p3' },
] as const;

async function fixture(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({
    gameId: 'auction-engine-game',
    dealId: 'auction-engine-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'auction-engine-nonce',
    seedHex: 'a7'.repeat(32),
    firstSeat: 1,
  });

  return {
    roundNumber: 1,
    players,
    hands: deal.hands,
    bidOrder: [1, 2, 3, 0],
    playOrder: [0, 1, 2, 3],
    bidOwnerSeat: 0,
    firstLeadSeat: 1,
  };
}

function auctionState(state: HouseRulesRoundState): AuctionState {
  return state as unknown as AuctionState;
}

function accepted(result: GameplayStateTransition): HouseRulesRoundState {
  assert.equal(result.valid, true, result.errors.join('\n'));
  return result.state;
}

function auctionEngine(): AuctionRoundEngine {
  return new HouseRulesRoundEngine() as unknown as AuctionRoundEngine;
}

test('the second player from dealer opens a distinct auction and dealer is not preassigned caller', async () => {
  const state = auctionState(new HouseRulesRoundEngine().create(await fixture()));

  assert.equal(state.phase, 'auction');
  assert.equal(state.dealerSeat, 0);
  assert.equal(state.auctionActiveSeat, 1);
  assert.equal(state.callerSeat, undefined);
  assert.equal(state.trumpSuit, undefined);
});

test('opening Pass advances auction and removes that player from later auction actions', async () => {
  let state = new HouseRulesRoundEngine().create(await fixture());
  state = accepted(auctionEngine().submitAuctionAction(state, 1, { type: 'pass' }));

  assert.deepEqual(auctionState(state).passedAuctionSeats, [1]);
  assert.equal(auctionState(state).auctionActiveSeat, 2);
  const reentry = auctionEngine().submitAuctionAction(state, 1, {
    type: 'contract', tricks: 4, trumpSuit: 'clubs',
  });
  assert.equal(reentry.valid, false);
  assert.match(reentry.errors.join(' '), /passed/i);
});

test('legal normal contracts follow the complete suit and trick ordering', async () => {
  let state = new HouseRulesRoundEngine().create(await fixture());
  state = accepted(auctionEngine().submitAuctionAction(state, 1, {
    type: 'contract', tricks: 4, trumpSuit: 'clubs',
  }));
  for (const [seat, trumpSuit] of [[2, 'diamonds'], [3, 'hearts'], [0, 'spades'], [1, 'no-trump']] as const) {
    state = accepted(auctionEngine().submitAuctionAction(state, seat, {
      type: 'contract', tricks: 4, trumpSuit,
    }));
  }
  state = accepted(auctionEngine().submitAuctionAction(state, 2, {
    type: 'contract', tricks: 5, trumpSuit: 'clubs',
  }));
  assert.deepEqual(auctionState(state).currentHighestContract, {
    seat: 2, playerId: 'p2', tricks: 5, trumpSuit: 'clubs',
  });
});

test('lower or equal contracts are rejected while a same-contract WITH is accepted and can later raise', async () => {
  let state = new HouseRulesRoundEngine().create(await fixture());
  state = accepted(auctionEngine().submitAuctionAction(state, 1, {
    type: 'contract', tricks: 4, trumpSuit: 'clubs',
  }));
  const insufficient = auctionEngine().submitAuctionAction(state, 2, {
    type: 'contract', tricks: 4, trumpSuit: 'clubs',
  });
  assert.equal(insufficient.valid, false);

  state = accepted(auctionEngine().submitAuctionAction(state, 2, { type: 'with', referenceSeat: 1 }));
  state = accepted(auctionEngine().submitAuctionAction(state, 3, { type: 'pass' }));
  state = accepted(auctionEngine().submitAuctionAction(state, 0, { type: 'pass' }));
  state = accepted(auctionEngine().submitAuctionAction(state, 1, {
    type: 'contract', tricks: 4, trumpSuit: 'diamonds',
  }));
  state = accepted(auctionEngine().submitAuctionAction(state, 2, {
    type: 'contract', tricks: 4, trumpSuit: 'hearts',
  }));

  assert.equal(auctionState(state).currentHighestContract?.seat, 2);
  assert.equal(auctionState(state).consecutiveAuctionPasses, 0);
});

test('three passes after the latest contract resolve the caller and start only non-caller estimates', async () => {
  let state = new HouseRulesRoundEngine().create(await fixture());
  state = accepted(auctionEngine().submitAuctionAction(state, 1, {
    type: 'contract', tricks: 5, trumpSuit: 'hearts',
  }));
  state = accepted(auctionEngine().submitAuctionAction(state, 2, { type: 'pass' }));
  state = accepted(auctionEngine().submitAuctionAction(state, 3, { type: 'pass' }));
  state = accepted(auctionEngine().submitAuctionAction(state, 0, { type: 'pass' }));
  const resolved = auctionState(state);

  assert.equal(resolved.phase, 'estimate');
  assert.equal(resolved.callerSeat, 1);
  assert.equal(resolved.trumpSuit, 'hearts');
  assert.deepEqual(resolved.estimateOrder, [2, 3, 0]);
  assert.equal(resolved.auctionActiveSeat, undefined);
  assert.equal(state.bids.find((bid) => bid.playerId === 'p1')?.tricks, 5);
});

test('four opening Passes resolve No Trump without a caller and return estimates to dealer', async () => {
  let state = new HouseRulesRoundEngine().create(await fixture());
  for (const seat of [1, 2, 3, 0] as const) {
    state = accepted(auctionEngine().submitAuctionAction(state, seat, { type: 'pass' }));
  }
  const resolved = auctionState(state);

  assert.equal(resolved.phase, 'estimate');
  assert.equal(resolved.callerSeat, undefined);
  assert.equal(resolved.trumpSuit, 'no-trump');
  assert.deepEqual(resolved.estimateOrder, [0, 1, 2, 3]);
  assert.equal(state.bids.length, 0);
});
