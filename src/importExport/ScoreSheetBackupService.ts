import type { PersistedScoreSheet } from '../persistence/types.js';
import {
  SCORE_SHEET_BACKUP_FORMAT,
  SCORE_SHEET_BACKUP_VERSION,
  type ExportScoreSheetsInput,
  type ImportScoreSheetsResult,
  type ScoreSheetBackupDocument,
} from './types.js';

export class ScoreSheetBackupService {
  exportScoreSheets(input: ExportScoreSheetsInput): ScoreSheetBackupDocument {
    const exportedAtIso = input.exportedAtIso ?? new Date().toISOString();
    const scoreSheets = input.scoreSheets.map((scoreSheet) => this.cloneScoreSheet(scoreSheet));

    return {
      format: SCORE_SHEET_BACKUP_FORMAT,
      version: SCORE_SHEET_BACKUP_VERSION,
      metadata: {
        exportedAtIso,
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      scoreSheets,
    };
  }

  importScoreSheets(document: unknown): ImportScoreSheetsResult {
    const errors: string[] = [];

    if (!this.isRecord(document)) {
      return { valid: false, errors: ['Backup document must be an object.'] };
    }

    if (document.format !== SCORE_SHEET_BACKUP_FORMAT) {
      errors.push(`Unsupported backup format: ${String(document.format)}.`);
    }

    if (document.version !== SCORE_SHEET_BACKUP_VERSION) {
      errors.push(`Unsupported backup version: ${String(document.version)}.`);
    }

    if (!this.isRecord(document.metadata)) {
      errors.push('Backup metadata is required.');
    } else if (typeof document.metadata.exportedAtIso !== 'string' || document.metadata.exportedAtIso.trim().length === 0) {
      errors.push('Backup metadata.exportedAtIso is required.');
    }

    if (!Array.isArray(document.scoreSheets)) {
      errors.push('Backup scoreSheets must be an array.');
    } else {
      document.scoreSheets.forEach((scoreSheet, index) => {
        this.validateScoreSheet(scoreSheet, index, errors);
      });
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      document: this.cloneBackupDocument(document as ScoreSheetBackupDocument),
    };
  }

  private validateScoreSheet(scoreSheet: unknown, index: number, errors: string[]): void {
    const prefix = `scoreSheets[${index}]`;
    if (!this.isRecord(scoreSheet)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }

    this.requireString(scoreSheet.id, `${prefix}.id`, errors);
    this.requireString(scoreSheet.name, `${prefix}.name`, errors);
    this.requireString(scoreSheet.status, `${prefix}.status`, errors);
    this.requireString(scoreSheet.createdAtIso, `${prefix}.createdAtIso`, errors);
    this.requireString(scoreSheet.updatedAtIso, `${prefix}.updatedAtIso`, errors);

    if (!Array.isArray(scoreSheet.playerOrder)) {
      errors.push(`${prefix}.playerOrder must be an array.`);
    }

    if (typeof scoreSheet.roundCount !== 'number' || !Number.isInteger(scoreSheet.roundCount) || scoreSheet.roundCount < 0) {
      errors.push(`${prefix}.roundCount must be a non-negative integer.`);
    }

    if (!this.isRecord(scoreSheet.gameInput)) {
      errors.push(`${prefix}.gameInput is required.`);
    }
  }

  private requireString(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${path} is required.`);
    }
  }

  private cloneBackupDocument(document: ScoreSheetBackupDocument): ScoreSheetBackupDocument {
    return JSON.parse(JSON.stringify(document)) as ScoreSheetBackupDocument;
  }

  private cloneScoreSheet(scoreSheet: PersistedScoreSheet): PersistedScoreSheet {
    return JSON.parse(JSON.stringify(scoreSheet)) as PersistedScoreSheet;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
