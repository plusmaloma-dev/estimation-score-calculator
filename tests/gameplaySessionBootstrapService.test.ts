import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeterministicRandomSource,
  GameplayRoundSnapshotProjector,
  GameplaySessionBootstrapService,
  type GameplaySessionBootstrapInput,
  type SeatIndex,
} from '../src/index.js';

const seats = [
  { seat: 0, playerId: 'human-host' },
  { seat: 1, playerId: 'standard-bot:table-1:1' },
  { seat: 2, playerId: 'human-guest' },
  { seat: 3, playerId: 'standard-bot:table-1:3' },
] as const;

function input(
  overrides: Partial<GameplaySessionBootstrapInput> = {},
): GameplaySessionBootstrapInput {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    seats,
    seedHex: 'a7'.repeat(32),
    dealId: 'deal-1',
    nonce: 'nonce-1',
    ...overrides,
  };
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

test('secure bootstrap maps four seats, selects an unbiased deterministic caller, and creates thirteen-card hands', async () => {
  const service = new GameplaySessionBootstrapService();
  const expectedDealer = await new DeterministicRandomSource(
    hexToBytes(input().seedHex),
  ).nextInt(4) as SeatIndex;

  const result = await service.bootstrap(input());

  assert.equal(result.dealerSeat, expectedDealer);
  assert.equal(result.state.bidOwnerSeat, expectedDealer);
  assert.equal(result.state.bidOrder[0], expectedDealer);
  assert.deepEqual(result.state.bidOrder, [
    expectedDealer,
    (expectedDealer + 1) % 4,
    (expectedDealer + 2) % 4,
    (expectedDealer + 3) % 4,
  ]);
  assert.equal(result.firstLeadSeat, (expectedDealer + 1) % 4);
  assert.equal(result.firstTurn.seat, expectedDealer);
  assert.equal(result.firstTurn.actionKind, 'bid');
  assert.match(result.firstTurn.turnId, /^round-1:bid:0:[0-3]$/);
  assert.deepEqual(result.state.players, seats);
  assert.deepEqual(result.state.hands.map((hand) => hand.cards.length), [13, 13, 13, 13]);
  assert.equal(new Set(result.state.hands.flatMap((hand) => hand.cards.map(
    (card) => `${card.rank}-${card.suit}`,
  ))).size, 52);
});

test('bootstrap retains private verification data while exposing only the commitment to a player snapshot', async () => {
  const result = await new GameplaySessionBootstrapService().bootstrap(input());
  const audit = result.state.dealAudit;

  assert.equal(audit?.seedHex, input().seedHex);
  assert.equal(audit?.dealId, 'deal-1');
  assert.equal(audit?.nonce, 'nonce-1');
  assert.equal(audit?.shuffledDeck.length, 52);
  assert.equal(audit?.commitment, result.dealCommitment);
  assert.equal(audit?.revealed, false);

  const snapshot = new GameplayRoundSnapshotProjector().project(
    'table-1',
    result.state,
    0,
    0,
  );
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.dealCommitment, result.dealCommitment);
  assert.equal(serialized.includes(input().seedHex), false);
  assert.equal(serialized.includes('shuffledDeck'), false);
  assert.equal(serialized.includes('nonce-1'), false);
  assert.equal(serialized.includes('dealAudit'), false);
});

test('same secure inputs reproduce the same dealer, commitment, hands, and first turn', async () => {
  const service = new GameplaySessionBootstrapService();

  const first = await service.bootstrap(input());
  const second = await service.bootstrap(input());

  assert.equal(second.dealerSeat, first.dealerSeat);
  assert.equal(second.dealCommitment, first.dealCommitment);
  assert.deepEqual(second.state.hands, first.state.hands);
  assert.deepEqual(second.firstTurn, first.firstTurn);
});

test('bootstrap rejects incomplete, duplicated, or invalid seat/player identity', async () => {
  const service = new GameplaySessionBootstrapService();
  const malformed = [
    { seat: 0, playerId: 'human-host' },
    { seat: 1, playerId: 'bot-1' },
    { seat: 1, playerId: 'duplicate-seat' },
    { seat: 3, playerId: '' },
  ] as unknown as GameplaySessionBootstrapInput['seats'];

  await assert.rejects(
    () => service.bootstrap(input({ seats: malformed })),
    /exactly one valid player for seats 0, 1, 2, and 3/i,
  );
  await assert.rejects(
    () => service.bootstrap(input({ tableId: '' })),
    /table id is required/i,
  );
});
