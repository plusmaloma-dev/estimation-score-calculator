import type { OnlineGameplayResult } from './types.js';
import type { OnlineGameplayRoundSnapshot } from './roundTypes.js';

export interface GameplayRoundRealtimeChannel {
  on(
    event: 'postgres_changes',
    filter: Readonly<Record<string, unknown>>,
    callback: (payload: unknown) => void,
  ): GameplayRoundRealtimeChannel;
  subscribe(callback: (status: string) => void): GameplayRoundRealtimeChannel;
  unsubscribe(): Promise<void>;
}

export interface GameplayRoundRealtimeClient {
  channel(name: string): GameplayRoundRealtimeChannel;
}

export interface GameplayRoundSnapshotReader {
  getSnapshot(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>>;
}

export class GameplayRoundRealtimeSynchronizer {
  private tableId: string | undefined;
  private channel: GameplayRoundRealtimeChannel | undefined;
  private onSnapshot: ((snapshot: OnlineGameplayRoundSnapshot) => void) | undefined;
  private onError: ((errors: readonly string[]) => void) | undefined;
  private generation = 0;
  private refreshPromise: Promise<void> | undefined;
  private refreshPending = false;
  private mutationInProgress = false;
  private currentVersion = -1;

  constructor(
    private readonly client: GameplayRoundRealtimeClient,
    private readonly reader: GameplayRoundSnapshotReader,
  ) {}

  async connect(
    tableId: string,
    onSnapshot: (snapshot: OnlineGameplayRoundSnapshot) => void,
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
    const invalidate = (payload: unknown): void => {
      if (this.generation !== generation || this.tableId !== tableId) return;
      const hintedVersion = this.invalidationVersion(payload);
      if (hintedVersion !== undefined && hintedVersion <= this.currentVersion) return;
      void this.refresh();
    };

    this.channel = this.client.channel(`gameplay-round:${tableId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gameplay_round_invalidations',
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
    this.currentVersion = -1;
    if (channel !== undefined) await channel.unsubscribe();
  }

  async runMutation(
    operation: () => Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>>,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>> {
    if (this.mutationInProgress) {
      return {
        valid: false,
        errors: ['A gameplay-round mutation is already in progress.'],
      };
    }

    this.mutationInProgress = true;
    try {
      const result = await operation();
      if (result.valid && result.value !== undefined) {
        this.publish(result.value);
      } else {
        await this.refresh();
      }
      return result;
    } catch (error) {
      await this.refresh();
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Gameplay-round mutation failed.'],
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
        this.publish(result.value);
      } else {
        this.onError?.(result.errors);
      }
    } while (this.refreshPending);
  }

  private publish(snapshot: OnlineGameplayRoundSnapshot): void {
    if (snapshot.version < this.currentVersion) return;
    this.currentVersion = snapshot.version;
    this.onSnapshot?.(snapshot);
  }

  private invalidationVersion(payload: unknown): number | undefined {
    const root = this.object(payload);
    const row = root === undefined ? undefined : this.object(root.new);
    const version = row?.version;
    return typeof version === 'number' && Number.isInteger(version) && version >= 0
      ? version
      : undefined;
  }

  private object(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>>
      : undefined;
  }
}
