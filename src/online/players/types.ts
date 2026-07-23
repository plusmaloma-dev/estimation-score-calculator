export interface DirectoryPlayer {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

export interface PlayerDirectoryResult<T> {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly value?: T;
}

export interface PlayerDirectoryPort {
  listActivePlayers(query?: string): Promise<readonly DirectoryPlayer[]>;
  createPlayer(name: string): Promise<PlayerDirectoryResult<DirectoryPlayer>>;
}

export function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
