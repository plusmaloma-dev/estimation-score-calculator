import type { PlayerAnalyticsEntry, PlayerAnalyticsSummary } from './playerAnalyticsTypes.js';

export interface PlayerAnalyticsCsvExportOptions {
  readonly includeSummaryRows?: boolean;
}

export class PlayerAnalyticsCsvExportService {
  exportSummary(summary: PlayerAnalyticsSummary, options: PlayerAnalyticsCsvExportOptions = {}): string {
    const rows: string[][] = [];

    if (options.includeSummaryRows === true) {
      rows.push(['metric', 'value']);
      rows.push(['totalRounds', summary.totalRounds.toString()]);
      rows.push(['validRounds', summary.validRounds.toString()]);
      rows.push(['invalidRounds', summary.invalidRounds.toString()]);
      rows.push(['leaderPlayerId', summary.leaderPlayerId ?? '']);
      rows.push(['mostConsistentPlayerId', summary.mostConsistentPlayerId ?? '']);
      rows.push([]);
    }

    rows.push([
      'rank',
      'playerId',
      'totalScore',
      'roundsPlayed',
      'averageScore',
      'bestRoundScore',
      'worstRoundScore',
      'exactBidRate',
      'failureRate',
      'dashAttempts',
      'dashSuccessRate',
      'dashCallAttempts',
      'dashCallSuccessRate',
      'riskAttempts',
      'riskSuccessRate',
      'doubleRiskAttempts',
      'doubleRiskSuccessRate',
      'withRounds',
      'highContractRounds',
      'allLoserRounds',
    ]);

    for (const player of summary.players) {
      rows.push(this.formatPlayerRow(player));
    }

    return rows.map((row) => row.map((cell) => this.escapeCell(cell)).join(',')).join('\n');
  }

  private formatPlayerRow(player: PlayerAnalyticsEntry): string[] {
    return [
      player.rank.toString(),
      player.playerId,
      player.totalScore.toString(),
      player.roundsPlayed.toString(),
      this.formatNumber(player.averageScore),
      player.bestRoundScore.toString(),
      player.worstRoundScore.toString(),
      this.formatNumber(player.exactBidRate),
      this.formatNumber(player.failureRate),
      player.dashAttempts.toString(),
      this.formatNumber(player.dashSuccessRate),
      player.dashCallAttempts.toString(),
      this.formatNumber(player.dashCallSuccessRate),
      player.riskAttempts.toString(),
      this.formatNumber(player.riskSuccessRate),
      player.doubleRiskAttempts.toString(),
      this.formatNumber(player.doubleRiskSuccessRate),
      player.withRounds.toString(),
      player.highContractRounds.toString(),
      player.allLoserRounds.toString(),
    ];
  }

  private formatNumber(value: number): string {
    if (Number.isInteger(value)) {
      return value.toString();
    }

    return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }

  private escapeCell(value: string): string {
    if (!/[",\n\r]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
