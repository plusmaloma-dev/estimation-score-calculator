import type { MvpGameResult } from '../services/EstimationMvpService.js';
import type { PlayerScoreResult, ScoreStatus } from '../scoring/types.js';
import type { GameStatisticsSummary, PlayerStatistics } from './types.js';

interface MutablePlayerStatistics {
  playerId: string;
  totalScore: number;
  roundsPlayed: number;
  successfulRounds: number;
  failedRounds: number;
  pendingRuleRounds: number;
  bestRoundScore: number;
  worstRoundScore: number;
  dashSuccesses: number;
  dashFailures: number;
  dashCallSuccesses: number;
  dashCallFailures: number;
  riskSuccesses: number;
  riskFailures: number;
  withRounds: number;
  highContractRounds: number;
  firstSeenIndex: number;
}

export interface StatisticsOptions {
  readonly playerOrder?: readonly string[];
}

export class StatisticsService {
  summarizeGame(result: MvpGameResult, options: StatisticsOptions = {}): GameStatisticsSummary {
    const preferredOrder = this.resolvePreferredOrder(options.playerOrder);
    const statisticsByPlayer = new Map<string, MutablePlayerStatistics>();
    let firstSeenCounter = 0;

    for (const round of result.rounds) {
      if (!round.scoreResult?.valid) {
        continue;
      }

      for (const playerScore of round.scoreResult.playerScores) {
        const playerId = playerScore.playerId.trim();
        if (playerId.length === 0) {
          throw new Error('Statistics player id is required.');
        }

        const existing = statisticsByPlayer.get(playerId);
        const mutable = existing ?? this.createPlayerStatistics(playerId, preferredOrder.get(playerId) ?? firstSeenCounter);
        if (existing === undefined) {
          statisticsByPlayer.set(playerId, mutable);
          firstSeenCounter += 1;
        }

        this.applyRoundScore(mutable, playerScore);
      }
    }

    const playerStatistics = Array.from(statisticsByPlayer.values())
      .sort((left, right) => {
        const scoreDifference = right.totalScore - left.totalScore;
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return left.firstSeenIndex - right.firstSeenIndex;
      })
      .map((entry): PlayerStatistics => ({
        playerId: entry.playerId,
        totalScore: entry.totalScore,
        roundsPlayed: entry.roundsPlayed,
        successfulRounds: entry.successfulRounds,
        failedRounds: entry.failedRounds,
        pendingRuleRounds: entry.pendingRuleRounds,
        exactBidRate: this.toRate(entry.successfulRounds, entry.roundsPlayed),
        averageScore: this.toAverage(entry.totalScore, entry.roundsPlayed),
        bestRoundScore: entry.bestRoundScore,
        worstRoundScore: entry.worstRoundScore,
        dashSuccesses: entry.dashSuccesses,
        dashFailures: entry.dashFailures,
        dashCallSuccesses: entry.dashCallSuccesses,
        dashCallFailures: entry.dashCallFailures,
        riskSuccesses: entry.riskSuccesses,
        riskFailures: entry.riskFailures,
        withRounds: entry.withRounds,
        highContractRounds: entry.highContractRounds,
      }));

    return {
      playerStatistics,
      totalRounds: result.rounds.length,
      validRounds: result.rounds.filter((round) => round.scoreResult?.valid === true).length,
      invalidRounds: result.rounds.filter((round) => round.scoreResult?.valid !== true).length,
      highestScorePlayerId: playerStatistics[0]?.playerId,
      lowestScorePlayerId: playerStatistics[playerStatistics.length - 1]?.playerId,
    };
  }

  private resolvePreferredOrder(playerOrder: readonly string[] | undefined): ReadonlyMap<string, number> {
    const preferredOrder = new Map<string, number>();
    playerOrder?.forEach((playerId, index) => {
      const trimmedPlayerId = playerId.trim();
      if (trimmedPlayerId.length > 0 && !preferredOrder.has(trimmedPlayerId)) {
        preferredOrder.set(trimmedPlayerId, index);
      }
    });

    return preferredOrder;
  }

  private createPlayerStatistics(playerId: string, firstSeenIndex: number): MutablePlayerStatistics {
    return {
      playerId,
      totalScore: 0,
      roundsPlayed: 0,
      successfulRounds: 0,
      failedRounds: 0,
      pendingRuleRounds: 0,
      bestRoundScore: Number.NEGATIVE_INFINITY,
      worstRoundScore: Number.POSITIVE_INFINITY,
      dashSuccesses: 0,
      dashFailures: 0,
      dashCallSuccesses: 0,
      dashCallFailures: 0,
      riskSuccesses: 0,
      riskFailures: 0,
      withRounds: 0,
      highContractRounds: 0,
      firstSeenIndex,
    };
  }

  private applyRoundScore(statistics: MutablePlayerStatistics, playerScore: PlayerScoreResult): void {
    statistics.totalScore += playerScore.score;
    statistics.roundsPlayed += 1;
    statistics.bestRoundScore = Math.max(statistics.bestRoundScore, playerScore.score);
    statistics.worstRoundScore = Math.min(statistics.worstRoundScore, playerScore.score);

    this.incrementStatusCount(statistics, playerScore.status);

    if (playerScore.riskType === 'dash') {
      if (playerScore.didMatchBid) {
        statistics.dashSuccesses += 1;
      } else {
        statistics.dashFailures += 1;
      }
    }

    if (playerScore.riskType === 'dash-call') {
      if (playerScore.didMatchBid) {
        statistics.dashCallSuccesses += 1;
      } else {
        statistics.dashCallFailures += 1;
      }
    }

    if (playerScore.isRiskTaker) {
      if (playerScore.didMatchBid) {
        statistics.riskSuccesses += 1;
      } else {
        statistics.riskFailures += 1;
      }
    }

    if (playerScore.riskType === 'with' || playerScore.role === 'with-player') {
      statistics.withRounds += 1;
    }

    if (playerScore.isHighContract) {
      statistics.highContractRounds += 1;
    }
  }

  private incrementStatusCount(statistics: MutablePlayerStatistics, status: ScoreStatus): void {
    if (status === 'success') {
      statistics.successfulRounds += 1;
      return;
    }

    if (status === 'failed') {
      statistics.failedRounds += 1;
      return;
    }

    statistics.pendingRuleRounds += 1;
  }

  private toRate(numerator: number, denominator: number): number {
    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  private toAverage(total: number, count: number): number {
    if (count === 0) {
      return 0;
    }

    return total / count;
  }
}
