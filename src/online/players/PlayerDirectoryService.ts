import type {
  DirectoryPlayer,
  PlayerDirectoryPort,
  PlayerDirectoryResult,
} from './types.js';

export interface PlayerDirectoryDatabase {
  from(table: string): any;
}

interface PlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly archived_at: string | null;
}

interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

export class PlayerDirectoryService implements PlayerDirectoryPort {
  constructor(
    private readonly client: PlayerDirectoryDatabase,
    private readonly workspaceId: string,
    private readonly actorUserId: string,
  ) {}

  async listActivePlayers(queryText = ''): Promise<readonly DirectoryPlayer[]> {
    let query = this.client
      .from('players')
      .select('id, display_name, archived_at')
      .eq('workspace_id', this.workspaceId)
      .is('archived_at', null)
      .order('display_name', { ascending: true });
    const search = queryText.trim();
    if (search.length > 0) query = query.ilike('display_name', `%${search}%`);

    const { data, error } = await query as { data: readonly PlayerRow[] | null; error: DatabaseError | null };
    if (error !== null || data === null) return [];
    return data.map((row) => this.toPlayer(row));
  }

  async createPlayer(name: string): Promise<PlayerDirectoryResult<DirectoryPlayer>> {
    const displayName = this.cleanDisplayName(name);
    if (displayName.length === 0) return this.failure('Player name is required.');

    const { data, error } = await this.client
      .from('players')
      .insert({
        workspace_id: this.workspaceId,
        display_name: displayName,
        created_by: this.actorUserId,
        updated_by: this.actorUserId,
      })
      .select('id, display_name, archived_at')
      .single() as { data: PlayerRow | null; error: DatabaseError | null };

    if (error !== null) {
      return error.code === '23505'
        ? this.failure('A player with this name already exists.')
        : this.failure(error.message);
    }
    if (data === null) return this.failure('Player could not be created.');
    return { valid: true, errors: [], value: this.toPlayer(data) };
  }

  async renamePlayer(playerId: string, name: string): Promise<PlayerDirectoryResult<DirectoryPlayer>> {
    const displayName = this.cleanDisplayName(name);
    if (displayName.length === 0) return this.failure('Player name is required.');
    return this.updatePlayer(playerId, { display_name: displayName, updated_by: this.actorUserId });
  }

  async archivePlayer(playerId: string, nowIso = new Date().toISOString()): Promise<PlayerDirectoryResult<DirectoryPlayer>> {
    return this.updatePlayer(playerId, {
      archived_at: nowIso,
      updated_by: this.actorUserId,
    });
  }

  async restorePlayer(playerId: string): Promise<PlayerDirectoryResult<DirectoryPlayer>> {
    return this.updatePlayer(playerId, {
      archived_at: null,
      updated_by: this.actorUserId,
    });
  }

  private async updatePlayer(
    playerId: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<PlayerDirectoryResult<DirectoryPlayer>> {
    const { data, error } = await this.client
      .from('players')
      .update(values)
      .eq('workspace_id', this.workspaceId)
      .eq('id', playerId)
      .select('id, display_name, archived_at')
      .single() as { data: PlayerRow | null; error: DatabaseError | null };

    if (error !== null) {
      return error.code === '23505'
        ? this.failure('A player with this name already exists.')
        : this.failure(error.message);
    }
    if (data === null) return this.failure('Player could not be updated.');
    return { valid: true, errors: [], value: this.toPlayer(data) };
  }

  private cleanDisplayName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  private toPlayer(row: PlayerRow): DirectoryPlayer {
    return {
      id: row.id,
      name: row.display_name,
      archived: row.archived_at !== null,
    };
  }

  private failure<T>(message: string): PlayerDirectoryResult<T> {
    return { valid: false, errors: [message] };
  }
}
