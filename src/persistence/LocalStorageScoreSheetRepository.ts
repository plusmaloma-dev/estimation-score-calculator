import type {
  PersistedScoreSheet,
  PersistedScoreSheetMetadata,
  SaveScoreSheetInput,
  ScoreSheetRepository,
} from './types.js';

export interface ScoreSheetStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LocalStorageScoreSheetState {
  readonly version: 1;
  readonly nextId: number;
  readonly scoreSheets: readonly PersistedScoreSheet[];
}

const DEFAULT_STORAGE_KEY = 'egyptian-estimation:score-sheets:v1';

export class LocalStorageScoreSheetRepository implements ScoreSheetRepository {
  constructor(
    private readonly storage: ScoreSheetStorageLike,
    private readonly storageKey = DEFAULT_STORAGE_KEY,
  ) {}

  save(input: SaveScoreSheetInput): PersistedScoreSheet {
    const state = this.loadState();
    const existing = input.id === undefined
      ? undefined
      : state.scoreSheets.find((scoreSheet) => scoreSheet.id === input.id);
    const id = input.id ?? `score-sheet-${state.nextId}`;
    const nowIso = input.nowIso ?? new Date().toISOString();
    const scoreSheet: PersistedScoreSheet = {
      id,
      name: input.name.trim(),
      status: input.status ?? existing?.status ?? 'draft',
      createdAtIso: existing?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
      playerOrder: input.gameInput.playerOrder ?? this.inferPlayerOrder(input.gameInput),
      playerNamesById: input.playerNamesById ?? existing?.playerNamesById,
      roundCount: input.gameInput.rounds.length,
      gameInput: input.gameInput,
      gameResult: input.gameResult,
    };

    this.validate(scoreSheet);

    const scoreSheets = [
      ...state.scoreSheets.filter((candidate) => candidate.id !== id),
      scoreSheet,
    ];
    const nextId = input.id === undefined ? state.nextId + 1 : state.nextId;
    this.saveState({ version: 1, nextId, scoreSheets });

    return scoreSheet;
  }

  getById(id: string): PersistedScoreSheet | undefined {
    return this.loadState().scoreSheets.find((scoreSheet) => scoreSheet.id === id);
  }

  list(): readonly PersistedScoreSheetMetadata[] {
    return this.loadState().scoreSheets.map((scoreSheet) => ({
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: scoreSheet.status,
      createdAtIso: scoreSheet.createdAtIso,
      updatedAtIso: scoreSheet.updatedAtIso,
      playerOrder: scoreSheet.playerOrder,
      playerNamesById: scoreSheet.playerNamesById,
      roundCount: scoreSheet.roundCount,
    })).sort((left, right) => left.updatedAtIso.localeCompare(right.updatedAtIso));
  }

  deleteById(id: string): boolean {
    const state = this.loadState();
    const scoreSheets = state.scoreSheets.filter((scoreSheet) => scoreSheet.id !== id);
    if (scoreSheets.length === state.scoreSheets.length) {
      return false;
    }

    this.saveState({ ...state, scoreSheets });
    return true;
  }

  clear(): void {
    this.storage.removeItem(this.storageKey);
  }

  private loadState(): LocalStorageScoreSheetState {
    const raw = this.storage.getItem(this.storageKey);
    if (raw === null) {
      return this.emptyState();
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!this.isState(parsed)) {
        return this.emptyState();
      }

      return parsed;
    } catch {
      return this.emptyState();
    }
  }

  private saveState(state: LocalStorageScoreSheetState): void {
    this.storage.setItem(this.storageKey, JSON.stringify(state));
  }

  private emptyState(): LocalStorageScoreSheetState {
    return { version: 1, nextId: 1, scoreSheets: [] };
  }

  private inferPlayerOrder(gameInput: SaveScoreSheetInput['gameInput']): readonly string[] {
    const seen = new Set<string>();
    const playerOrder: string[] = [];
    for (const round of gameInput.rounds) {
      for (const bid of round.bids) {
        if (!seen.has(bid.playerId)) {
          seen.add(bid.playerId);
          playerOrder.push(bid.playerId);
        }
      }
    }
    return playerOrder;
  }

  private validate(scoreSheet: PersistedScoreSheet): void {
    if (scoreSheet.id.trim().length === 0) {
      throw new Error('Score sheet id is required.');
    }

    if (scoreSheet.name.trim().length === 0) {
      throw new Error('Score sheet name is required.');
    }

    if (scoreSheet.roundCount !== scoreSheet.gameInput.rounds.length) {
      throw new Error('Score sheet round count must match game input rounds.');
    }
  }

  private isState(value: unknown): value is LocalStorageScoreSheetState {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Partial<LocalStorageScoreSheetState>;
    return candidate.version === 1
      && typeof candidate.nextId === 'number'
      && Number.isInteger(candidate.nextId)
      && candidate.nextId >= 1
      && Array.isArray(candidate.scoreSheets);
  }
}
