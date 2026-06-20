import type { EstimationBid, RoundBidValidationResult } from '../domain/bid.js';
import type { PlayerRoundActualResult, RoundScoreResult, ScoringProfile } from '../scoring/types.js';
import { BidValidationService } from './BidValidationService.js';
import { LeaderboardService, type LeaderboardEntry } from './LeaderboardService.js';
import { ScoreCalculationService } from '../scoring/ScoreCalculationService.js';

export interface MvpRoundInput {
  readonly roundNumber: number;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly profile: ScoringProfile;
  readonly roundMultiplier?: number;
  readonly riskPlayerId?: string;
  readonly bidOwnerPlayerId?: string;
}

export interface MvpRoundResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly bidValidation: RoundBidValidationResult;
  readonly scoreResult?: RoundScoreResult;
}

export interface MvpGameInput {
  readonly rounds: readonly MvpRoundInput[];
  readonly playerOrder?: readonly string[];
}

export interface MvpGameResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly rounds: readonly MvpRoundResult[];
  readonly leaderboard: readonly LeaderboardEntry[];
}

export class EstimationMvpService {
  constructor(
    private readonly bidValidationService = new BidValidationService(),
    private readonly scoreCalculationService = new ScoreCalculationService(),
    private readonly leaderboardService = new LeaderboardService(),
  ) {}

  validateBids(bids: readonly EstimationBid[]): RoundBidValidationResult {
    return this.bidValidationService.validateRoundBids(bids);
  }

  calculateRound(input: MvpRoundInput): MvpRoundResult {
    const bidValidation = this.validateBids(input.bids);
    if (!bidValidation.valid || bidValidation.roundType === undefined) {
      return {
        valid: false,
        errors: bidValidation.errors,
        bidValidation,
      };
    }

    const scoreResult = this.scoreCalculationService.calculateRoundScore({
      roundNumber: input.roundNumber,
      roundType: bidValidation.roundType,
      roundMultiplier: input.roundMultiplier,
      riskPlayerId: input.riskPlayerId,
      bidOwnerPlayerId: input.bidOwnerPlayerId,
      winningContractNumber: this.resolveWinningContractNumber(input.bids, input.bidOwnerPlayerId),
      trumpSuit: this.resolveTrumpSuit(input.bids, input.bidOwnerPlayerId),
      bids: input.bids,
      actualResults: input.actualResults,
      profile: input.profile,
    });

    return {
      valid: scoreResult.valid,
      errors: scoreResult.errors,
      bidValidation,
      scoreResult,
    };
  }

  calculateGame(input: MvpGameInput): MvpGameResult {
    const rounds = input.rounds.map((round) => this.calculateRound(round));
    const errors = rounds.flatMap((round, index) =>
      round.errors.map((error) => `Round ${input.rounds[index]?.roundNumber ?? index + 1}: ${error}`),
    );
    const validScoredRounds = rounds
      .map((round) => round.scoreResult)
      .filter((round): round is RoundScoreResult => round !== undefined && round.valid);

    const leaderboard = this.leaderboardService.aggregate(
      validScoredRounds.map((round, index) => ({
        roundNumber: input.rounds[index]?.roundNumber,
        playerScores: round.playerScores,
      })),
      { playerOrder: input.playerOrder },
    );

    return {
      valid: errors.length === 0,
      errors,
      rounds,
      leaderboard,
    };
  }

  private resolveWinningContractNumber(
    bids: readonly EstimationBid[],
    bidOwnerPlayerId: string | undefined,
  ): number | undefined {
    return bids.find((bid) => bid.playerId === bidOwnerPlayerId)?.tricks;
  }

  private resolveTrumpSuit(
    bids: readonly EstimationBid[],
    bidOwnerPlayerId: string | undefined,
  ): EstimationBid['trumpSuit'] | undefined {
    return bids.find((bid) => bid.playerId === bidOwnerPlayerId)?.trumpSuit;
  }
}
