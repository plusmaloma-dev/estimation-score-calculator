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

function snapshot(): Readonly<Record<string, unknown>> {
  const ownHand = createCanonicalDeck().slice(0, 12);
  return {
    tableId: '11111111-1111-4111-8111-111111111111',
    roundNumber: 1,
    phase: 'playing',
    version: 5,
    viewerSeat: 0,
    bidOwnerSeat: 1,
    riskSeat: 0,
    currentTurnSeat: 2,
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 12, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 12, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand,
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [{ seat: 1, card: { suit: 'spades', rank: '2' } }],
    completedTricks: [],
  };
}

test('processBotDirective sends only public identity and parses terminal success', async () => {
  const database = client([{
    data: { valid: true, errors: [], terminal: true, value: snapshot() },
    error: null,
  }]);
  const service = new OnlineGameplayRoundService(database);

  const result = await service.processBotDirective(
    '11111111-1111-4111-8111-111111111111',
    'bot-action:11111111-1111-4111-8111-111111111111:turn-1:1',
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.terminal, true);
  assert.equal(result.value?.version, 5);
  assert.deepEqual(database.calls, [{
    name: 'gameplay-round-command',
    body: {
      action: 'process-bot-directive',
      tableId: '11111111-1111-4111-8111-111111111111',
      directiveId: 'bot-action:11111111-1111-4111-8111-111111111111:turn-1:1',
    },
  }]);
  const serialized = JSON.stringify(database.calls[0]?.body);
  assert.equal(serialized.includes('observation'), false);
  assert.equal(serialized.includes('hand'), false);
  assert.equal(serialized.includes('selectedAction'), false);
});

test('transient and terminal server failures preserve retry classification', async () => {
  const database = client([
    {
      data: { valid: false, errors: ['Temporary bot worker failure.'], terminal: false },
      error: null,
    },
    {
      data: { valid: false, errors: ['Bot directive is stale.'], terminal: true },
      error: null,
    },
  ]);
  const service = new OnlineGameplayRoundService(database);
  const tableId = '11111111-1111-4111-8111-111111111111';

  const transient = await service.processBotDirective(tableId, 'directive-1');
  const terminal = await service.processBotDirective(tableId, 'directive-2');

  assert.equal(transient.valid, false);
  assert.equal(transient.terminal, false);
  assert.deepEqual(transient.errors, ['Temporary bot worker failure.']);
  assert.equal(terminal.valid, false);
  assert.equal(terminal.terminal, true);
  assert.deepEqual(terminal.errors, ['Bot directive is stale.']);
});

test('invalid inputs and malformed terminal envelopes are rejected safely', async () => {
  const database = client([{
    data: { valid: true, errors: [], value: snapshot() },
    error: null,
  }]);
  const service = new OnlineGameplayRoundService(database);

  const missingTable = await service.processBotDirective('', 'directive');
  const missingDirective = await service.processBotDirective(
    '11111111-1111-4111-8111-111111111111',
    '',
  );
  const malformed = await service.processBotDirective(
    '11111111-1111-4111-8111-111111111111',
    'directive',
  );

  assert.equal(missingTable.valid, false);
  assert.equal(missingTable.terminal, true);
  assert.equal(missingDirective.valid, false);
  assert.equal(missingDirective.terminal, true);
  assert.deepEqual(malformed.errors, ['Gameplay bot directive response is incomplete.']);
  assert.equal(malformed.terminal, false);
  assert.equal(database.calls.length, 1);
});
