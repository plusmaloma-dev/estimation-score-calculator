export interface LeaderboardRoundScore {
  readonly roundNumber?: number;
  readonly playerScores: readonly LeaderboardPlayerRoundScore[];
}

export interface LeaderboardPlayerRoundScore {
  readonly playerId: string;
  readonly score: number;
}

export interface LeaderboardEntry {
  readonly playerId: string;
  readonly totalScore: number;
  readonly roundsPlayed: number;
  readonly rank: number;
}

export interface LeaderboardOptions {
  readonly playerOrder?: readonly string[];
}

interface MutableLeaderboardEntry {
  playerId: string;
  totalScore: number;
  roundsPlayed: number;
  firstSeenIndex: number;
}

export class LeaderboardService {
  aggregate(
    rounds: readonly LeaderboardRoundScore[],
    options: LeaderboardOptions = {},
  ): readonly LeaderboardEntry[] {
    const entriesByPlayer = new Map<string, MutableLeaderboardEntry>();
    const preferredOrder = new Map<string, number>();

    options.playerOrder?.forEach((playerId, index) => {
      const trimmedPlayerId = playerId.trim();
      if (trimmedPlayerId.length > 0 && !preferredOrder.has(trimmedPlayerId)) {
        preferredOrder.set(trimmedPlayerId, index);
      }
    });

    let firstSeenCounter = 0;
    for (const round of rounds) {
      const playersSeenInRound = new Set<string>();

      for (const playerScore of round.playerScores) {
        const playerId = playerScore.playerId.trim();
        if (playerId.length === 0) {
          throw new Error('Leaderboard player id is required.');
        }

        if (!Number.isFinite(playerScore.score)) {
          throw new Error(`Leaderboard score for player ${playerId} must be a finite number.`);
        }

        if (playersSeenInRound.has(playerId)) {
          throw new Error(`Player ${playerId} cannot appear more than once in the same round leaderboard input.`);
        }
        playersSeenInRound.add(playerId);

        const existingEntry = entriesByPlayer.get(playerId);
        if (existingEntry === undefined) {
          entriesByPlayer.set(playerId, {
            playerId,
            totalScore: playerScore.score,
            roundsPlayed: 1,
            firstSeenIndex: preferredOrder.get(playerId) ?? firstSeenCounter,
          });
          firstSeenCounter += 1;
        } else {
          existingEntry.totalScore += playerScore.score;
          existingEntry.roundsPlayed += 1;
        }
      }
    }

    const sortedEntries = Array.from(entriesByPlayer.values()).sort((left, right) => {
      const scoreDifference = right.totalScore - left.totalScore;
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.firstSeenIndex - right.firstSeenIndex;
    });

    return sortedEntries.map((entry, index) => ({
      playerId: entry.playerId,
      totalScore: entry.totalScore,
      roundsPlayed: entry.roundsPlayed,
      rank: index + 1,
    }));
  }
}
