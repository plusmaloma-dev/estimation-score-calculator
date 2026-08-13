import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BotDirectiveCoordinator,
  type BotDirectiveProcessor,
} from '../src/online/gameplay/BotDirectiveCoordinator.js';
import type { OnlineBotActionDirective } from '../src/online/gameplay/activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from '../src/online/gameplay/roundTypes.js';

function directive(id = 'bot-action:table-1:turn-1:1'): OnlineBotActionDirective {
  return {
    directiveId: id,
    tableId: 'table-1',
    turnId: 'turn-1',
    seat: 1,
    actionKind: 'card',
    source: 'permanent-bot',
    issuedAt: '2026-07-26T13:30:00.000Z',
  };
}

function snapshot(version: number): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'playing',
    version,
    viewerSeat: 0,
    bidOwnerSeat: 0,
    currentTurnSeat: 2,
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 12, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 12, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [{ seat: 1, card: { suit: 'hearts', rank: '2' } }],
    completedTricks: [],
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolver!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolver = resolve; });
  return { promise, resolve: resolver };
}

test('a completed directive is processed exactly once across repeated snapshots', async () => {
  let calls = 0;
  const processor: BotDirectiveProcessor = {
    async processBotDirective(tableId, directiveId) {
      calls += 1;
      assert.equal(tableId, 'table-1');
      assert.equal(directiveId, 'bot-action:table-1:turn-1:1');
      return { valid: true, errors: [], terminal: true, value: snapshot(9) };
    },
  };
  const published: number[] = [];
  const coordinator = new BotDirectiveCoordinator(processor);

  await coordinator.process([directive()], (value) => published.push(value.version), () => undefined);
  await coordinator.process([directive()], (value) => published.push(value.version), () => undefined);

  assert.equal(calls, 1);
  assert.deepEqual(published, [9]);
});

test('concurrent snapshots coalesce the same directive into one in-flight request', async () => {
  const pending = deferred<{
    readonly valid: true;
    readonly errors: readonly [];
    readonly terminal: true;
    readonly value: OnlineGameplayRoundSnapshot;
  }>();
  let calls = 0;
  const coordinator = new BotDirectiveCoordinator({
    processBotDirective() {
      calls += 1;
      return pending.promise;
    },
  });
  const published: number[] = [];

  const first = coordinator.process([directive()], (value) => published.push(value.version), () => undefined);
  const second = coordinator.process([directive()], (value) => published.push(value.version), () => undefined);
  pending.resolve({ valid: true, errors: [], terminal: true, value: snapshot(10) });
  await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.deepEqual(published, [10]);
});

test('transient failures are reported and retried on the next authoritative snapshot', async () => {
  let calls = 0;
  const coordinator = new BotDirectiveCoordinator({
    async processBotDirective() {
      calls += 1;
      return calls === 1
        ? { valid: false, errors: ['Temporary network failure.'], terminal: false }
        : { valid: true, errors: [], terminal: true, value: snapshot(11) };
    },
  });
  const errors: string[][] = [];
  const published: number[] = [];

  await coordinator.process([directive()], (value) => published.push(value.version), (value) => errors.push([...value]));
  await coordinator.process([directive()], (value) => published.push(value.version), (value) => errors.push([...value]));

  assert.equal(calls, 2);
  assert.deepEqual(errors, [['Temporary network failure.']]);
  assert.deepEqual(published, [11]);
});

test('terminal stale directives are not retried', async () => {
  let calls = 0;
  const coordinator = new BotDirectiveCoordinator({
    async processBotDirective() {
      calls += 1;
      return { valid: false, errors: ['Bot directive is stale.'], terminal: true };
    },
  });
  const errors: string[][] = [];

  await coordinator.process([directive()], () => undefined, (value) => errors.push([...value]));
  await coordinator.process([directive()], () => undefined, (value) => errors.push([...value]));

  assert.equal(calls, 1);
  assert.deepEqual(errors, [['Bot directive is stale.']]);
});

test('different directives are processed serially in supplied order', async () => {
  let active = 0;
  let maximumActive = 0;
  const order: string[] = [];
  const coordinator = new BotDirectiveCoordinator({
    async processBotDirective(_tableId, directiveId) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push(directiveId);
      await Promise.resolve();
      active -= 1;
      return { valid: true, errors: [], terminal: true, value: snapshot(order.length) };
    },
  });

  await coordinator.process([
    directive('bot-action:table-1:turn-1:1'),
    directive('bot-action:table-1:turn-2:2'),
  ], () => undefined, () => undefined);

  assert.equal(maximumActive, 1);
  assert.deepEqual(order, [
    'bot-action:table-1:turn-1:1',
    'bot-action:table-1:turn-2:2',
  ]);
});
