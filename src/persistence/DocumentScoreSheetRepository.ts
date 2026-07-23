import type {
  PersistedScoreSheet,
  PersistedScoreSheetMetadata,
  SaveScoreSheetInput,
  ScoreSheetRepository,
} from './types.js';

export interface ScoreSheetDocumentStore {
  upsert(document: PersistedScoreSheet): void;
  getById(id: string): PersistedScoreSheet | undefined;
  list(): readonly PersistedScoreSheet[];
  deleteById(id: string): boolean;
}

export class DocumentScoreSheetRepository implements ScoreSheetRepository {
  constructor(private readonly store: ScoreSheetDocumentStore) {}

  save(input: SaveScoreSheetInput): PersistedScoreSheet {
    const existing = input.id === undefined ? undefined : this.store.getById(input.id);
    const id = input.id ?? this.allocateId();
    const nowIso = input.nowIso ?? new Date().toISOString();
    const playerNamesById = input.playerNamesById ?? existing?.playerNamesById;
    const scoreOverrides = input.scoreOverrides ?? existing?.scoreOverrides;
    const appliedGameResult = input.appliedGameResult ?? existing?.appliedGameResult;
    const scoreSheet: PersistedScoreSheet = {
      id,
      name: input.name.trim(),
      status: input.status ?? existing?.status ?? 'draft',
      createdAtIso: existing?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
      playerOrder: input.gameInput.playerOrder ?? this.inferPlayerOrder(input.gameInput),
      ...(playerNamesById === undefined ? {} : { playerNamesById }),
      roundCount: input.gameInput.rounds.length,
      gameInput: input.gameInput,
      gameResult: input.gameResult,
      ...(scoreOverrides === undefined ? {} : { scoreOverrides }),
      ...(appliedGameResult === undefined ? {} : { appliedGameResult }),
    };

    this.validate(scoreSheet);
    this.store.upsert(scoreSheet);
    return scoreSheet;
  }

  getById(id: string): PersistedScoreSheet | undefined {
    return this.store.getById(id);
  }

  list(): readonly PersistedScoreSheetMetadata[] {
    return this.store.list().map((scoreSheet) => ({
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: scoreSheet.status,
      createdAtIso: scoreSheet.createdAtIso,
      updatedAtIso: scoreSheet.updatedAtIso,
      playerOrder: scoreSheet.playerOrder,
      ...(scoreSheet.playerNamesById === undefined ? {} : { playerNamesById: scoreSheet.playerNamesById }),
      roundCount: scoreSheet.roundCount,
    })).sort((left, right) => left.updatedAtIso.localeCompare(right.updatedAtIso));
  }

  deleteById(id: string): boolean {
    return this.store.deleteById(id);
  }

  private allocateId(): string {
    const usedIds = new Set(this.store.list().map((scoreSheet) => scoreSheet.id));
    let nextId = 1;
    while (usedIds.has(`score-sheet-${nextId}`)) nextId += 1;
    return `score-sheet-${nextId}`;
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
    if (scoreSheet.id.trim().length === 0) throw new Error('Score sheet id is required.');
    if (scoreSheet.name.trim().length === 0) throw new Error('Score sheet name is required.');
    if (scoreSheet.roundCount !== scoreSheet.gameInput.rounds.length) {
      throw new Error('Score sheet round count must match game input rounds.');
    }
  }
}
