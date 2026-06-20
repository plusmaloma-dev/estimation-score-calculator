import type { PlayerScoreResult, RoundScoreResult } from './types.js';

export interface PlayerBalance {
  readonly playerId: string;
  readonly balance: number;
}

export interface RoundBalanceSnapshot {
  readonly roundNumber: number;
  readonly balances: readonly PlayerBalance[];
}

export class BalanceAccumulator {
  private readonly balances = new Map<string, number>();
  private readonly history: RoundBalanceSnapshot[] = [];

  constructor(playerIds: readonly string[]) {
    for (const playerId of playerIds) {
      this.balances.set(playerId, 0);
    }
  }

  addRound(roundNumber: number, roundResult: RoundScoreResult): RoundBalanceSnapshot {
    for (const score of roundResult.playerScores) {
      this.addPlayerScore(score);
    }

    const snapshot: RoundBalanceSnapshot = {
      roundNumber,
      balances: this.getBalances(),
    };

    this.history.push(snapshot);
    return snapshot;
  }

  getBalance(playerId: string): number {
    return this.balances.get(playerId) ?? 0;
  }

  getBalances(): readonly PlayerBalance[] {
    return Array.from(this.balances.entries()).map(([playerId, balance]) => ({
      playerId,
      balance,
    }));
  }

  getStandings(): readonly PlayerBalance[] {
    return [...this.getBalances()].sort((left, right) => right.balance - left.balance);
  }

  getHistory(): readonly RoundBalanceSnapshot[] {
    return [...this.history];
  }

  private addPlayerScore(score: PlayerScoreResult): void {
    const currentBalance = this.getBalance(score.playerId);
    this.balances.set(score.playerId, currentBalance + score.score);
  }
}
