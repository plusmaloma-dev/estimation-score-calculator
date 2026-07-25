import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveGameRealtimeSynchronizer,
  type ActiveControlSnapshotReader,
  type GameplayRealtimeChannel,
  type GameplayRealtimeClient,
} from '../src/online/gameplay/ActiveGameRealtimeSynchronizer.js';
import type {
  OnlineActiveGameControlSnapshot,
  OnlineGameplayResult,
} from '../src/online/gameplay/activeControlTypes.js';

function snapshot(version: number): OnlineActiveGameControlSnapshot {
  return {
    tableId: 'table-1',
    lifecycle: 'active',
    hostUserId: 'host-user',
    turnTimerSeconds: 45,
    disconnectGraceSeconds: 60,
    version,
    seats: [],
    events: [],
    directives: [],
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeChannel implements GameplayRealtimeChannel {
  readonly registrations: {
    readonly event: 'postgres_changes';
    readonly filter: Readonly<Record<string, unknown>>;
    readonly callback: () => void;
  }[] = [];
  statusCallback?: (status: string) => void;
  unsubscribeCalls = 0;

  on(
    event: 'postgres_changes',
    filter: Readonly<Record<string, unknown>>,
    callback: () => void,
  ): GameplayRealtimeChannel {
    this.registrations.push({ event, filter, callback });
    return this;
  }

  subscribe(callback: (status: string) => void): GameplayRealtimeChannel {
    this.statusCallback = callback;
    return this;
  }

  async unsubscribe(): Promise<void> {
    this.unsubscribeCalls += 1;
  }

  emitStatus(status: string): void {
    this.statusCallback?.(status);
  }

  emitChange(index = 0): void {
    this.registrations[index]?.callback();
  }
}

class FakeRealtimeClient implements GameplayRealtimeClient {
  readonly channelNames: string[] = [];
  readonly channels: FakeChannel[] = [];

  channel(name: string): GameplayRealtimeChannel {
    this.channelNames.push(name);
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
}

class FakeReader implements ActiveControlSnapshotReader {
  readonly calls: string[] = [];
  responses: OnlineGameplayResult<OnlineActiveGameControlSnapshot>[] = [];
  deferred?: {
    readonly promise: Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>>;
    resolve(value: OnlineGameplayResult<OnlineActiveGameControlSnapshot>): void;
  };

  async getSnapshot(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>> {
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

test('connect creates one table channel, registers both active tables, and reloads on subscribe', async () => {
  const client = new FakeRealtimeClient();
  const reader = new FakeReader();
  const received: number[] = [];
  const errors: string[][] = [];
  const synchronizer = new ActiveGameRealtimeSynchronizer(client, reader);

  await synchronizer.connect(
    'table-1',
    (value) => received.push(value.version),
    (value) => errors.push([...value]),
  );
  await synchronizer.connect(
    'table-1',
    (value) => received.push(value.version),
    (value) => errors.push([...value]),
  );

  assert.deepEqual(client.channelNames, ['active-control:table-1']);
  const channel = client.channels[0]!;
  assert.equal(channel.registrations.length, 2);
  assert.deepEqual(channel.registrations.map((registration) => registration.filter.table), [
    'gameplay_active_controls',
    'gameplay_active_seat_controls',
  ]);

  channel.emitStatus('SUBSCRIBED');
  await tick();

  assert.deepEqual(reader.calls, ['table-1']);
  assert.deepEqual(received, [1]);
  assert.deepEqual(errors, []);
});

test('Realtime row payloads are invalidation signals and trigger authoritative reloads', async () => {
  const client = new FakeRealtimeClient();
  const reader = new FakeReader();
  reader.responses = [
    { valid: true, errors: [], value: snapshot(10) },
    { valid: true, errors: [], value: snapshot(11) },
  ];
  const received: number[] = [];
  const synchronizer = new ActiveGameRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);
  const channel = client.channels[0]!;

  channel.emitStatus('SUBSCRIBED');
  await tick();
  channel.emitChange(1);
  await tick();

  assert.deepEqual(received, [10, 11]);
  assert.deepEqual(reader.calls, ['table-1', 'table-1']);
});

test('multiple invalidations during one refresh are coalesced into one follow-up reload', async () => {
  const client = new FakeRealtimeClient();
  const reader = new FakeReader();
  const first = deferred<OnlineGameplayResult<OnlineActiveGameControlSnapshot>>();
  reader.deferred = first;
  const received: number[] = [];
  const synchronizer = new ActiveGameRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);
  const channel = client.channels[0]!;

  channel.emitStatus('SUBSCRIBED');
  await tick();
  channel.emitChange(0);
  channel.emitChange(1);
  assert.equal(reader.calls.length, 1);

  reader.deferred = undefined;
  reader.responses = [{ valid: true, errors: [], value: snapshot(2) }];
  first.resolve({ valid: true, errors: [], value: snapshot(1) });
  await tick();
  await tick();

  assert.deepEqual(reader.calls, ['table-1', 'table-1']);
  assert.deepEqual(received, [1, 2]);
});

test('snapshot failures are surfaced without publishing stale state', async () => {
  const client = new FakeRealtimeClient();
  const reader = new FakeReader();
  reader.responses = [{ valid: false, errors: ['snapshot failed'] }];
  const received: number[] = [];
  const errors: string[][] = [];
  const synchronizer = new ActiveGameRealtimeSynchronizer(client, reader);
  await synchronizer.connect(
    'table-1',
    (value) => received.push(value.version),
    (value) => errors.push([...value]),
  );

  client.channels[0]!.emitStatus('SUBSCRIBED');
  await tick();

  assert.deepEqual(received, []);
  assert.deepEqual(errors, [['snapshot failed']]);
});

test('disconnect unsubscribes and prevents later invalidations from refreshing', async () => {
  const client = new FakeRealtimeClient();
  const reader = new FakeReader();
  const synchronizer = new ActiveGameRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', () => undefined, () => undefined);
  const channel = client.channels[0]!;

  await synchronizer.disconnect();
  channel.emitStatus('SUBSCRIBED');
  channel.emitChange();
  await tick();

  assert.equal(channel.unsubscribeCalls, 1);
  assert.deepEqual(reader.calls, []);
});

test('failed mutation reloads authoritative state before another mutation may begin', async () => {
  const client = new FakeRealtimeClient();
  const reader = new FakeReader();
  const reload = deferred<OnlineGameplayResult<OnlineActiveGameControlSnapshot>>();
  reader.deferred = reload;
  const received: number[] = [];
  const synchronizer = new ActiveGameRealtimeSynchronizer(client, reader);
  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);

  const firstMutation = synchronizer.runMutation(async () => ({
    valid: false,
    errors: ['ambiguous network failure'],
  }));
  await tick();
  const secondMutation = await synchronizer.runMutation(async () => ({
    valid: true,
    errors: [],
    value: snapshot(99),
  }));

  assert.equal(secondMutation.valid, false);
  assert.deepEqual(secondMutation.errors, ['An active-control mutation is already in progress.']);

  reader.deferred = undefined;
  reload.resolve({ valid: true, errors: [], value: snapshot(5) });
  const firstResult = await firstMutation;

  assert.equal(firstResult.valid, false);
  assert.deepEqual(received, [5]);

  const thirdMutation = await synchronizer.runMutation(async () => ({
    valid: true,
    errors: [],
    value: snapshot(6),
  }));
  assert.equal(thirdMutation.valid, true);
});
