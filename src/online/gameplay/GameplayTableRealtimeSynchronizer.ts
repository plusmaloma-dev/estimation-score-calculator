import type { OnlineGameplayTableSnapshot, OnlineGameplayResult } from './types.js';

export interface GameplayTableRealtimeChannel {
  on(
    event: 'postgres_changes',
    filter: Readonly<Record<string, unknown>>,
    callback: (payload: unknown) => void,
  ): GameplayTableRealtimeChannel;
  subscribe(callback: (status: string) => void): GameplayTableRealtimeChannel;
  unsubscribe(): Promise<void>;
}

export interface GameplayTableRealtimeClient {
  channel(name: string): GameplayTableRealtimeChannel;
}

export interface GameplayTableSnapshotReader {
  openTable(tableId: string): Promise<OnlineGameplayResult<OnlineGameplayTableSnapshot>>;
}

/**
 * Reloads the one authoritative table projection when public lobby records change.
 * It deliberately transports no table data from Realtime payloads.
 */
export class GameplayTableRealtimeSynchronizer {
  private tableId: string | undefined;
  private channel: GameplayTableRealtimeChannel | undefined;
  private onSnapshot: ((snapshot: OnlineGameplayTableSnapshot) => void) | undefined;
  private onError: ((errors: readonly string[]) => void) | undefined;
  private generation = 0;
  private refreshPromise: Promise<void> | undefined;
  private refreshPending = false;
  private currentVersion = -1;

  constructor(
    private readonly client: GameplayTableRealtimeClient,
    private readonly reader: GameplayTableSnapshotReader,
  ) {}

  async connect(
    tableId: string,
    onSnapshot: (snapshot: OnlineGameplayTableSnapshot) => void,
    onError: (errors: readonly string[]) => void,
  ): Promise<void> {
    if (!tableId.trim()) throw new Error('Gameplay table ID is required.');
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    if (this.tableId === tableId && this.channel !== undefined) return;

    await this.disconnect();
    this.tableId = tableId;
    this.currentVersion = -1;
    const generation = ++this.generation;
    const invalidate = (): void => {
      if (this.tableId !== tableId || this.generation !== generation) return;
      void this.refresh();
    };

    this.channel = this.client.channel(`gameplay-table:${tableId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'gameplay_tables', filter: `id=eq.${tableId}`,
      }, invalidate)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'gameplay_table_seats', filter: `table_id=eq.${tableId}`,
      }, invalidate)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'gameplay_join_requests', filter: `table_id=eq.${tableId}`,
      }, invalidate)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && this.tableId === tableId && this.generation === generation) {
          void this.refresh();
        }
      });
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    const channel = this.channel;
    this.channel = undefined;
    this.tableId = undefined;
    this.refreshPending = false;
    this.currentVersion = -1;
    if (channel !== undefined) await channel.unsubscribe();
  }

  async refresh(): Promise<void> {
    if (this.tableId === undefined) return;
    if (this.refreshPromise !== undefined) {
      this.refreshPending = true;
      return this.refreshPromise;
    }
    this.refreshPromise = this.performRefreshLoop();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async performRefreshLoop(): Promise<void> {
    do {
      this.refreshPending = false;
      const tableId = this.tableId;
      const generation = this.generation;
      if (tableId === undefined) return;
      const result = await this.reader.openTable(tableId);
      if (this.tableId !== tableId || this.generation !== generation) return;
      if (!result.valid || result.value === undefined) {
        this.onError?.(result.errors);
      } else if (result.value.version >= this.currentVersion) {
        this.currentVersion = result.value.version;
        this.onSnapshot?.(result.value);
      }
    } while (this.refreshPending);
  }
}
