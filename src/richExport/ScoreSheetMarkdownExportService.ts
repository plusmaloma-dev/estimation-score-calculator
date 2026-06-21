import type { MvpGameInput, MvpGameResult } from '../services/EstimationMvpService.js';
import type { LeaderboardEntry } from '../services/LeaderboardService.js';
import type { PlayerScoreResult, RoundScoreResult } from '../scoring/types.js';

export interface ScoreSheetMarkdownExportInput {
  readonly title: string;
  readonly gameInput: MvpGameInput;
  readonly gameResult: MvpGameResult;
  readonly generatedAt?: Date | string;
}

export class ScoreSheetMarkdownExportService {
  exportScoreSheet(input: ScoreSheetMarkdownExportInput): string {
    const lines: string[] = [];
    lines.push(`# ${this.cleanText(input.title)}`);
    lines.push('');
    lines.push(`Generated: ${this.formatGeneratedAt(input.generatedAt)}`);
    lines.push('');
    lines.push('## Final Standings');
    lines.push('');
    lines.push(...this.formatLeaderboard(input.gameResult.leaderboard));
    lines.push('');
    lines.push('## Round Scores');
    lines.push('');
    lines.push(...this.formatRounds(input));

    if (input.gameResult.errors.length > 0) {
      lines.push('');
      lines.push('## Validation Errors');
      lines.push('');
      for (const error of input.gameResult.errors) {
        lines.push(`- ${this.cleanText(error)}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatLeaderboard(leaderboard: readonly LeaderboardEntry[]): string[] {
    if (leaderboard.length === 0) {
      return ['No scored rounds yet.'];
    }

    return [
      '| Rank | Player | Total Score | Rounds Played |',
      '| ---: | --- | ---: | ---: |',
      ...leaderboard.map(
        (entry) =>
          `| ${entry.rank} | ${this.cleanText(entry.playerId)} | ${entry.totalScore} | ${entry.roundsPlayed} |`,
      ),
    ];
  }

  private formatRounds(input: ScoreSheetMarkdownExportInput): string[] {
    if (input.gameInput.rounds.length === 0) {
      return ['No rounds saved yet.'];
    }

    const lines: string[] = [
      '| Round | Type | Player | Bid | Actual | Delta | Score | Status | Notes |',
      '| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ];

    input.gameInput.rounds.forEach((roundInput, roundIndex) => {
      const roundResult = input.gameResult.rounds[roundIndex];
      const roundType = roundResult?.bidValidation.roundType ?? 'invalid';
      const scoreResult = roundResult?.scoreResult;

      if (scoreResult === undefined || scoreResult.playerScores.length === 0) {
        lines.push(
          `| ${roundInput.roundNumber} | ${roundType} | - | - | - | - | - | invalid | ${this.cleanText(
            roundResult?.errors.join('; ') ?? 'Round was not scored.',
          )} |`,
        );
        return;
      }

      for (const playerScore of scoreResult.playerScores) {
        lines.push(this.formatPlayerRoundLine(roundInput.roundNumber, roundType, playerScore));
      }

      if (scoreResult.nextRoundMultiplier !== undefined) {
        lines.push(
          `| ${roundInput.roundNumber} | ${roundType} | _next round_ | - | - | - | - | multiplier | x${scoreResult.nextRoundMultiplier} |`,
        );
      }
    });

    return lines;
  }

  private formatPlayerRoundLine(
    roundNumber: number,
    roundType: string,
    playerScore: PlayerScoreResult,
  ): string {
    return `| ${roundNumber} | ${roundType} | ${this.cleanText(playerScore.playerId)} | ${playerScore.bidTricks} | ${playerScore.actualTricks} | ${playerScore.delta} | ${playerScore.score} | ${playerScore.status} | ${this.formatNotes(playerScore)} |`;
  }

  private formatNotes(playerScore: PlayerScoreResult): string {
    const generatedNotes = [
      playerScore.didMatchBid ? 'matched bid' : 'missed bid',
      playerScore.role,
      playerScore.riskType !== 'none' ? playerScore.riskType : undefined,
      playerScore.isRiskTaker ? `risk modifier ${playerScore.riskModifier}` : undefined,
      playerScore.isHighContract ? 'high contract' : undefined,
      playerScore.isOnlyWinner ? 'only winner' : undefined,
      playerScore.isOnlyLoser ? 'only loser' : undefined,
    ].filter((note): note is string => note !== undefined);

    return [...generatedNotes, ...playerScore.notes].map((note) => this.cleanText(note)).join('; ');
  }

  private formatGeneratedAt(generatedAt: Date | string | undefined): string {
    if (generatedAt instanceof Date) {
      return generatedAt.toISOString();
    }

    return generatedAt ?? 'not specified';
  }

  private cleanText(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  }
}
