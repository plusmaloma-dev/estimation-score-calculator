import type {
  PlayerRoundActualResult,
  PlayerRoundEvaluation,
  OwnerRoundOutcome,
  RoundScoreInput,
  RoundScoreResult,
  ScoringStrategy,
} from './types.js';
import type { EstimationBid } from '../domain/bid.js';
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

    const evaluationsByPlayer = new Map<string, PlayerRoundEvaluation>();
    for (const bid of input.bids) {
      const actualResult = actualResultsByPlayer.get(bid.playerId);
      if (actualResult === undefined) {
        continue;
      }

      evaluationsByPlayer.set(bid.playerId, this.evaluatePlayerRound(bid, actualResult, input));
    }

    const ownerOutcome = this.resolveOwnerOutcome(input.bidOwnerPlayerId, evaluationsByPlayer);

    for (const bid of input.bids) {
      const actualResult = actualResultsByPlayer.get(bid.playerId);
      if (actualResult === undefined) {
        errors.push(`Missing actual result for player ${bid.playerId}.`);
        continue;
      }

      const evaluation = evaluationsByPlayer.get(bid.playerId) ?? this.evaluatePlayerRound(bid, actualResult, input);

      playerScores.push(
        this.strategy.calculatePlayerScore({
          roundNumber: input.roundNumber,
          roundType: input.roundType,
          winningContractNumber: input.winningContractNumber,
          bidOwnerPlayerId: input.bidOwnerPlayerId,
          ownerOutcome,
          trumpSuit: input.trumpSuit,
          playerBid: bid,
          actualResult,
          evaluation,
          profile: input.profile,
        }),
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      ownerOutcome,
      playerScores,
    };
  }

  private evaluatePlayerRound(
    bid: EstimationBid,
    actualResult: PlayerRoundActualResult,
    input: RoundScoreInput,
  ): PlayerRoundEvaluation {
    const delta = Math.abs(actualResult.actualTricks - bid.tricks);
    const didMatchBid = delta === 0;
    const highContractThreshold = input.profile.highContractThreshold ?? Number.POSITIVE_INFINITY;

    return {
      playerId: bid.playerId,
      bidTricks: bid.tricks,
      actualTricks: actualResult.actualTricks,
      delta,
      didMatchBid,
      role: this.resolveRole(bid, input.bidOwnerPlayerId),
      riskType: this.resolveRiskType(bid, highContractThreshold),
    };
  }

  private resolveOwnerOutcome(
    bidOwnerPlayerId: string | undefined,
    evaluationsByPlayer: ReadonlyMap<string, PlayerRoundEvaluation>,
  ): OwnerRoundOutcome | undefined {
    if (bidOwnerPlayerId === undefined) {
      return undefined;
    }

    const ownerEvaluation = evaluationsByPlayer.get(bidOwnerPlayerId);
    if (ownerEvaluation === undefined) {
      return undefined;
    }

    return ownerEvaluation.didMatchBid ? 'owner-won' : 'owner-lost';
  }

  private resolveRole(bid: EstimationBid, bidOwnerPlayerId: string | undefined): PlayerRoundEvaluation['role'] {
    if (bid.playerId === bidOwnerPlayerId) {
      return 'bid-owner';
    }

    if (bid.bidType === 'with') {
      return 'with-player';
    }

    if (bid.bidType === 'dash' || bid.bidType === 'dash-call') {
      return 'risk-taker';
    }

    return 'other-player';
  }

  private resolveRiskType(bid: EstimationBid, highContractThreshold: number): PlayerRoundEvaluation['riskType'] {
    if (bid.bidType === 'dash') {
      return 'dash';
    }

    if (bid.bidType === 'dash-call') {
      return 'dash-call';
    }

    if (bid.bidType === 'with') {
      return 'with';
    }

    if (bid.tricks >= highContractThreshold) {
      return 'high-contract';
    }

    return 'none';
  }
}
