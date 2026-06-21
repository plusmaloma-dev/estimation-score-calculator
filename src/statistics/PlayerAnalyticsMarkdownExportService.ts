import type { PlayerAnalyticsEntry, PlayerAnalyticsSummary } from './playerAnalyticsTypes.js';

export interface PlayerAnalyticsMarkdownExportOptions {
  readonly title?: string;
  readonly generatedAt?: Date;
}

export class PlayerAnalyticsMarkdownExportService {
  exportSummary(summary: PlayerAnalyticsSummary, options: PlayerAnalyticsMarkdownExportOptions = {}): string {
    const lines: string[] = [];
    lines.push(`# ${options.title?.trim() || 'Player Analytics'}`);
    lines.push('');

    if (options.generatedAt !== undefined) {
      lines.push(`Generated at: ${options.generatedAt.toISOString()}`);
      lines.push('');
    }

    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total rounds: ${summary.totalRounds}`);
    lines.push(`- Valid rounds: ${summary.validRounds}`);
    lines.push(`- Invalid rounds: ${summary.invalidRounds}`);
    lines.push(`- Leader: ${summary.leaderPlayerId ?? 'N/A'}`);
    lines.push(`- Most consistent: ${summary.mostConsistentPlayerId ?? 'N/A'}`);
    lines.push('');
    lines.push('## Player Rankings');
    lines.push('');

    if (summary.players.length === 0) {
      lines.push('No valid player analytics are available.');
      return lines.join('\n');
    }

    lines.push('| Rank | Player | Total | Avg | Exact % | Failure % | Best | Worst | Dash | Dash Call | Risk | Double Risk | WITH | High Contracts | All-Loser |');
    lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

    for (const player of summary.players) {
      lines.push(this.formatPlayerRow(player));
    }

    return lines.join('\n');
  }

  private formatPlayerRow(player: PlayerAnalyticsEntry): string {
    return [
      player.rank.toString(),
      this.escapeCell(player.playerId),
      player.totalScore.toString(),
      this.formatNumber(player.averageScore),
      this.formatRate(player.exactBidRate),
      this.formatRate(player.failureRate),
      player.bestRoundScore.toString(),
      player.worstRoundScore.toString(),
      `${player.dashAttempts} / ${this.formatRate(player.dashSuccessRate)}`,
      `${player.dashCallAttempts} / ${this.formatRate(player.dashCallSuccessRate)}`,
      `${player.riskAttempts} / ${this.formatRate(player.riskSuccessRate)}`,
      `${player.doubleRiskAttempts} / ${this.formatRate(player.doubleRiskSuccessRate)}`,
      player.withRounds.toString(),
      player.highContractRounds.toString(),
      player.allLoserRounds.toString(),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |');
  }

  private formatRate(rate: number): string {
    return `${this.formatNumber(rate * 100)}%`;
  }

  private formatNumber(value: number): string {
    if (Number.isInteger(value)) {
      return value.toString();
    }

    return value.toFixed(2).replace(/\.00$/, '');
  }

  private escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|');
  }
}
