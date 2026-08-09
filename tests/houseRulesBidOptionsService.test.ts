import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  HouseRulesRoundEngine,
  type CreateHouseRulesRoundInput,
  type GameplayStateTransition,
  type HouseRulesRoundState,
} from '../src/index.js';
import { HouseRulesBidOptionsService } from '../src/gameplay/HouseRulesBidOptionsService.js';

const players = [
  { seat: 0, playerId: 'p0' },
  { seat: 1, playerId: 'p1' },
  { seat: 2, playerId: 'p2' },
  { seat: 3, playerId: 'p3' },
] as const;

async function fixture(): Promise<CreateHouseRulesRoundInput> {
  const deal = await new FairDealService().deal({
    gameId: 'bid-options-game',
    dealId: 'bid-options-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'bid-options-nonce',
    seedHex: '83'.repeat(32),
    firstSeat: 1,
  });

  return {
    roundNumber: 1,
    players,
    hands: deal.hands,
    bidOrder: [2, 3, 0, 1],
    playOrder: [0, 1, 2, 3],
    bidOwnerSeat: 2,
    firstLeadSeat: 0,
  };
}

function accepted(result: GameplayStateTransition): HouseRulesRoundState {
  assert.equal(result.valid, true, result.errors.join('\n'));
  return result.state;
}

test('active fixed owner receives normal estimate options that require contract suits in authoritative order', async () => {
  const state = new HouseRulesRoundEngine().create(await fixture());
  const options = new HouseRulesBidOptionsService().legalOptions(state, 2);

  assert.equal(options.length, 13);
  assert.deepEqual(options[5], {
    tricks: 5,
    bidType: 'normal',
    requiresContractSuit: true,
    legalContractSuits: ['no-trump', 'spades', 'hearts', 'diamonds', 'clubs'],
  });
});

test('non-owner receives lower normal options and equal With option, but no greater-than-owner option', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await fixture());
  state = accepted(engine.submitBid(state, 2, {
    playerId: 'p2',
    bidType: 'normal',
    tricks: 5,
    trumpSuit: 'spades',
  }));

  const options = new HouseRulesBidOptionsService().legalOptions(state, 3);

  assert.deepEqual(options.map((option) => option.tricks), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(options.find((option) => option.tricks === 4), {
    tricks: 4,
    bidType: 'normal',
    requiresContractSuit: false,
    legalContractSuits: [],
  });
  assert.deepEqual(options.find((option) => option.tricks === 5), {
    tricks: 5,
    bidType: 'with',
    requiresContractSuit: false,
    legalContractSuits: [],
    withTargetPlayerId: 'p2',
  });
  assert.equal(options.some((option) => option.tricks === 6), false);
});

test('final bidder cannot choose an option that makes total estimates exactly thirteen', async () => {
  const engine = new HouseRulesRoundEngine();
  let state = engine.create(await fixture());
  state = accepted(engine.submitBid(state, 2, {
    playerId: 'p2',
    bidType: 'normal',
    tricks: 5,
    trumpSuit: 'spades',
  }));
  state = accepted(engine.submitBid(state, 3, { playerId: 'p3', bidType: 'normal', tricks: 3 }));
  state = accepted(engine.submitBid(state, 0, { playerId: 'p0', bidType: 'normal', tricks: 2 }));

  const options = new HouseRulesBidOptionsService().legalOptions(state, 1);

  assert.equal(options.some((option) => option.tricks === 3), false);
  assert.equal(options.some((option) => option.tricks === 2), true);
  assert.equal(options.some((option) => option.tricks === 4), true);
});

test('inactive or non-bidding seats receive no options and state is not mutated', async () => {
  const engine = new HouseRulesRoundEngine();
  const state = engine.create(await fixture());
  const before = JSON.stringify(state);
  const service = new HouseRulesBidOptionsService();

  assert.deepEqual(service.legalOptions(state, 0), []);
  assert.equal(JSON.stringify(state), before);

  const playing = accepted(engine.submitBid(
    accepted(engine.submitBid(
      accepted(engine.submitBid(
        accepted(engine.submitBid(state, 2, {
          playerId: 'p2',
          bidType: 'normal',
          tricks: 5,
          trumpSuit: 'spades',
        })),
        3,
        { playerId: 'p3', bidType: 'normal', tricks: 3 },
      )),
      0,
      { playerId: 'p0', bidType: 'normal', tricks: 2 },
    )),
    1,
    { playerId: 'p1', bidType: 'normal', tricks: 1 },
  ));
  assert.deepEqual(service.legalOptions(playing, 0), []);
});
