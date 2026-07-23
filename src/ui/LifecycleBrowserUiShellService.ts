import type { PersistedScoreSheet, ScoreSheetRepository } from '../persistence/types.js';
import {
  BrowserUiShellService,
  type UiOverrideRoundScoresInput,
  type UiOverrideRoundScoresResult,
  type UiRoundEntryInput,
  type UiSaveRoundResult,
  type UiSessionHistoryItem,
  type UiValidationResult,
} from './BrowserUiShellService.js';

export interface UiGameLifecycleResult extends UiValidationResult {
  readonly scoreSheet?: PersistedScoreSheet;
}

export interface LifecycleSessionHistoryItem extends UiSessionHistoryItem {
  readonly createdAtIso: string;
  readonly createdAtLabel: string;
}

export class LifecycleBrowserUiShellService extends BrowserUiShellService {
  constructor(private readonly lifecycleRepository: ScoreSheetRepository) {
    super(lifecycleRepository);
  }

  override getSessionHistory(): { readonly sessions: readonly LifecycleSessionHistoryItem[] } {
    const metadataById = new Map(this.lifecycleRepository.list().map((metadata) => [metadata.id, metadata]));
    return {
      sessions: super.getSessionHistory().sessions.map((session) => {
        const metadata = metadataById.get(session.id);
        const createdAtIso = metadata?.createdAtIso ?? session.updatedAtIso;
        return {
          ...session,
          createdAtIso,
          createdAtLabel: this.formatCreatedAtLabel(createdAtIso),
        };
      }),
    };
  }

  override saveRound(scoreSheetId: string, input: UiRoundEntryInput, nowIso?: string): UiSaveRoundResult {
    const writable = this.requireWritableGame(scoreSheetId);
    if (!writable.valid) return writable;
    return super.saveRound(scoreSheetId, input, nowIso);
  }

  override overrideRoundScores(
    scoreSheetId: string,
    input: UiOverrideRoundScoresInput,
  ): UiOverrideRoundScoresResult {
    const writable = this.requireWritableGame(scoreSheetId);
    if (!writable.valid) return writable;
    return super.overrideRoundScores(scoreSheetId, input);
  }

  finalizeGame(scoreSheetId: string, actorId: string, nowIso = new Date().toISOString()): UiGameLifecycleResult {
    const scoreSheet = this.lifecycleRepository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }
    if (scoreSheet.status !== 'draft') {
      return { valid: false, errors: ['Only an in-progress game can be completed.'] };
    }
    if (scoreSheet.roundCount < 18) {
      return { valid: false, errors: ['A game requires at least 18 saved rounds before completion.'] };
    }

    const saved = this.lifecycleRepository.save({
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: 'finalized',
      playerNamesById: scoreSheet.playerNamesById,
      gameInput: scoreSheet.gameInput,
      gameResult: scoreSheet.gameResult,
      scoreOverrides: scoreSheet.scoreOverrides,
      appliedGameResult: scoreSheet.appliedGameResult,
      finalizedAtIso: nowIso,
      finalizedBy: actorId,
      lifecycleAudit: [
        ...(scoreSheet.lifecycleAudit ?? []),
        { action: 'game.finalized', actorId, occurredAtIso: nowIso },
      ],
      nowIso,
    });

    return { valid: true, errors: [], scoreSheet: saved };
  }

  reopenGame(scoreSheetId: string, actorId: string, nowIso = new Date().toISOString()): UiGameLifecycleResult {
    const scoreSheet = this.lifecycleRepository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }
    if (scoreSheet.status !== 'finalized') {
      return { valid: false, errors: ['Only a completed game can be reopened.'] };
    }

    const saved = this.lifecycleRepository.save({
      id: scoreSheet.id,
      name: scoreSheet.name,
      status: 'draft',
      playerNamesById: scoreSheet.playerNamesById,
      gameInput: scoreSheet.gameInput,
      gameResult: scoreSheet.gameResult,
      scoreOverrides: scoreSheet.scoreOverrides,
      appliedGameResult: scoreSheet.appliedGameResult,
      finalizedAtIso: null,
      finalizedBy: null,
      lifecycleAudit: [
        ...(scoreSheet.lifecycleAudit ?? []),
        { action: 'game.reopened', actorId, occurredAtIso: nowIso },
      ],
      nowIso,
    });

    return { valid: true, errors: [], scoreSheet: saved };
  }

  private requireWritableGame(scoreSheetId: string): UiValidationResult {
    const scoreSheet = this.lifecycleRepository.getById(scoreSheetId);
    if (scoreSheet === undefined) {
      return { valid: false, errors: [`Score sheet not found: ${scoreSheetId}.`] };
    }
    if (scoreSheet.status === 'finalized') {
      return { valid: false, errors: ['A completed game is read-only. Reopen it before making changes.'] };
    }
    return { valid: true, errors: [] };
  }

  private formatCreatedAtLabel(createdAtIso: string): string {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(createdAtIso));
    return `Created ${formatted.replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM')}`;
  }
}
