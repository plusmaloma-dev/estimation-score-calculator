import type { RoundScoreResult } from './types.js';
import type { PlayerBalance } from './BalanceAccumulator.js';

export interface RenderedRoundInput {
  readonly roundNumber: number;
  readonly roundLabel: string;
  readonly result: RoundScoreResult;
  readonly balances: readonly PlayerBalance[];
}

export class MarkdownScoreTableRenderer {
  render(rounds: readonly RenderedRoundInput[], playerOrder: readonly string[]): string {
    const lines: string[] = [];
    lines.push('| ' + ['Rd', 'Type', ...playerOrder].join(' | ') + ' |');
    lines.push('| ' + ['---:', '---', ...playerOrder.map(() => '---')].join(' | ') + ' |');

    for (const round of rounds) {
      const row = [round.roundNumber.toString(), round.roundLabel];
      for (const playerId of playerOrder) {
        row.push(this.renderPlayerCell(round, playerId));
      }
      lines.push('| ' + row.join(' | ') + ' |');
    }

    return lines.join('\n');
  }

  private renderPlayerCell(round: RenderedRoundInput, playerId: string): string {
    const score = round.result.playerScores.find((playerScore) => playerScore.playerId === playerId);
    const balance = round.balances.find((playerBalance) => playerBalance.playerId === playerId);

    if (score === undefined || balance === undefined) {
      return '-';
    }

    const tags = this.renderTags(score);
    const prefix = tags.length > 0 ? tags + ' ' : '';

    return prefix + score.bidTricks + '/' + score.actualTricks + ' = ' + this.formatNumber(score.score) + ' (' + this.formatNumber(balance.balance) + ')';
  }

  private renderTags(score: RoundScoreResult['playerScores'][number]): string {
    const tags: string[] = [];

    if (score.role === 'bid-owner') tags.push('BO');
    if (score.role === 'with-player') tags.push('WITH');
    if (score.riskType === 'dash') tags.push('DASH');
    if (score.isRiskTaker) tags.push('RISK');
    if (score.isOnlyWinner) tags.push('OW');
    if (score.isOnlyLoser) tags.push('OL');

    return tags.join('+');
  }

  private formatNumber(value: number): string {
    return value > 0 ? '+' + value : value.toString();
  }
}
