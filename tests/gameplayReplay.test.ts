import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FairDealService,
  GameplayCommandProcessor,
  GameplayReplayService,
  HouseRulesRoundEngine,
  type CreateHouseRulesRoundInput,
  type GameplayCommandEnvelope,
  type GameplayCommandRecord,
  type HouseRulesRoundState,
} from '../src/index.js';

async function createInitialRound(): Promise<HouseRulesRoundState> {
  const deal = await new FairDealService().deal({
    gameId: 'replay-game',
    dealId: 'replay-deal',
    ruleSet: 'HOUSE_RULES_V1',
    nonce: 'replay-nonce',
    seedHex: '77'.repeat(32),
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
    bidOwnerSeat: 2,
    firstLeadSeat: 0,
  };
  return new HouseRulesRoundEngine().create(input);
}

async function completeRoundHistory(): Promise<{
  readonly initial: HouseRulesRoundState;
  readonly final: HouseRulesRoundState;
  readonly version: number;
  readonly records: readonly GameplayCommandRecord[];
}> {
  const processor = new GameplayCommandProcessor();
  const engine = new HouseRulesRoundEngine();
  const initial = await createInitialRound();
  let state = initial;
  let version = 0;
  let records: readonly GameplayCommandRecord[] = [];

  const bids: readonly GameplayCommandEnvelope[] = [
    {
      commandId: 'bid-1',
      expectedVersion: 0,
      command: {
        type: 'SUBMIT_BID',
        seat: 2,
        bid: { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
      },
    },
    {
      commandId: 'bid-2',
      expectedVersion: 1,
      command: {
        type: 'SUBMIT_BID',
        seat: 3,
        bid: { playerId: 'p3', bidType: 'normal', tricks: 3 },
      },
    },
    {
      commandId: 'bid-3',
      expectedVersion: 2,
      command: {
        type: 'SUBMIT_BID',
        seat: 0,
        bid: { playerId: 'p0', bidType: 'normal', tricks: 2 },
      },
    },
    {
      commandId: 'bid-4',
      expectedVersion: 3,
      command: {
        type: 'SUBMIT_BID',
        seat: 1,
        bid: { playerId: 'p1', bidType: 'normal', tricks: 1 },
      },
    },
  ];

  for (const envelope of bids) {
    const result = processor.process(state, version, records, envelope);
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
    version = result.version;
    records = result.records;
  }

  let playNumber = 0;
  while (state.phase !== 'scored') {
    const seat = state.currentTurnSeat!;
    const card = engine.legalCards(state, seat)[0]!;
    const result = processor.process(state, version, records, {
      commandId: `play-${playNumber}`,
      expectedVersion: version,
      command: { type: 'PLAY_CARD', seat, card },
    });
    assert.equal(result.valid, true, result.errors.join('\n'));
    state = result.state;
    version = result.version;
    records = result.records;
    playNumber += 1;
  }

  return { initial, final: state, version, records };
}

test('complete accepted history deterministically rebuilds the scored round', async () => {
  const history = await completeRoundHistory();

  const replay = new GameplayReplayService().replay(history.initial, history.records);

  assert.equal(replay.valid, true, replay.errors.join('\n'));
  assert.equal(replay.version, 56);
  assert.deepEqual(replay.state, history.final);
});

test('replay rejects an altered command payload', async () => {
  const history = await completeRoundHistory();
  const first = history.records[0]!;
  const altered: GameplayCommandRecord = {
    ...first,
    command: {
      type: 'SUBMIT_BID',
      seat: 2,
      bid: { playerId: 'p2', bidType: 'normal', tricks: 6, trumpSuit: 'spades' },
    },
  };

  const replay = new GameplayReplayService().replay(history.initial, [
    altered,
    ...history.records.slice(1),
  ]);

  assert.equal(replay.valid, false);
  assert.ok(replay.errors.some((error) => error.includes('does not reproduce its recorded transition')));
});

test('replay rejects an accepted-version gap', async () => {
  const history = await completeRoundHistory();
  const missingSecondCommand = [history.records[0]!, ...history.records.slice(2)];

  const replay = new GameplayReplayService().replay(history.initial, missingSecondCommand);

  assert.equal(replay.valid, false);
  assert.ok(replay.errors.includes('Accepted command bid-3 must result in version 2, not 3.'));
});

test('replay rejects duplicate accepted versions', async () => {
  const history = await completeRoundHistory();
  const second = history.records[1]!;
  const duplicateVersion: GameplayCommandRecord = {
    ...second,
    resultingVersion: 1,
  };

  const replay = new GameplayReplayService().replay(history.initial, [
    history.records[0]!,
    duplicateVersion,
    ...history.records.slice(2),
  ]);

  assert.equal(replay.valid, false);
  assert.ok(replay.errors.includes('Accepted command bid-2 must result in version 2, not 1.'));
});
