import type {
  PersistedScoreSheet,
  PersistedScoreSheetMetadata,
  SaveScoreSheetInput,
  ScoreSheetRepository,
} from './types.js';

export class InMemoryScoreSheetRepository implements ScoreSheetRepository {
  private readonly scoreSheets = new Map<string, PersistedScoreSheet>();
  private nextId = 1;

  save(input: SaveScoreSheetInput): PersistedScoreSheet {
    const existing = input.id === undefined ? undefined : this.scoreSheets.get(input.id);
    const id = input.id ?? this.allocateId();
    const nowIso = input.nowIso ?? new Date().toISOString();
    const playerNamesById = input.playerNamesById ?? existing?.playerNamesById;
    const scoreOverrides = input.scoreOverrides ?? existing?.scoreOverrides;
    const appliedGameResult = input.appliedGameResult ?? existing?.appliedGameResult;
    const finalizedAtIso = input.finalizedAtIso === null
      ? undefined
      : input.finalizedAtIso ?? existing?.finalizedAtIso;
    const finalizedBy = input.finalizedBy === null
      ? undefined
      : input.finalizedBy ?? existing?.finalizedBy;
    const lifecycleAudit = input.lifecycleAudit ?? existing?.lifecycleAudit;
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
      ...(finalizedAtIso === undefined ? {} : { finalizedAtIso }),
      ...(finalizedBy === undefined ? {} : { finalizedBy }),
      ...(lifecycleAudit === undefined ? {} : { lifecycleAudit }),
    };

    this.validate(scoreSheet);
    this.scoreSheets.set(id, scoreSheet);
    return scoreSheet;
  }

  getById(id: string): PersistedScoreSheet | undefined {
    return this.scoreSheets.get(id);
  }

  list(): readonly PersistedScoreSheetMetadata[] {
    return Array.from(this.scoreSheets.values(), (scoreSheet) => ({
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
    return this.scoreSheets.delete(id);
  }

  private allocateId(): string {
    const id = `score-sheet-${this.nextId}`;
    this.nextId += 1;
    return id;
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
