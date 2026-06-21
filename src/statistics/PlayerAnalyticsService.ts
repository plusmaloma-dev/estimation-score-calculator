import type { MvpGameResult } from '../services/EstimationMvpService.js';
import type { PlayerScoreResult } from '../scoring/types.js';
import type { PlayerAnalyticsEntry, PlayerAnalyticsSummary } from './playerAnalyticsTypes.js';

interface MutableAnalytics {
  playerId: string;
  totalScore: number;
  roundsPlayed: number;
  successfulRounds: number;
  failedRounds: number;
  bestRoundScore: number;
  worstRoundScore: number;
  dashAttempts: number;
  dashSuccesses: number;
  dashCallAttempts: number;
  dashCallSuccesses: number;
  riskAttempts: number;
  riskSuccesses: number;
  doubleRiskAttempts: number;
  doubleRiskSuccesses: number;
  withRounds: number;
  highContractRounds: number;
  allLoserRounds: number;
  firstSeenIndex: number;
}

export interface PlayerAnalyticsOptions {
  readonly playerOrder?: readonly string[];
}

export class PlayerAnalyticsService {
  summarizeGame(result: MvpGameResult, options: PlayerAnalyticsOptions = {}): PlayerAnalyticsSummary {
    const preferredOrder = this.resolvePreferredOrder(options.playerOrder);
    const analyticsByPlayer = new Map<string, MutableAnalytics>();
    let firstSeenCounter = 0;

    for (const round of result.rounds) {
      if (!round.scoreResult?.valid) {
        continue;
      }

      const allLoserRound = round.scoreResult.playerScores.length > 0 && round.scoreResult.playerScores.every((score) => score.score === 0 && score.didMatchBid === false);

      for (const playerScore of round.scoreResult.playerScores) {
        const playerId = playerScore.playerId.trim();
        if (playerId.length === 0) {
          throw new Error('Analytics player id is required.');
        }

        const existing = analyticsByPlayer.get(playerId);
        const mutable = existing ?? this.createAnalytics(playerId, preferredOrder.get(playerId) ?? firstSeenCounter);
        if (existing === undefined) {
          analyticsByPlayer.set(playerId, mutable);
          firstSeenCounter += 1;
        }

        this.applyPlayerScore(mutable, playerScore, allLoserRound);
      }
    }

    const players = Array.from(analyticsByPlayer.values())
      .sort((left, right) => {
        const scoreDifference = right.totalScore - left.totalScore;
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        const averageDifference = this.toAverage(right.totalScore, right.roundsPlayed) - this.toAverage(left.totalScore, left.roundsPlayed);
        if (averageDifference !== 0) {
          return averageDifference;
        }

        return left.firstSeenIndex - right.firstSeenIndex;
      })
      .map((entry, index): PlayerAnalyticsEntry => ({
        rank: index + 1,
        playerId: entry.playerId,
        totalScore: entry.totalScore,
        roundsPlayed: entry.roundsPlayed,
        averageScore: this.toAverage(entry.totalScore, entry.roundsPlayed),
        bestRoundScore: entry.roundsPlayed === 0 ? 0 : entry.bestRoundScore,
        worstRoundScore: entry.roundsPlayed === 0 ? 0 : entry.worstRoundScore,
        exactBidRate: this.toRate(entry.successfulRounds, entry.roundsPlayed),
        failureRate: this.toRate(entry.failedRounds, entry.roundsPlayed),
        dashAttempts: entry.dashAttempts,
        dashSuccessRate: this.toRate(entry.dashSuccesses, entry.dashAttempts),
        dashCallAttempts: entry.dashCallAttempts,
        dashCallSuccessRate: this.toRate(entry.dashCallSuccesses, entry.dashCallAttempts),
        riskAttempts: entry.riskAttempts,
        riskSuccessRate: this.toRate(entry.riskSuccesses, entry.riskAttempts),
        doubleRiskAttempts: entry.doubleRiskAttempts,
        doubleRiskSuccessRate: this.toRate(entry.doubleRiskSuccesses, entry.doubleRiskAttempts),
        withRounds: entry.withRounds,
        highContractRounds: entry.highContractRounds,
        allLoserRounds: entry.allLoserRounds,
      }));

    const mostConsistentPlayerId = [...players]
      .filter((entry) => entry.roundsPlayed > 0)
      .sort((left, right) => {
        const rateDifference = right.exactBidRate - left.exactBidRate;
        if (rateDifference !== 0) {
          return rateDifference;
        }

        return right.totalScore - left.totalScore;
      })[0]?.playerId;

    return {
      players,
      totalRounds: result.rounds.length,
      validRounds: result.rounds.filter((round) => round.scoreResult?.valid === true).length,
      invalidRounds: result.rounds.filter((round) => round.scoreResult?.valid !== true).length,
      leaderPlayerId: players[0]?.playerId,
      mostConsistentPlayerId,
    };
  }

  private applyPlayerScore(statistics: MutableAnalytics, playerScore: PlayerScoreResult, allLoserRound: boolean): void {
    statistics.totalScore += playerScore.score;
    statistics.roundsPlayed += 1;
    statistics.bestRoundScore = Math.max(statistics.bestRoundScore, playerScore.score);
    statistics.worstRoundScore = Math.min(statistics.worstRoundScore, playerScore.score);

    if (playerScore.status === 'success') {
      statistics.successfulRounds += 1;
    } else if (playerScore.status === 'failed') {
      statistics.failedRounds += 1;
    }

    if (playerScore.riskType === 'dash') {
      statistics.dashAttempts += 1;
      if (playerScore.didMatchBid) {
        statistics.dashSuccesses += 1;
      }
    }

    if (playerScore.riskType === 'dash-call') {
      statistics.dashCallAttempts += 1;
      if (playerScore.didMatchBid) {
        statistics.dashCallSuccesses += 1;
      }
    }

    if (playerScore.isRiskTaker) {
      statistics.riskAttempts += 1;
      if (playerScore.didMatchBid) {
        statistics.riskSuccesses += 1;
      }

      if (playerScore.riskModifier === 20) {
        statistics.doubleRiskAttempts += 1;
        if (playerScore.didMatchBid) {
          statistics.doubleRiskSuccesses += 1;
        }
      }
    }

    if (playerScore.riskType === 'with' || playerScore.role === 'with-player') {
      statistics.withRounds += 1;
    }

    if (playerScore.isHighContract) {
      statistics.highContractRounds += 1;
    }

    if (allLoserRound) {
      statistics.allLoserRounds += 1;
    }
  }

  private createAnalytics(playerId: string, firstSeenIndex: number): MutableAnalytics {
    return {
      playerId,
      totalScore: 0,
      roundsPlayed: 0,
      successfulRounds: 0,
      failedRounds: 0,
      bestRoundScore: Number.NEGATIVE_INFINITY,
      worstRoundScore: Number.POSITIVE_INFINITY,
      dashAttempts: 0,
      dashSuccesses: 0,
      dashCallAttempts: 0,
      dashCallSuccesses: 0,
      riskAttempts: 0,
      riskSuccesses: 0,
      doubleRiskAttempts: 0,
      doubleRiskSuccesses: 0,
      withRounds: 0,
      highContractRounds: 0,
      allLoserRounds: 0,
      firstSeenIndex,
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
