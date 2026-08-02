import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayRoundSnapshotProjector,
  GameplaySessionBootstrapService,
  type GameplayFirstRoundBootstrapInput,
  type GameplaySessionBootstrapRequest,
} from '../src/index.js';

const seats = [
  { seat: 0, playerId: 'human-host' },
  { seat: 1, playerId: 'standard-bot:table-1:1' },
  { seat: 2, playerId: 'human-guest' },
  { seat: 3, playerId: 'standard-bot:table-1:3' },
] as const;

function input(
  overrides: Partial<Omit<GameplayFirstRoundBootstrapInput, 'initialization'>> = {},
): GameplayFirstRoundBootstrapInput {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    seats,
    seedHex: 'a7'.repeat(32),
    dealId: 'deal-1',
    nonce: 'nonce-1',
    initialization: { kind: 'first-round' },
    ...overrides,
  };
}

function subsequentInput(
  overrides: {
    readonly dealerSeat?: number;
    readonly roundNumber?: number;
    readonly roundMultiplier?: number;
  } = {},
): GameplaySessionBootstrapRequest {
  return {
    ...input({
      roundNumber: overrides.roundNumber ?? 2,
      dealId: 'deal-2',
      nonce: 'nonce-2',
    }),
    initialization: {
      kind: 'subsequent-round',
      dealerSeat: overrides.dealerSeat ?? 1,
      roundMultiplier: overrides.roundMultiplier ?? 2,
    },
  } as GameplaySessionBootstrapRequest;
}

test('secure bootstrap maps four seats, selects an unbiased deterministic caller, and creates thirteen-card hands', async () => {
  const service = new GameplaySessionBootstrapService();

  const result = await service.bootstrap(input());

  assert.equal(result.dealerSeat, 2);
  assert.equal(result.state.bidOwnerSeat, 2);
  assert.deepEqual(result.state.bidOrder, [2, 3, 0, 1]);
  assert.equal(result.firstLeadSeat, 3);
  assert.equal(result.firstTurn.seat, 2);
  assert.equal(result.firstTurn.actionKind, 'bid');
  assert.equal(result.firstTurn.turnId, 'round-1:bid:0:2');
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

test('subsequent bootstrap accepts server-derived seat 1 after seat 0 with the existing order mapping', async () => {
  const result = await new GameplaySessionBootstrapService().bootstrap(subsequentInput());

  assert.equal(result.dealerSeat, 1);
  assert.equal(result.state.bidOwnerSeat, 1);
  assert.deepEqual(result.state.bidOrder, [1, 2, 3, 0]);
  assert.equal(result.firstLeadSeat, 2);
  assert.deepEqual(result.state.playOrder, [0, 1, 2, 3]);
  assert.deepEqual(result.firstTurn, {
    turnId: 'round-2:bid:0:1',
    seat: 1,
    actionKind: 'bid',
  });
});

test('subsequent bootstrap carries the scored round multiplier into a fresh valid deal', async () => {
  const result = await new GameplaySessionBootstrapService().bootstrap(subsequentInput({ roundMultiplier: 2 }));

  assert.equal(result.state.roundNumber, 2);
  assert.equal(result.state.roundMultiplier, 2);
  assert.deepEqual(result.state.hands.map((hand) => hand.cards.length), [13, 13, 13, 13]);
  assert.equal(new Set(result.state.hands.flatMap((hand) => hand.cards.map(
    (card) => `${card.rank}-${card.suit}`,
  ))).size, 52);
});

test('subsequent bootstrap rejects an invalid explicit dealer seat', async () => {
  await assert.rejects(
    () => new GameplaySessionBootstrapService().bootstrap(subsequentInput({ dealerSeat: 4 })),
    /dealer seat must be 0, 1, 2, or 3/i,
  );
});

test('subsequent bootstrap rejects an invalid round number', async () => {
  await assert.rejects(
    () => new GameplaySessionBootstrapService().bootstrap(subsequentInput({ roundNumber: 0 })),
    /round number must be a positive integer/i,
  );
});

test('subsequent bootstrap rejects an invalid carried multiplier', async () => {
  await assert.rejects(
    () => new GameplaySessionBootstrapService().bootstrap(subsequentInput({ roundMultiplier: 0 })),
    /round multiplier must be a positive integer/i,
  );
});

test('bootstrap rejects incomplete, duplicated, or invalid seat/player identity', async () => {
  const service = new GameplaySessionBootstrapService();
  const malformed = [
    { seat: 0, playerId: 'human-host' },
    { seat: 1, playerId: 'bot-1' },
    { seat: 1, playerId: 'duplicate-seat' },
    { seat: 3, playerId: '' },
  ] as unknown as GameplaySessionBootstrapRequest['seats'];

  await assert.rejects(
    () => service.bootstrap(input({ seats: malformed })),
    /exactly one valid player for seats 0, 1, 2, and 3/i,
  );
  await assert.rejects(
    () => service.bootstrap(input({ tableId: '' })),
    /table id is required/i,
  );
});
