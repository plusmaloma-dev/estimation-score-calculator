import type { PersistedScoreSheet } from '../persistence/types.js';

export const SCORE_SHEET_BACKUP_FORMAT = 'egyptian-estimation-score-sheets';
export const SCORE_SHEET_BACKUP_VERSION = 1;

export interface ScoreSheetBackupMetadata {
  readonly exportedAtIso: string;
  readonly source?: string;
  readonly notes?: string;
}

export interface ScoreSheetBackupDocument {
  readonly format: typeof SCORE_SHEET_BACKUP_FORMAT;
  readonly version: typeof SCORE_SHEET_BACKUP_VERSION;
  readonly metadata: ScoreSheetBackupMetadata;
  readonly scoreSheets: readonly PersistedScoreSheet[];
}

export interface ExportScoreSheetsInput {
  readonly scoreSheets: readonly PersistedScoreSheet[];
  readonly exportedAtIso?: string;
  readonly source?: string;
  readonly notes?: string;
}

export interface ImportScoreSheetsResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly document?: ScoreSheetBackupDocument;
}
