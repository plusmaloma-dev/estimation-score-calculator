import type { MvpGameInput, MvpGameResult } from '../services/EstimationMvpService.js';
import type { PlayerScoreResult } from '../scoring/types.js';

export interface ScoreSheetCsvExportInput {
  readonly gameInput: MvpGameInput;
  readonly gameResult: MvpGameResult;
  readonly includeMetadataRows?: boolean;
  readonly title?: string;
  readonly generatedAt?: Date | string;
}

export class ScoreSheetCsvExportService {
  exportScoreSheet(input: ScoreSheetCsvExportInput): string {
    const rows: string[][] = [];

    if (input.includeMetadataRows === true) {
      rows.push(['metric', 'value']);
      rows.push(['title', input.title ?? '']);
      rows.push(['generatedAt', this.formatGeneratedAt(input.generatedAt)]);
      rows.push(['roundCount', input.gameInput.rounds.length.toString()]);
      rows.push(['valid', input.gameResult.valid.toString()]);
      rows.push(['errorCount', input.gameResult.errors.length.toString()]);
      rows.push([]);
    }

    rows.push([
      'roundNumber',
      'roundType',
      'playerId',
      'bidType',
      'bidTricks',
      'actualTricks',
      'delta',
      'score',
      'status',
      'role',
      'riskType',
      'riskModifier',
      'runningScore',
      'notes',
    ]);

    input.gameInput.rounds.forEach((roundInput, roundIndex) => {
      const roundResult = input.gameResult.rounds[roundIndex];
      const roundType = roundResult?.bidValidation.roundType ?? 'invalid';
      const scoreResult = roundResult?.scoreResult;

      if (scoreResult === undefined || scoreResult.playerScores.length === 0) {
        rows.push([
          roundInput.roundNumber.toString(),
          roundType,
          '',
          '',
          '',
          '',
          '',
          '',
          'invalid',
          '',
          '',
          '',
          '',
          roundResult?.errors.join('; ') ?? 'Round was not scored.',
        ]);
        return;
      }

      for (const playerScore of scoreResult.playerScores) {
        rows.push(this.formatPlayerScoreRow(roundInput.roundNumber, roundType, playerScore));
      }
    });

    return rows.map((row) => row.map((cell) => this.escapeCell(cell)).join(',')).join('\n');
  }

  private formatPlayerScoreRow(roundNumber: number, roundType: string, playerScore: PlayerScoreResult): string[] {
    return [
      roundNumber.toString(),
      roundType,
      playerScore.playerId,
      playerScore.bidType,
      playerScore.bidTricks.toString(),
      playerScore.actualTricks.toString(),
      playerScore.delta.toString(),
      playerScore.score.toString(),
      playerScore.status,
      playerScore.role,
      playerScore.riskType,
      playerScore.riskModifier.toString(),
      playerScore.runningScore.toString(),
      this.formatNotes(playerScore),
    ];
  }

  private formatNotes(playerScore: PlayerScoreResult): string {
    const generatedNotes = [
      playerScore.didMatchBid ? 'matched bid' : 'missed bid',
      playerScore.isRiskTaker ? 'risk taker' : undefined,
      playerScore.isHighContract ? 'high contract' : undefined,
      playerScore.isOnlyWinner ? 'only winner' : undefined,
      playerScore.isOnlyLoser ? 'only loser' : undefined,
    ].filter((note): note is string => note !== undefined);

    return [...generatedNotes, ...playerScore.notes].join('; ');
  }

  private formatGeneratedAt(generatedAt: Date | string | undefined): string {
    if (generatedAt instanceof Date) {
      return generatedAt.toISOString();
    }

    return generatedAt ?? '';
  }

  private escapeCell(value: string): string {
    if (!/[",\n\r]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
