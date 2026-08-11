import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayRoundRealtimeSynchronizer,
  type GameplayRoundRealtimeChannel,
  type GameplayRoundRealtimeClient,
  type GameplayRoundSnapshotReader,
  type OnlineGameplayRoundSnapshot,
  type OnlineGameplayResult,
} from '../src/index.js';

function snapshot(version: number): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'estimate',
    version,
    viewerSeat: 2,
    bidOwnerSeat: 2,
    nextBidSeat: 2,
    players: [
      { seat: 0, playerId: 'p0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'p1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'p2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'p3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeChannel implements GameplayRoundRealtimeChannel {
  registration?: {
    readonly filter: Readonly<Record<string, unknown>>;
    readonly callback: (payload: unknown) => void;
  };
  statusCallback?: (status: string) => void;
  unsubscribeCalls = 0;

  on(
    event: 'postgres_changes',
    filter: Readonly<Record<string, unknown>>,
    callback: (payload: unknown) => void,
  ): GameplayRoundRealtimeChannel {
    assert.equal(event, 'postgres_changes');
    this.registration = { filter, callback };
    return this;
  }

  subscribe(callback: (status: string) => void): GameplayRoundRealtimeChannel {
    this.statusCallback = callback;
    return this;
  }

  async unsubscribe(): Promise<void> {
    this.unsubscribeCalls += 1;
  }

  emitStatus(status: string): void {
    this.statusCallback?.(status);
  }

  emitVersion(version: number): void {
    this.registration?.callback({ new: { table_id: 'table-1', version } });
  }
}

class FakeClient implements GameplayRoundRealtimeClient {
  readonly names: string[] = [];
  readonly channels: FakeChannel[] = [];

  channel(name: string): GameplayRoundRealtimeChannel {
    this.names.push(name);
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
}

class FakeReader implements GameplayRoundSnapshotReader {
  readonly calls: string[] = [];
  responses: OnlineGameplayResult<OnlineGameplayRoundSnapshot>[] = [];
  deferred?: {
    readonly promise: Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>>;
    resolve(value: OnlineGameplayResult<OnlineGameplayRoundSnapshot>): void;
  };

  async getSnapshot(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>> {
    this.calls.push(tableId);
    if (this.deferred !== undefined) return this.deferred.promise;
    return this.responses.shift()
      ?? { valid: true, errors: [], value: snapshot(this.calls.length) };
  }
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolver!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolver = resolve; });
  return { promise, resolve: resolver };
}

test('connect subscribes to the public invalidation table and loads an authoritative snapshot', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  reader.responses = [{ valid: true, errors: [], value: snapshot(4) }];
  const received: number[] = [];
  const synchronizer = new GameplayRoundRealtimeSynchronizer(client, reader);

  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);
  const channel = client.channels[0]!;
  channel.emitStatus('SUBSCRIBED');
  await tick();

  assert.deepEqual(client.names, ['gameplay-round:table-1']);
  assert.deepEqual(channel.registration?.filter, {
    event: '*',
    schema: 'public',
    table: 'gameplay_round_invalidations',
    filter: 'table_id=eq.table-1',
  });
  assert.deepEqual(reader.calls, ['table-1']);
  assert.deepEqual(received, [4]);
});

test('stale invalidations are ignored while next and gap versions reload authoritative state', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  reader.responses = [
    { valid: true, errors: [], value: snapshot(5) },
    { valid: true, errors: [], value: snapshot(6) },
    { valid: true, errors: [], value: snapshot(9) },
  ];
  const received: number[] = [];
  const synchronizer = new GameplayRoundRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);
  const channel = client.channels[0]!;

  channel.emitStatus('SUBSCRIBED');
  await tick();
  channel.emitVersion(4);
  await tick();
  channel.emitVersion(6);
  await tick();
  channel.emitVersion(9);
  await tick();

  assert.deepEqual(reader.calls, ['table-1', 'table-1', 'table-1']);
  assert.deepEqual(received, [5, 6, 9]);
});

test('multiple invalidations during one refresh are coalesced into one follow-up reload', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  const first = deferred<OnlineGameplayResult<OnlineGameplayRoundSnapshot>>();
  reader.deferred = first;
  const received: number[] = [];
  const synchronizer = new GameplayRoundRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);
  const channel = client.channels[0]!;

  channel.emitStatus('SUBSCRIBED');
  await tick();
  channel.emitVersion(2);
  channel.emitVersion(3);
  assert.equal(reader.calls.length, 1);

  reader.deferred = undefined;
  reader.responses = [{ valid: true, errors: [], value: snapshot(3) }];
  first.resolve({ valid: true, errors: [], value: snapshot(1) });
  await tick();
  await tick();

  assert.deepEqual(reader.calls, ['table-1', 'table-1']);
  assert.deepEqual(received, [1, 3]);
});

test('snapshot failures are surfaced without publishing stale state', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  reader.responses = [{ valid: false, errors: ['round reload failed'] }];
  const received: number[] = [];
  const errors: string[][] = [];
  const synchronizer = new GameplayRoundRealtimeSynchronizer(client, reader);
  await synchronizer.connect(
    'table-1',
    (value) => received.push(value.version),
    (value) => errors.push([...value]),
  );

  client.channels[0]!.emitStatus('SUBSCRIBED');
  await tick();

  assert.deepEqual(received, []);
  assert.deepEqual(errors, [['round reload failed']]);
});

test('disconnect unsubscribes and ignores later notifications', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  const synchronizer = new GameplayRoundRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', () => undefined, () => undefined);
  const channel = client.channels[0]!;

  await synchronizer.disconnect();
  channel.emitStatus('SUBSCRIBED');
  channel.emitVersion(1);
  await tick();

  assert.equal(channel.unsubscribeCalls, 1);
  assert.deepEqual(reader.calls, []);
});

test('mutations are serialized, successful snapshots publish, and failures reload before release', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  const reload = deferred<OnlineGameplayResult<OnlineGameplayRoundSnapshot>>();
  reader.deferred = reload;
  const received: number[] = [];
  const synchronizer = new GameplayRoundRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);

  const first = synchronizer.runMutation(async () => ({
    valid: false,
    errors: ['ambiguous failure'],
  }));
  await tick();
  const blocked = await synchronizer.runMutation(async () => ({
    valid: true,
    errors: [],
    value: snapshot(99),
  }));
  assert.deepEqual(blocked.errors, ['A gameplay-round mutation is already in progress.']);

  reader.deferred = undefined;
  reload.resolve({ valid: true, errors: [], value: snapshot(7) });
  const failed = await first;
  assert.equal(failed.valid, false);
  assert.deepEqual(received, [7]);

  const success = await synchronizer.runMutation(async () => ({
    valid: true,
    errors: [],
    value: snapshot(8),
  }));
  assert.equal(success.valid, true);
  assert.deepEqual(received, [7, 8]);
});
