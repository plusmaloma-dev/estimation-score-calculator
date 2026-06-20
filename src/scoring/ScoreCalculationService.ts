import type {
  PlayerRoundActualResult,
  RoundScoreInput,
  RoundScoreResult,
  ScoringStrategy,
} from './types.js';
import { ConfigurableScoringStrategy } from './ConfigurableScoringStrategy.js';

export class ScoreCalculationService {
  constructor(private readonly strategy: ScoringStrategy = new ConfigurableScoringStrategy()) {}

  calculateRoundScore(input: RoundScoreInput): RoundScoreResult {
    const errors: string[] = [];
    const playerScores = [];

    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
      errors.push('Round number must be a positive integer.');
    }

    if (!['over', 'under'].includes(input.roundType)) {
      errors.push('Round type must be over or under.');
    }

    if (input.bids.length !== 4) {
      errors.push('Exactly 4 bids are required for round scoring.');
    }

    if (input.actualResults.length !== 4) {
      errors.push('Exactly 4 actual result entries are required for round scoring.');
    }

    const actualResultsByPlayer = new Map<string, PlayerRoundActualResult>();
    for (const actualResult of input.actualResults) {
      if (!actualResult.playerId.trim()) {
        errors.push('Actual result player id is required.');
      }

      if (actualResultsByPlayer.has(actualResult.playerId)) {
        errors.push(`Duplicate actual result for player ${actualResult.playerId}.`);
      }

      if (!Number.isInteger(actualResult.actualTricks) || actualResult.actualTricks < 0 || actualResult.actualTricks > 13) {
        errors.push(`Actual tricks for player ${actualResult.playerId} must be an integer between 0 and 13.`);
      }

      actualResultsByPlayer.set(actualResult.playerId, actualResult);
    }

    const totalActualTricks = input.actualResults.reduce((total, result) => total + result.actualTricks, 0);
    if (totalActualTricks !== 13) {
      errors.push('Total actual tricks must equal 13.');
    }

    for (const bid of input.bids) {
      const actualResult = actualResultsByPlayer.get(bid.playerId);
      if (actualResult === undefined) {
        errors.push(`Missing actual result for player ${bid.playerId}.`);
        continue;
      }

      playerScores.push(
        this.strategy.calculatePlayerScore({
          roundNumber: input.roundNumber,
          roundType: input.roundType,
          winningContractNumber: input.winningContractNumber,
          trumpSuit: input.trumpSuit,
          playerBid: bid,
          actualResult,
          profile: input.profile,
        }),
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      playerScores,
    };
  }
}
