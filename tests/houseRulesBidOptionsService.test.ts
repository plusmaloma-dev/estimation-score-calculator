import assert from 'node:assert/strict';
import test from 'node:test';

import { FairDealService, HouseRulesRoundEngine, type CreateHouseRulesRoundInput, type GameplayStateTransition, type HouseRulesRoundState } from '../src/index.js';
import { HouseRulesBidOptionsService } from '../src/gameplay/HouseRulesBidOptionsService.js';

const players = [{ seat: 0, playerId: 'p0' }, { seat: 1, playerId: 'p1' }, { seat: 2, playerId: 'p2' }, { seat: 3, playerId: 'p3' }] as const;
async function fixture(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({ gameId: 'bid-options-game', dealId: 'bid-options-deal', ruleSet: 'HOUSE_RULES_V1', nonce: 'bid-options-nonce', seedHex: '83'.repeat(32), firstSeat: 1 });
  return { roundNumber: 1, players, hands: deal.hands, bidOrder: [2, 3, 0, 1], playOrder: [0, 1, 2, 3], dealerSeat: 1, firstLeadSeat: 0 };
}
function accepted(result: GameplayStateTransition): HouseRulesRoundState { assert.equal(result.valid, true, result.errors.join('\n')); return result.state; }
function resolveAuction(engine: HouseRulesRoundEngine, initial: HouseRulesRoundState, withSeat?: 3): HouseRulesRoundState {
  let state = accepted(engine.submitAuctionAction(initial, 2, { type: 'contract', tricks: 5, trumpSuit: 'spades' }));
  state = withSeat === 3
    ? accepted(engine.submitAuctionAction(state, 3, { type: 'with', referenceSeat: 2 }))
    : accepted(engine.submitAuctionAction(state, 3, { type: 'pass' }));
  state = accepted(engine.submitAuctionAction(state, 0, { type: 'pass' }));
  state = accepted(engine.submitAuctionAction(state, 1, { type: 'pass' }));
  if (state.phase === 'auction') state = accepted(engine.submitAuctionAction(state, 2, { type: 'pass' }));
  return state;
}

test('active auction seat receives Pass, every strictly higher contract, and a same-contract WITH action', async () => {
  const state = new HouseRulesRoundEngine().create(await fixture());
  const actions = new HouseRulesBidOptionsService().legalAuctionActions(state, 2).map((option) => option.action);
  assert.ok(actions.some((action) => action.type === 'pass'));
  assert.ok(actions.some((action) => action.type === 'contract' && action.tricks === 4 && action.trumpSuit === 'clubs'));
  assert.equal(actions.some((action) => action.type === 'with'), false);
  const engine = new HouseRulesRoundEngine();
  const afterContract = accepted(engine.submitAuctionAction(state, 2, { type: 'contract', tricks: 4, trumpSuit: 'clubs' }));
  const nextActions = new HouseRulesBidOptionsService().legalAuctionActions(afterContract, 3).map((option) => option.action);
  assert.ok(nextActions.some((action) => action.type === 'contract' && action.tricks === 4 && action.trumpSuit === 'diamonds'));
  assert.ok(nextActions.some((action) => action.type === 'contract' && action.tricks === 5 && action.trumpSuit === 'clubs'));
  assert.ok(nextActions.some((action) => action.type === 'with' && action.referenceSeat === 2));
});

test('estimate options are ordinary numeric estimates and expose no WITH action', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = resolveAuction(engine, engine.create(await fixture()));
  const options = new HouseRulesBidOptionsService().legalOptions(state, 3);
  assert.deepEqual(options.map((option) => option.tricks), [0, 1, 2, 3, 4, 5]);
  assert.ok(options.every((option) => option.bidType === 'normal' && option.requiresContractSuit === false));
});

test('ordinary estimates may match the caller while an applicable auction WITH receives the scoring role', async () => {
  const engine = new HouseRulesRoundEngine();
  const withState = resolveAuction(engine, engine.create(await fixture()), 3);
  const withOptions = new HouseRulesBidOptionsService().legalOptions(withState, 3);
  assert.ok(withOptions.some((option) => option.tricks === 5));
  const acceptedWith = accepted(engine.submitBid(withState, 3, { playerId: 'p3', bidType: 'normal', tricks: 5 }));
  assert.deepEqual(acceptedWith.bids.at(-1), { playerId: 'p3', bidType: 'with', tricks: 5, withTargetPlayerId: 'p2' });

  const normalState = resolveAuction(engine, engine.create(await fixture()), undefined);
  const normalOptions = new HouseRulesBidOptionsService().legalOptions(normalState, 3);
  assert.ok(normalOptions.some((option) => option.tricks === 5));
  const acceptedNormal = accepted(engine.submitBid(normalState, 3, { playerId: 'p3', bidType: 'normal', tricks: 5 }));
  assert.deepEqual(acceptedNormal.bids.at(-1), { playerId: 'p3', bidType: 'normal', tricks: 5 });
});

test('final estimator never receives the option that would make total estimates thirteen', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = resolveAuction(engine, engine.create(await fixture()));
  state = accepted(engine.submitBid(state, 3, { playerId: 'p3', bidType: 'normal', tricks: 3 }));
  state = accepted(engine.submitBid(state, 0, { playerId: 'p0', bidType: 'normal', tricks: 2 }));
  const options = new HouseRulesBidOptionsService().legalOptions(state, 1);
  assert.equal(options.some((option) => option.tricks === 3), false);
  assert.equal(options.some((option) => option.tricks === 2), true);
});
