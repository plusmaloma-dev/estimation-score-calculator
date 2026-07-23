import type { MvpGameInput, MvpGameResult } from '../services/EstimationMvpService.js';

export type PersistedScoreSheetStatus = 'draft' | 'finalized';

export interface ScoreOverrideAuditRecord {
  readonly id: string;
  readonly roundNumber: number;
  readonly playerId: string;
  readonly calculatedScore: number;
  readonly previousAppliedScore: number;
  readonly newAppliedScore: number;
  readonly reason: string;
  readonly changedAtIso: string;
  readonly actorId: string;
}

export interface PersistedScoreSheetMetadata {
  readonly id: string;
  readonly name: string;
  readonly status: PersistedScoreSheetStatus;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly playerOrder: readonly string[];
  readonly playerNamesById?: Readonly<Record<string, string>>;
  readonly roundCount: number;
}

export interface PersistedScoreSheet extends PersistedScoreSheetMetadata {
  readonly gameInput: MvpGameInput;
  readonly gameResult?: MvpGameResult;
  readonly scoreOverrides?: readonly ScoreOverrideAuditRecord[];
  readonly appliedGameResult?: MvpGameResult;
}

export interface SaveScoreSheetInput {
  readonly id?: string;
  readonly name: string;
  readonly status?: PersistedScoreSheetStatus;
  readonly playerNamesById?: Readonly<Record<string, string>>;
  readonly gameInput: MvpGameInput;
  readonly gameResult?: MvpGameResult;
  readonly scoreOverrides?: readonly ScoreOverrideAuditRecord[];
  readonly appliedGameResult?: MvpGameResult;
  readonly nowIso?: string;
}

export interface ScoreSheetRepository {
  save(input: SaveScoreSheetInput): PersistedScoreSheet;
  getById(id: string): PersistedScoreSheet | undefined;
  list(): readonly PersistedScoreSheetMetadata[];
  deleteById(id: string): boolean;
}
