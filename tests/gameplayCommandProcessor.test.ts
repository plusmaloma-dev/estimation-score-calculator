import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  GameplayCommandProcessor,
  HouseRulesRoundEngine,
  type CreateHouseRulesRoundInput,
  type GameplayCommandEnvelope,
  type HouseRulesRoundState,
} from '../src/index.js';

async function createRound(): Promise<HouseRulesRoundState> {
  const deal = await new FairDealService().deal({
    gameId: 'command-game',
    dealId: 'command-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'command-nonce',
    seedHex: '11'.repeat(32),
    firstSeat: 1,
  });
  const input: CreateHouseRulesRoundInput = {
    roundNumber: 1,
    players: [
      { seat: 0, playerId: 'p0' },
      { seat: 1, playerId: 'p1' },
      { seat: 2, playerId: 'p2' },
      { seat: 3, playerId: 'p3' },
    ],
    hands: deal.hands,
    bidOrder: [2, 3, 0, 1],
    playOrder: [0, 1, 2, 3],
    dealerSeat: 1,
    firstLeadSeat: 0,
  };
  return new HouseRulesRoundEngine().create(input);
}

function firstAuctionAction(commandId = 'command-1', expectedVersion = 0): GameplayCommandEnvelope {
  return {
    commandId,
    expectedVersion,
    command: {
      type: 'SUBMIT_AUCTION_ACTION',
      seat: 2,
      action: {
        type: 'contract',
        tricks: 5,
        trumpSuit: 'spades',
      },
    },
  };
}

test('accepted command increments the version by exactly one and appends its record', async () => {
  const processor = new GameplayCommandProcessor();
  const state = await createRound();

  const result = processor.process(state, 0, [], firstAuctionAction());

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.duplicate, false);
  assert.equal(result.version, 1);
  assert.equal(result.state.phase, 'auction');
  assert.equal(result.state.auctionHistory.length, 1);
  assert.deepEqual(result.state.currentHighestContract, {
    seat: 2,
    playerId: 'p2',
    tricks: 5,
    trumpSuit: 'spades',
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.record?.accepted, true);
  assert.equal(result.record?.resultingVersion, 1);
});

test('same command id and payload returns the original record without applying twice', async () => {
  const processor = new GameplayCommandProcessor();
  const state = await createRound();
  const envelope = firstAuctionAction();
  const first = processor.process(state, 0, [], envelope);

  const duplicate = processor.process(first.state, first.version, first.records, envelope);

  assert.equal(duplicate.valid, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.version, 1);
  assert.equal(duplicate.state.auctionHistory.length, 1);
  assert.equal(duplicate.records.length, 1);
  assert.deepEqual(duplicate.record, first.record);
});

test('reusing a command id with different payload is rejected as an idempotency conflict', async () => {
  const processor = new GameplayCommandProcessor();
  const state = await createRound();
  const first = processor.process(state, 0, [], firstAuctionAction());
  const conflicting: GameplayCommandEnvelope = {
    ...firstAuctionAction(),
    command: {
      type: 'SUBMIT_AUCTION_ACTION',
      seat: 2,
      action: {
        type: 'contract',
        tricks: 6,
        trumpSuit: 'spades',
      },
    },
  };

  const result = processor.process(first.state, first.version, first.records, conflicting);

  assert.equal(result.valid, false);
  assert.equal(result.version, first.version);
  assert.equal(result.state, first.state);
  assert.equal(result.records, first.records);
  assert.ok(result.errors.includes('Command id command-1 was already used with a different payload.'));
});

test('stale expected version is rejected without changing state or version', async () => {
  const processor = new GameplayCommandProcessor();
  const state = await createRound();
  const first = processor.process(state, 0, [], firstAuctionAction());

  const stale = processor.process(first.state, first.version, first.records, {
    commandId: 'command-2',
    expectedVersion: 0,
    command: {
      type: 'SUBMIT_AUCTION_ACTION',
      seat: 3,
      action: { type: 'pass' },
    },
  });

  assert.equal(stale.valid, false);
  assert.equal(stale.version, 1);
  assert.equal(stale.state, first.state);
  assert.ok(stale.errors.includes('Expected game version 0 does not match current version 1.'));
  assert.equal(stale.record?.accepted, false);
  assert.equal(stale.record?.resultingVersion, 1);
});

test('domain-rejected command is recorded but does not increment the version', async () => {
  const processor = new GameplayCommandProcessor();
  const state = await createRound();

  const result = processor.process(state, 0, [], {
    commandId: 'wrong-turn',
    expectedVersion: 0,
    command: {
      type: 'SUBMIT_AUCTION_ACTION',
      seat: 1,
      action: { type: 'pass' },
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.version, 0);
  assert.equal(result.state, state);
  assert.equal(result.records.length, 1);
  assert.equal(result.record?.accepted, false);
  assert.ok(result.errors.includes('Seat 2 must take the next auction action.'));
});
