import type { OnlineGameplayResult } from './types.js';
import type { OnlineActiveGameControlSnapshot } from './activeControlTypes.js';

export interface GameplayRealtimeChannel {
  on(
    event: 'postgres_changes',
    filter: Readonly<Record<string, unknown>>,
    callback: () => void,
  ): GameplayRealtimeChannel;
  subscribe(callback: (status: string) => void): GameplayRealtimeChannel;
  unsubscribe(): Promise<void>;
}

export interface GameplayRealtimeClient {
  channel(name: string): GameplayRealtimeChannel;
}

export interface ActiveControlSnapshotReader {
  getSnapshot(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineActiveGameControlSnapshot>>;
}

export class ActiveGameRealtimeSynchronizer {
  private tableId?: string;
  private channel?: GameplayRealtimeChannel;
  private onSnapshot?: (snapshot: OnlineActiveGameControlSnapshot) => void;
  private onError?: (errors: readonly string[]) => void;
  private generation = 0;
  private refreshPromise?: Promise<void>;
  private refreshPending = false;
  private mutationInProgress = false;

  constructor(
    private readonly client: GameplayRealtimeClient,
    private readonly reader: ActiveControlSnapshotReader,
  ) {}

  async connect(
    tableId: string,
    onSnapshot: (snapshot: OnlineActiveGameControlSnapshot) => void,
    onError: (errors: readonly string[]) => void,
  ): Promise<void> {
    if (!tableId.trim()) throw new Error('Gameplay table ID is required.');
    this.onSnapshot = onSnapshot;
    this.onError = onError;

    if (this.tableId === tableId && this.channel !== undefined) return;
    await this.disconnect();

    this.tableId = tableId;
    const generation = ++this.generation;
    const invalidate = (): void => {
      if (this.generation !== generation || this.tableId !== tableId) return;
      void this.refresh();
    };
    const channel = this.client.channel(`active-control:${tableId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gameplay_active_controls',
        filter: `table_id=eq.${tableId}`,
      }, invalidate)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gameplay_active_seat_controls',
        filter: `table_id=eq.${tableId}`,
      }, invalidate)
      .subscribe((status) => {
        if (
          status === 'SUBSCRIBED'
          && this.generation === generation
          && this.tableId === tableId
        ) {
          void this.refresh();
        }
      });
    this.channel = channel;
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

  async disconnect(): Promise<void> {
    this.generation += 1;
    const channel = this.channel;
    this.channel = undefined;
    this.tableId = undefined;
    this.refreshPending = false;
    if (channel !== undefined) await channel.unsubscribe();
  }

  async runMutation<T>(
    operation: () => Promise<OnlineGameplayResult<T>>,
  ): Promise<OnlineGameplayResult<T>> {
    if (this.mutationInProgress) {
      return {
        valid: false,
        errors: ['An active-control mutation is already in progress.'],
      };
    }

    this.mutationInProgress = true;
    try {
      const result = await operation();
      if (!result.valid) await this.refresh();
      return result;
    } catch (error) {
      await this.refresh();
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Active-control mutation failed.'],
      };
    } finally {
      this.mutationInProgress = false;
    }
  }

  private async performRefreshLoop(): Promise<void> {
    do {
      this.refreshPending = false;
      const tableId = this.tableId;
      const generation = this.generation;
      if (tableId === undefined) return;

      const result = await this.reader.getSnapshot(tableId);
      if (this.tableId !== tableId || this.generation !== generation) return;
      if (result.valid && result.value !== undefined) {
        this.onSnapshot?.(result.value);
      } else {
        this.onError?.(result.errors);
      }
    } while (this.refreshPending);
  }
}
