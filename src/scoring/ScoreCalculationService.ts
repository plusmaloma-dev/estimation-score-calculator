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

    const roundRiskLevel = this.resolveRoundRiskLevel(input);
    const rawEvaluationsByPlayer = new Map<string, Omit<PlayerRoundEvaluation, 'isOnlyWinner' | 'isOnlyLoser'>>();
    for (const bid of input.bids) {
      const actualResult = actualResultsByPlayer.get(bid.playerId);
      if (actualResult === undefined) {
        continue;
      }

      rawEvaluationsByPlayer.set(bid.playerId, this.evaluatePlayerRound(bid, actualResult, input, roundRiskLevel));
    }

    const winnerCount = Array.from(rawEvaluationsByPlayer.values()).filter((evaluation) => evaluation.didMatchBid).length;
    const loserCount = Array.from(rawEvaluationsByPlayer.values()).filter((evaluation) => !evaluation.didMatchBid).length;
    const allPlayersLost = rawEvaluationsByPlayer.size === 4 && loserCount === 4;

    const evaluationsByPlayer = new Map<string, PlayerRoundEvaluation>();
    for (const [playerId, evaluation] of rawEvaluationsByPlayer.entries()) {
      evaluationsByPlayer.set(playerId, {
        ...evaluation,
        isOnlyWinner: evaluation.didMatchBid && winnerCount === 1,
        isOnlyLoser: !evaluation.didMatchBid && loserCount === 1,
      });
    }

    const ownerOutcome = this.resolveOwnerOutcome(input.bidOwnerPlayerId, evaluationsByPlayer);

    if (errors.length === 0 && allPlayersLost) {
      const nextRoundMultiplier = this.resolveNextAllLoserMultiplier(input.roundMultiplier);

      return {
        valid: true,
        errors: [],
        ownerOutcome,
        nextRoundMultiplier,
        playerScores: input.bids.map((bid) => {
          const actualResult = actualResultsByPlayer.get(bid.playerId);
          const evaluation = evaluationsByPlayer.get(bid.playerId);

          return {
            playerId: bid.playerId,
            bidTricks: bid.tricks,
            actualTricks: actualResult?.actualTricks ?? 0,
            delta: evaluation?.delta ?? 0,
            didMatchBid: false,
            role: evaluation?.role ?? this.resolveRole(bid, input.bidOwnerPlayerId),
            riskType: evaluation?.riskType ?? this.resolveRiskType(bid, input.profile.highContractThreshold ?? Number.POSITIVE_INFINITY),
            isRiskTaker: evaluation?.isRiskTaker ?? false,
            riskModifier: evaluation?.riskModifier ?? 0,
            isHighContract: evaluation?.isHighContract ?? false,
            isOnlyWinner: false,
            isOnlyLoser: false,
            status: 'failed',
            score: 0,
            notes: [`All players lost: current round scores are zero and the next round should receive the x${nextRoundMultiplier} multiplier.`],
          };
        }),
      };
    }

    for (const bid of input.bids) {
      const actualResult = actualResultsByPlayer.get(bid.playerId);
      if (actualResult === undefined) {
        errors.push(`Missing actual result for player ${bid.playerId}.`);
        continue;
      }

      const evaluation = evaluationsByPlayer.get(bid.playerId) ?? {
        ...this.evaluatePlayerRound(bid, actualResult, input, roundRiskLevel),
        isOnlyWinner: false,
        isOnlyLoser: false,
      };

      playerScores.push(
        this.strategy.calculatePlayerScore({
          roundNumber: input.roundNumber,
          roundType: input.roundType,
          roundRiskLevel,
          roundMultiplier: input.roundMultiplier,
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
    roundRiskLevel: number,
  ): Omit<PlayerRoundEvaluation, 'isOnlyWinner' | 'isOnlyLoser'> {
    const delta = Math.abs(actualResult.actualTricks - bid.tricks);
    const didMatchBid = delta === 0;
    const highContractThreshold = input.profile.highContractThreshold ?? Number.POSITIVE_INFINITY;
    const isHighContract = bid.tricks >= highContractThreshold;
    const isDashUnderRisk = input.roundType === 'under' && bid.bidType === 'dash' && roundRiskLevel > 0;
    const isSequenceRiskTaker = input.riskPlayerId === bid.playerId && roundRiskLevel > 0;
    const isRiskTaker = isDashUnderRisk || isSequenceRiskTaker;

    return {
      playerId: bid.playerId,
      bidTricks: bid.tricks,
      actualTricks: actualResult.actualTricks,
      delta,
      didMatchBid,
      role: isRiskTaker ? 'risk-taker' : this.resolveRole(bid, input.bidOwnerPlayerId),
      riskType: isRiskTaker ? 'round-risk' : this.resolveRiskType(bid, highContractThreshold),
      isRiskTaker,
      riskModifier: this.resolveRiskModifier(roundRiskLevel),
      isHighContract,
    };
  }

  private resolveRoundRiskLevel(input: RoundScoreInput): number {
    const totalEstimatedTricks = input.bids.reduce((total, bid) => total + bid.tricks, 0);
    return Math.abs(totalEstimatedTricks - 13);
  }

  private resolveRiskModifier(roundRiskLevel: number): number {
    if (roundRiskLevel >= 4) {
      return 20;
    }

    if (roundRiskLevel >= 2) {
      return 10;
    }

    return 0;
  }

  private resolveNextAllLoserMultiplier(currentRoundMultiplier: number | undefined): number {
    return (currentRoundMultiplier ?? 1) * 2;
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
