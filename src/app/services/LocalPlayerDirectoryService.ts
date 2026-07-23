import {
  normalizePlayerName,
  type DirectoryPlayer,
  type PlayerDirectoryPort,
  type PlayerDirectoryResult,
} from '../../online/players/types.js';

const STORAGE_KEY = 'estimation-player-directory-v1';

interface StoredDirectory {
  readonly players: readonly DirectoryPlayer[];
}

export class LocalPlayerDirectoryService implements PlayerDirectoryPort {
  constructor(private readonly storage: Storage) {}

  async listActivePlayers(query = ''): Promise<readonly DirectoryPlayer[]> {
    const normalizedQuery = normalizePlayerName(query);
    return this.read().players
      .filter((player) => !player.archived)
      .filter((player) => normalizedQuery.length === 0 || normalizePlayerName(player.name).includes(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async createPlayer(name: string): Promise<PlayerDirectoryResult<DirectoryPlayer>> {
    const displayName = name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizePlayerName(displayName);
    if (normalizedName.length === 0) {
      return { valid: false, errors: ['Player name is required.'] };
    }

    const directory = this.read();
    const duplicate = directory.players.find((player) => normalizePlayerName(player.name) === normalizedName);
    if (duplicate !== undefined) {
      return { valid: false, errors: [`Player name already exists: ${duplicate.name}.`] };
    }

    const player: DirectoryPlayer = {
      id: `player-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${directory.players.length + 1}`}`,
      name: displayName,
      archived: false,
    };
    this.write({ players: [...directory.players, player] });
    return { valid: true, errors: [], value: player };
  }

  private read(): StoredDirectory {
    const serialized = this.storage.getItem(STORAGE_KEY);
    if (serialized === null) return { players: [] };
    try {
      const parsed = JSON.parse(serialized) as StoredDirectory;
      return Array.isArray(parsed.players) ? parsed : { players: [] };
    } catch {
      return { players: [] };
    }
  }

  private write(directory: StoredDirectory): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(directory));
  }
}
