import type { PersistedScoreSheet } from '../persistence/types.js';
import { EstimationMvpService } from '../services/EstimationMvpService.js';
import { StatisticsService } from '../statistics/StatisticsService.js';

export interface RichScoreSheetExportOptions {
  readonly generatedAtIso?: string;
  readonly title?: string;
}

export interface RichScoreSheetExportDocument {
  readonly format: 'markdown';
  readonly generatedAtIso: string;
  readonly content: string;
}

interface MutableStanding {
  playerId: string;
  totalScore: number;
  firstSeenIndex: number;
}

export class RichScoreSheetExportService {
  constructor(
    private readonly mvpService = new EstimationMvpService(),
    private readonly statisticsService = new StatisticsService(),
  ) {}

  exportMarkdown(scoreSheet: PersistedScoreSheet, options: RichScoreSheetExportOptions = {}): RichScoreSheetExportDocument {
    const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
    const gameResult = scoreSheet.gameResult ?? this.mvpService.calculateGame(scoreSheet.gameInput);
    const playerOrder = scoreSheet.playerOrder.length > 0 ? scoreSheet.playerOrder : this.inferPlayerOrder(scoreSheet);
    const statistics = this.statisticsService.summarizeGame(gameResult, { playerOrder });

    const sections = [
      `# ${options.title ?? scoreSheet.name}`,
      this.renderSummary(scoreSheet, generatedAtIso),
      this.renderRoundTable(scoreSheet, playerOrder),
      this.renderRunningBalances(scoreSheet, playerOrder),
      this.renderFinalStandings(scoreSheet, playerOrder),
      this.renderStatistics(statistics),
    ];

    return {
      format: 'markdown',
      generatedAtIso,
      content: `${sections.join('\n\n')}\n`,
    };
  }

  private renderSummary(scoreSheet: PersistedScoreSheet, generatedAtIso: string): string {
    return [
      '## Summary',
      '',
      `- Score sheet id: ${scoreSheet.id}`,
      `- Status: ${scoreSheet.status}`,
      `- Created: ${scoreSheet.createdAtIso}`,
      `- Updated: ${scoreSheet.updatedAtIso}`,
      `- Exported: ${generatedAtIso}`,
      `- Rounds: ${scoreSheet.roundCount}`,
      `- Players: ${scoreSheet.playerOrder.join(', ')}`,
    ].join('\n');
  }

  private renderRoundTable(scoreSheet: PersistedScoreSheet, playerOrder: readonly string[]): string {
    const rows = scoreSheet.gameInput.rounds.map((roundInput, index) => {
      const roundResult = scoreSheet.gameResult?.rounds[index] ?? this.mvpService.calculateRound(roundInput);
      const playerScores = roundResult.scoreResult?.playerScores ?? [];
      return [
        String(roundInput.roundNumber),
        roundResult.bidValidation.roundType ?? 'invalid',
        this.formatBidSummary(roundInput.bids),
        this.formatActualSummary(roundInput.actualResults),
        playerOrder.map((playerId) => this.formatScoreForPlayer(playerScores, playerId)).join(' / '),
        roundResult.scoreResult?.riskType ?? '-',
        roundResult.scoreResult?.nextRoundMultiplier?.toString() ?? '-',
      ];
    });

    return this.renderMarkdownTable(
      ['Round', 'Type', 'Bids', 'Actual', 'Scores', 'Risk', 'Next multiplier'],
      rows,
      '## Rounds',
    );
  }

  private renderRunningBalances(scoreSheet: PersistedScoreSheet, playerOrder: readonly string[]): string {
    const balances = new Map(playerOrder.map((playerId) => [playerId, 0]));
    const rows = scoreSheet.gameInput.rounds.map((roundInput, index) => {
      const roundResult = scoreSheet.gameResult?.rounds[index] ?? this.mvpService.calculateRound(roundInput);
      for (const playerScore of roundResult.scoreResult?.playerScores ?? []) {
        balances.set(playerScore.playerId, (balances.get(playerScore.playerId) ?? 0) + playerScore.score);
      }

      return [
        String(roundInput.roundNumber),
        ...playerOrder.map((playerId) => String(balances.get(playerId) ?? 0)),
      ];
    });

    return this.renderMarkdownTable(['Round', ...playerOrder], rows, '## Running Balances');
  }

  private renderFinalStandings(scoreSheet: PersistedScoreSheet, playerOrder: readonly string[]): string {
    const standingsByPlayer = new Map<string, MutableStanding>();
    playerOrder.forEach((playerId, index) => {
      standingsByPlayer.set(playerId, { playerId, totalScore: 0, firstSeenIndex: index });
    });

    scoreSheet.gameInput.rounds.forEach((roundInput, index) => {
      const roundResult = scoreSheet.gameResult?.rounds[index] ?? this.mvpService.calculateRound(roundInput);
      for (const playerScore of roundResult.scoreResult?.playerScores ?? []) {
        const existing = standingsByPlayer.get(playerScore.playerId) ?? {
          playerId: playerScore.playerId,
          totalScore: 0,
          firstSeenIndex: standingsByPlayer.size,
        };
        existing.totalScore += playerScore.score;
        standingsByPlayer.set(playerScore.playerId, existing);
      }
    });

    const rows = Array.from(standingsByPlayer.values())
      .sort((left, right) => {
        const scoreDifference = right.totalScore - left.totalScore;
        return scoreDifference === 0 ? left.firstSeenIndex - right.firstSeenIndex : scoreDifference;
      })
      .map((standing, index) => [String(index + 1), standing.playerId, String(standing.totalScore)]);

    return this.renderMarkdownTable(['Rank', 'Player', 'Total score'], rows, '## Final Standings');
  }

  private renderStatistics(statistics: ReturnType<StatisticsService['summarizeGame']>): string {
    const rows = statistics.playerStatistics.map((player) => [
      player.playerId,
      String(player.roundsPlayed),
      String(player.successfulRounds),
      String(player.failedRounds),
      this.formatNumber(player.exactBidRate),
      this.formatNumber(player.averageScore),
      String(player.bestRoundScore),
      String(player.worstRoundScore),
      String(player.dashSuccesses),
      String(player.dashCallSuccesses),
      String(player.withRounds),
      String(player.highContractRounds),
    ]);

    return this.renderMarkdownTable(
      ['Player', 'Rounds', 'Success', 'Failed', 'Exact bid rate', 'Average', 'Best', 'Worst', 'Dash wins', 'Dash Call wins', 'WITH', 'High contracts'],
      rows,
      '## Statistics',
    );
  }

  private inferPlayerOrder(scoreSheet: PersistedScoreSheet): readonly string[] {
    const seen = new Set<string>();
    const playerOrder: string[] = [];
    for (const round of scoreSheet.gameInput.rounds) {
      for (const bid of round.bids) {
        if (!seen.has(bid.playerId)) {
          seen.add(bid.playerId);
          playerOrder.push(bid.playerId);
        }
      }
    }

    return playerOrder;
  }

  private formatBidSummary(bids: PersistedScoreSheet['gameInput']['rounds'][number]['bids']): string {
    return bids
      .map((bid) => `${bid.playerId}: ${bid.bidType} ${bid.tricks}`)
      .join(', ');
  }

  private formatActualSummary(actualResults: PersistedScoreSheet['gameInput']['rounds'][number]['actualResults']): string {
    return actualResults
      .map((actual) => `${actual.playerId}: ${actual.actualTricks}`)
      .join(', ');
  }

  private formatScoreForPlayer(playerScores: readonly { readonly playerId: string; readonly score: number }[], playerId: string): string {
    const playerScore = playerScores.find((score) => score.playerId === playerId);
    return playerScore === undefined ? `${playerId}: -` : `${playerId}: ${playerScore.score}`;
  }

  private renderMarkdownTable(headers: readonly string[], rows: readonly (readonly string[])[], title: string): string {
    const normalizedRows = rows.length > 0 ? rows : [headers.map(() => '-')];
    return [
      title,
      '',
      `| ${headers.map((header) => this.escapeCell(header)).join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...normalizedRows.map((row) => `| ${row.map((cell) => this.escapeCell(cell)).join(' | ')} |`),
    ].join('\n');
  }

  private escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
}
