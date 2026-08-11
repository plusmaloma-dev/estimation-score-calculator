import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameplayTableRealtimeSynchronizer,
  type GameplayTableRealtimeChannel,
  type GameplayTableRealtimeClient,
  type GameplayTableSnapshotReader,
  type OnlineGameplayResult,
  type OnlineGameplayTableSnapshot,
} from '../src/index.js';

function snapshot(version: number): OnlineGameplayTableSnapshot {
  return {
    tableId: 'table-1', workspaceId: 'workspace-1', name: 'Realtime table',
    visibility: 'private', joinPolicy: 'open', lifecycle: 'lobby', hostUserId: 'host-user',
    turnTimerSeconds: 45, disconnectGraceSeconds: 60, occupiedSeatCount: 1, version,
    settingsLocked: false, createdAt: '2026-08-11T00:00:00.000Z', joinRequests: [],
    seats: [{
      seat: 0, kind: 'human', userId: 'host-user', displayName: 'Host',
      joinedAt: '2026-08-11T00:00:00.000Z',
    }],
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeChannel implements GameplayTableRealtimeChannel {
  readonly registrations: Readonly<Record<string, unknown>>[] = [];
  private status?: (status: string) => void;
  private invalidation?: (payload: unknown) => void;
  unsubscribeCalls = 0;

  on(
    event: 'postgres_changes', filter: Readonly<Record<string, unknown>>,
    callback: (payload: unknown) => void,
  ): GameplayTableRealtimeChannel {
    assert.equal(event, 'postgres_changes');
    this.registrations.push(filter);
    this.invalidation = callback;
    return this;
  }

  subscribe(callback: (status: string) => void): GameplayTableRealtimeChannel {
    this.status = callback;
    return this;
  }

  async unsubscribe(): Promise<void> { this.unsubscribeCalls += 1; }
  subscribed(): void { this.status?.('SUBSCRIBED'); }
  invalidate(): void { this.invalidation?.({}); }
}

class FakeClient implements GameplayTableRealtimeClient {
  readonly channels: FakeChannel[] = [];
  channel(_name: string): GameplayTableRealtimeChannel {
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
}

class FakeReader implements GameplayTableSnapshotReader {
  readonly calls: string[] = [];
  responses: OnlineGameplayResult<OnlineGameplayTableSnapshot>[] = [];
  async openTable(tableId: string): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>> {
    this.calls.push(tableId);
    return this.responses.shift() ?? { valid: true, errors: [], value: snapshot(0) };
  }
}

test('table Realtime reloads the authoritative table projection for table, seat, and request changes', async () => {
  const client = new FakeClient();
  const reader = new FakeReader();
  reader.responses = [
    { valid: true, errors: [], value: snapshot(0) },
    { valid: true, errors: [], value: snapshot(1) },
  ];
  const received: number[] = [];
  const synchronizer = new GameplayTableRealtimeSynchronizer(client, reader);

  await synchronizer.connect('table-1', (value) => received.push(value.version), () => undefined);
  const channel = client.channels[0]!;
  channel.subscribed();
  await tick();
  channel.invalidate();
  await tick();

  assert.deepEqual(channel.registrations, [
    { event: '*', schema: 'public', table: 'gameplay_tables', filter: 'id=eq.table-1' },
    { event: '*', schema: 'public', table: 'gameplay_table_seats', filter: 'table_id=eq.table-1' },
    { event: '*', schema: 'public', table: 'gameplay_join_requests', filter: 'table_id=eq.table-1' },
  ]);
  assert.deepEqual(reader.calls, ['table-1', 'table-1']);
  assert.deepEqual(received, [0, 1]);

  await synchronizer.disconnect();
  assert.equal(channel.unsubscribeCalls, 1);
});
