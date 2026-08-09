import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalDeck,
  OnlineGameplayRoundService,
  type GameplayRoundFunctionClient,
} from '../src/index.js';

interface InvokeCall {
  readonly name: string;
  readonly body: Readonly<Record<string, unknown>>;
}

type InvokeResponse = Awaited<ReturnType<GameplayRoundFunctionClient['functions']['invoke']>>;

function client(responses: readonly InvokeResponse[]): GameplayRoundFunctionClient & {
  readonly calls: InvokeCall[];
} {
  const calls: InvokeCall[] = [];
  let index = 0;
  return {
    calls,
    functions: {
      async invoke(name, options) {
        calls.push({ name, body: options.body });
        const response = responses[index] ?? responses[responses.length - 1];
        index += 1;
        return response ?? { data: null, error: { message: 'No fake response.' } };
      },
    },
  };
}

function snapshot(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  const ownHand = createCanonicalDeck().slice(0, 13);
  return {
    tableId: '11111111-1111-4111-8111-111111111111',
    roundNumber: 1,
    phase: 'bidding',
    version: 2,
    viewerSeat: 2,
    bidOwnerSeat: 2,
    riskSeat: 1,
    nextBidSeat: 2,
    players: [
      { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand,
    legalNormalEstimates: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    legalBidOptions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((tricks) => ({
      tricks,
      bidType: 'normal',
      requiresContractSuit: true,
      legalContractSuits: ['no-trump', 'spades', 'hearts', 'diamonds', 'clubs'],
    })),
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

test('getSnapshot calls the authenticated Edge Function without actor spoofing fields', async () => {
  const database = client([{ data: { valid: true, errors: [], duplicate: false, value: snapshot() }, error: null }]);
  const service = new OnlineGameplayRoundService(database);

  const result = await service.getSnapshot('11111111-1111-4111-8111-111111111111');

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.viewerSeat, 2);
  assert.equal(result.value?.riskSeat, 1);
  assert.equal(result.value?.ownHand.length, 13);
  assert.deepEqual(result.value?.legalBidOptions?.[5], {
    tricks: 5,
    bidType: 'normal',
    requiresContractSuit: true,
    legalContractSuits: ['no-trump', 'spades', 'hearts', 'diamonds', 'clubs'],
  });
  assert.deepEqual(database.calls, [{
    name: 'gameplay-round-command',
    body: {
      action: 'snapshot',
      tableId: '11111111-1111-4111-8111-111111111111',
    },
  }]);
  assert.equal('actorUserId' in database.calls[0]!.body, false);
});

test('submitBid and playCard route command identity and expected version exactly', async () => {
  const playing = snapshot({ phase: 'playing', version: 4, nextBidSeat: null, currentTurnSeat: 0 });
  const database = client([
    { data: { valid: true, errors: [], duplicate: false, value: playing }, error: null },
    { data: { valid: true, errors: [], duplicate: false, value: { ...playing, version: 5 } }, error: null },
  ]);
  const service = new OnlineGameplayRoundService(database);
  const bid = { playerId: 'p2', bidType: 'normal' as const, tricks: 5, trumpSuit: 'spades' as const };
  const card = createCanonicalDeck()[0]!;

  const bidResult = await service.submitBid(
    '11111111-1111-4111-8111-111111111111', 3, 'bid-command', bid,
  );
  const cardResult = await service.playCard(
    '11111111-1111-4111-8111-111111111111', 4, 'card-command', card,
  );

  assert.equal(bidResult.valid, true, bidResult.errors.join('\n'));
  assert.equal(cardResult.valid, true, cardResult.errors.join('\n'));
  assert.deepEqual(database.calls.map((call) => call.body), [
    {
      action: 'submit-bid',
      tableId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 3,
      commandId: 'bid-command',
      bid,
    },
    {
      action: 'play-card',
      tableId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 4,
      commandId: 'card-command',
      card,
    },
  ]);
});

test('startNextRound sends only the public authenticated command contract and parses the viewer snapshot', async () => {
  const database = client([
    {
      data: {
        valid: true,
        errors: [],
        duplicate: false,
        value: snapshot({ roundNumber: 6, phase: 'bidding', version: 1 }),
      },
      error: null,
    },
  ]);
  const service = new OnlineGameplayRoundService(database);

  const result = await service.startNextRound(
    '11111111-1111-4111-8111-111111111111',
    5,
    19,
    42,
    'next-round-command',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.roundNumber, 6);
  assert.deepEqual(database.calls, [{
    name: 'gameplay-round-command',
    body: {
      action: 'start-next-round',
      tableId: '11111111-1111-4111-8111-111111111111',
      commandId: 'next-round-command',
      expectedRoundNumber: 5,
      expectedRoundVersion: 19,
      expectedControlVersion: 42,
    },
  }]);
  for (const prohibited of [
    'aggregate',
    'hand',
    'hands',
    'card',
    'deck',
    'deckOrder',
    'seed',
    'nonce',
    'dealId',
    'shuffledDeck',
    'dealAudit',
  ]) {
    assert.equal(prohibited in database.calls[0]!.body, false, prohibited);
  }
});

test('startNextRound maps stale and private-looking failures to privacy-safe client messages', async () => {
  const database = client([
    { data: { valid: false, errors: ['NEXT_ROUND_STALE'], duplicate: false }, error: null },
    { data: { valid: false, errors: ['database leaked shuffledDeck seed nonce detail'], duplicate: false }, error: null },
    { data: null, error: { message: 'raw rpc stack mentions aggregate and dealId' } },
  ]);
  const service = new OnlineGameplayRoundService(database);

  const stale = await service.startNextRound(
    '11111111-1111-4111-8111-111111111111',
    5,
    19,
    42,
    'stale-command',
  );
  const privateFailure = await service.startNextRound(
    '11111111-1111-4111-8111-111111111111',
    5,
    19,
    42,
    'private-command',
  );
  const thrown = await service.startNextRound(
    '11111111-1111-4111-8111-111111111111',
    5,
    19,
    42,
    'thrown-command',
  );

  assert.deepEqual(stale.errors, ['Next round state changed. Refresh and try again.']);
  assert.equal(stale.failureKind, 'definitive-rejection');
  assert.deepEqual(privateFailure.errors, ['Next round could not be started. Refresh and try again.']);
  assert.equal(privateFailure.failureKind, 'definitive-rejection');
  assert.deepEqual(thrown.errors, ['Next round could not be started. Refresh and try again.']);
  assert.equal(thrown.failureKind, 'ambiguous');
});

test('database and domain errors never report success', async () => {
  const database = client([
    { data: null, error: { message: 'Edge Function unavailable.' } },
    { data: { valid: false, errors: ['Seat 2 must submit the next estimate.'], duplicate: false }, error: null },
  ]);
  const service = new OnlineGameplayRoundService(database);

  const unavailable = await service.getSnapshot('11111111-1111-4111-8111-111111111111');
  const rejected = await service.submitBid(
    '11111111-1111-4111-8111-111111111111',
    2,
    'wrong-turn',
    { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
  );

  assert.deepEqual(unavailable.errors, ['Edge Function unavailable.']);
  assert.deepEqual(rejected.errors, ['Seat 2 must submit the next estimate.']);
});

test('invalid input is rejected before invoking the Edge Function', async () => {
  const database = client([]);
  const service = new OnlineGameplayRoundService(database);

  const table = await service.getSnapshot('');
  const version = await service.submitBid(
    '11111111-1111-4111-8111-111111111111',
    -1,
    'command',
    { playerId: 'p2', bidType: 'normal', tricks: 5, trumpSuit: 'spades' },
  );
  const command = await service.playCard(
    '11111111-1111-4111-8111-111111111111',
    1,
    '',
    { suit: 'spades', rank: 'A' },
  );

  assert.equal(table.valid, false);
  assert.equal(version.valid, false);
  assert.equal(command.valid, false);
  assert.equal(database.calls.length, 0);
});

test('malformed or privacy-unsafe snapshots are rejected entirely', async () => {
  const database = client([
    { data: { valid: true, errors: [], value: snapshot({ players: [] }) }, error: null },
    { data: { valid: true, errors: [], value: snapshot({ hands: [[{ suit: 'clubs', rank: 'A' }]] }) }, error: null },
    { data: { valid: true, errors: [], value: snapshot({ ownHand: [{ suit: 'stars', rank: '1' }] }) }, error: null },
    {
      data: {
        valid: true,
        errors: [],
        value: snapshot({
          legalBidOptions: [{
            tricks: 5,
            bidType: 'normal',
            requiresContractSuit: true,
            legalContractSuits: ['seed'],
          }],
        }),
      },
      error: null,
    },
    {
      data: {
        valid: true,
        errors: [],
        value: snapshot({
          legalBidOptions: [{
            tricks: 5,
            bidType: 'normal',
            requiresContractSuit: false,
            legalContractSuits: [],
            hand: [{ suit: 'clubs', rank: 'A' }],
          }],
        }),
      },
      error: null,
    },
  ]);
  const service = new OnlineGameplayRoundService(database);

  const incomplete = await service.getSnapshot('11111111-1111-4111-8111-111111111111');
  const leaked = await service.getSnapshot('11111111-1111-4111-8111-111111111111');
  const invalidCard = await service.getSnapshot('11111111-1111-4111-8111-111111111111');
  const malformedOption = await service.getSnapshot('11111111-1111-4111-8111-111111111111');
  const privateOption = await service.getSnapshot('11111111-1111-4111-8111-111111111111');

  assert.deepEqual(incomplete.errors, ['Gameplay round snapshot is incomplete.']);
  assert.deepEqual(leaked.errors, ['Gameplay round snapshot contains prohibited private fields.']);
  assert.deepEqual(invalidCard.errors, ['Gameplay round snapshot is incomplete.']);
  assert.deepEqual(malformedOption.errors, ['Gameplay round snapshot is incomplete.']);
  assert.deepEqual(privateOption.errors, ['Gameplay round snapshot contains prohibited private fields.']);
});
