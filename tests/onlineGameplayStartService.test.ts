import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalDeck,
  OnlineGameplayRoundService,
  type GameplayRoundFunctionClient,
} from '../src/index.js';

type FunctionResponse = Awaited<ReturnType<GameplayRoundFunctionClient['functions']['invoke']>>;

function client(responses: readonly FunctionResponse[]): GameplayRoundFunctionClient & {
  readonly calls: { readonly name: string; readonly body: Readonly<Record<string, unknown>> }[];
} {
  const calls: { name: string; body: Readonly<Record<string, unknown>> }[] = [];
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

function initialSnapshot(): Readonly<Record<string, unknown>> {
  return {
    tableId: '11111111-1111-4111-8111-111111111111',
    roundNumber: 1,
    phase: 'auction',
    version: 0,
    viewerSeat: 0,
    dealCommitment: 'ab'.repeat(32),
    nextBidSeat: 2,
    auctionActiveSeat: 2,
    legalAuctionActions: [],
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: createCanonicalDeck().slice(0, 13),
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
  };
}

test('startGame invokes only the authenticated Start Function with public command identity', async () => {
  const database = client([{
    data: { valid: true, errors: [], value: initialSnapshot() },
    error: null,
  }]);
  const service = new OnlineGameplayRoundService(database);

  const result = await service.startGame(
    '11111111-1111-4111-8111-111111111111',
    3,
    'start-command',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.value?.version, 0);
  assert.equal(result.value?.dealCommitment, 'ab'.repeat(32));
  assert.deepEqual(database.calls, [{
    name: 'gameplay-start',
    body: {
      tableId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 3,
      commandId: 'start-command',
    },
  }]);
  const serialized = JSON.stringify(database.calls[0]?.body);
  assert.equal(serialized.includes('seed'), false);
  assert.equal(serialized.includes('hand'), false);
});

test('startGame validates inputs before the Edge Function boundary', async () => {
  const database = client([]);
  const service = new OnlineGameplayRoundService(database);

  const missingTable = await service.startGame('', 0, 'command');
  const badVersion = await service.startGame('table-1', -1, 'command');
  const missingCommand = await service.startGame('table-1', 0, '');

  assert.equal(missingTable.valid, false);
  assert.equal(badVersion.valid, false);
  assert.equal(missingCommand.valid, false);
  assert.equal(database.calls.length, 0);
});

test('startGame rejects malformed commitment and propagates server failures', async () => {
  const malformed = initialSnapshot();
  const database = client([
    {
      data: { valid: true, errors: [], value: { ...malformed, dealCommitment: 'not-a-hash' } },
      error: null,
    },
    {
      data: { valid: false, errors: ['Only the current host can start this table.'] },
      error: null,
    },
  ]);
  const service = new OnlineGameplayRoundService(database);
  const tableId = '11111111-1111-4111-8111-111111111111';

  const invalidCommitment = await service.startGame(tableId, 3, 'c1');
  const rejection = await service.startGame(tableId, 3, 'c2');

  assert.deepEqual(invalidCommitment.errors, ['Gameplay round snapshot is incomplete.']);
  assert.deepEqual(rejection.errors, ['Only the current host can start this table.']);
});
