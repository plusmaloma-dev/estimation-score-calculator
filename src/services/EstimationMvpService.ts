import type { BidValidationMode, EstimationBid, RoundBidValidationResult } from '../domain/bid.js';
import type {
  AllLoserCarryMetadata,
  PlayerRoundActualResult,
  RoundScoreResult,
  ScoringProfile,
} from '../scoring/types.js';
import type { ScoringRuleSetId } from '../scoring/ruleSets.js';
import { FEDERATION_2026, HOUSE_RULES_V1, resolveScoringRuleSetId } from '../scoring/ruleSets.js';
import { houseRulesV1ScoringProfile } from '../scoring/houseRulesV1Profile.js';
import { ScoringStrategyFactory } from '../scoring/ScoringStrategyFactory.js';
import { BidValidationService } from './BidValidationService.js';
import { LeaderboardService, type LeaderboardEntry } from './LeaderboardService.js';
import { ScoreCalculationService } from '../scoring/ScoreCalculationService.js';

export interface MvpRoundInput {
  readonly roundNumber: number;
  readonly bids: readonly EstimationBid[];
  readonly actualResults: readonly PlayerRoundActualResult[];
  readonly profile: ScoringProfile;
  readonly ruleSet?: ScoringRuleSetId;
  readonly bidValidationMode?: BidValidationMode;
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
  readonly riskPlayerId?: string;
  readonly bidOwnerPlayerId?: string;
}

export interface MvpRoundResult extends AllLoserCarryMetadata {
  readonly roundNumber: number;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly bidValidation: RoundBidValidationResult;
  readonly scoreResult?: RoundScoreResult;
}

export interface MvpGameInput {
  readonly rounds: readonly MvpRoundInput[];
  readonly playerOrder?: readonly string[];
  readonly ruleSet?: ScoringRuleSetId;
}

export interface MvpGameResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly ruleSet: ScoringRuleSetId;
  readonly rounds: readonly MvpRoundResult[];
  readonly leaderboard: readonly LeaderboardEntry[];
}

const defaultCarryMetadata: AllLoserCarryMetadata = {
  isAllLoserRound: false,
  consecutiveAllLoserCountBeforeRound: 0,
  carriedAllLoserMultiplier: 1,
  carryConsumed: false,
};

export class EstimationMvpService {
  constructor(
    private readonly bidValidationService = new BidValidationService(),
    private readonly scoreCalculationService = new ScoreCalculationService(),
    private readonly leaderboardService = new LeaderboardService(),
    private readonly scoringStrategyFactory = new ScoringStrategyFactory(),
  ) {}

  validateBids(
    bids: readonly EstimationBid[],
    options: { readonly mode?: BidValidationMode; readonly bidOwnerPlayerId?: string } = {},
  ): RoundBidValidationResult {
    return this.bidValidationService.validateRoundBids(bids, {
      playerCount: 4,
      cardsPerPlayer: 13,
      mode: options.mode,
      bidOwnerPlayerId: options.bidOwnerPlayerId,
    });
  }

  calculateRound(input: MvpRoundInput): MvpRoundResult {
    const validationMode = input.bidValidationMode ?? this.inferBidValidationMode(input.bids, input.bidOwnerPlayerId);
    const bidValidation = this.validateBids(input.bids, {
      mode: validationMode,
      bidOwnerPlayerId: input.bidOwnerPlayerId,
    });
    if (!bidValidation.valid || bidValidation.roundType === undefined) {
      return {
        roundNumber: input.roundNumber,
        valid: false,
        errors: bidValidation.errors,
        bidValidation,
        ...defaultCarryMetadata,
      };
    }

    const explicitRuleSet = input.ruleSet ?? input.profile.ruleSet;
    const profile = this.resolveScoringProfile(input.profile, explicitRuleSet);
    const scoreCalculationService = explicitRuleSet === undefined
      ? this.scoreCalculationService
      : new ScoreCalculationService(this.scoringStrategyFactory.create({ ruleSet: explicitRuleSet }));

    const scoreResult = scoreCalculationService.calculateRoundScore({
      roundNumber: input.roundNumber,
      roundType: bidValidation.roundType,
      roundMultiplier: input.roundMultiplier,
      multipleWithMultiplier: input.multipleWithMultiplier,
      riskPlayerId: input.riskPlayerId,
      bidOwnerPlayerId: input.bidOwnerPlayerId,
      winningContractNumber: this.resolveWinningContractNumber(input.bids, input.bidOwnerPlayerId),
      trumpSuit: this.resolveTrumpSuit(input.bids, input.bidOwnerPlayerId),
      bids: input.bids,
      actualResults: input.actualResults,
      profile,
    });

    return {
      roundNumber: input.roundNumber,
      valid: scoreResult.valid,
      errors: scoreResult.errors,
      bidValidation,
      scoreResult,
      ...defaultCarryMetadata,
    };
  }

  calculateGame(input: MvpGameInput): MvpGameResult {
    const ruleSet = resolveScoringRuleSetId(input.ruleSet);
    const rounds: MvpRoundResult[] = [];
    let consecutiveAllLoserCount = 0;

    for (const roundInput of input.rounds) {
      const calculated = this.calculateRound(
        input.ruleSet === undefined ? roundInput : { ...roundInput, ruleSet },
      );

      if (!calculated.valid || calculated.scoreResult === undefined) {
        rounds.push(calculated);
        continue;
      }

      const applied = this.applyAllLoserCarry(calculated, consecutiveAllLoserCount);
      rounds.push(applied);

      if (applied.isAllLoserRound) {
        consecutiveAllLoserCount += 1;
      } else {
        consecutiveAllLoserCount = 0;
      }
    }

    const errors = rounds.flatMap((round, index) =>
      round.errors.map((error) => `Round ${input.rounds[index]?.roundNumber ?? index + 1}: ${error}`),
    );
    const validScoredRounds = rounds.filter(
      (round): round is MvpRoundResult & { readonly scoreResult: RoundScoreResult } =>
        round.scoreResult !== undefined && round.scoreResult.valid,
    );

    const leaderboard = this.leaderboardService.aggregate(
      validScoredRounds.map((round) => ({
        roundNumber: round.roundNumber,
        playerScores: round.scoreResult.playerScores,
      })),
      { playerOrder: input.playerOrder },
    );

    return {
      valid: errors.length === 0,
      errors,
      ruleSet,
      rounds,
      leaderboard,
    };
  }

  private isAllLoserRound(round: MvpRoundResult): boolean {
    return round.valid
      && round.scoreResult !== undefined
      && round.scoreResult.playerScores.length === 4
      && round.scoreResult.playerScores.every((score) => score.status === 'failed');
  }

  private applyAllLoserCarry(
    round: MvpRoundResult,
    consecutiveAllLoserCountBeforeRound: number,
  ): MvpRoundResult {
    const scoreResult = round.scoreResult;
    if (scoreResult === undefined) return round;

    if (this.isAllLoserRound(round)) {
      return {
        ...round,
        isAllLoserRound: true,
        consecutiveAllLoserCountBeforeRound,
        carriedAllLoserMultiplier: 1,
        carryConsumed: false,
        scoreResult: {
          ...scoreResult,
          playerScores: scoreResult.playerScores.map((score) => ({
            ...score,
            score: 0,
            notes: [...score.notes, 'All-loser round skipped: no score applied.'],
          })),
        },
      };
    }

    const carriedAllLoserMultiplier = consecutiveAllLoserCountBeforeRound === 0
      ? 1
      : consecutiveAllLoserCountBeforeRound * 2;

    return {
      ...round,
      isAllLoserRound: false,
      consecutiveAllLoserCountBeforeRound,
      carriedAllLoserMultiplier,
      carryConsumed: carriedAllLoserMultiplier > 1,
      scoreResult: {
        ...scoreResult,
        playerScores: scoreResult.playerScores.map((score) => ({
          ...score,
          score: score.score * carriedAllLoserMultiplier,
          notes: carriedAllLoserMultiplier > 1
            ? [...score.notes, `All-loser carry multiplier applied: x${carriedAllLoserMultiplier}.`]
            : score.notes,
        })),
      },
    };
  }

  private inferBidValidationMode(
    bids: readonly EstimationBid[],
    bidOwnerPlayerId: string | undefined,
  ): BidValidationMode {
    if (bidOwnerPlayerId === undefined) return 'auction-calls';
    if (bids.some((bid) => bid.bidType === 'hold')) return 'round-estimates';

    const hasPlayerEstimateBelowAuctionMinimum = bids.some(
      (bid) => (bid.bidType === 'normal' || bid.bidType === 'with') && bid.tricks < 4,
    );
    const hasNonOwnerEstimateWithoutTrump = bids.some(
      (bid) => bid.playerId !== bidOwnerPlayerId
        && (bid.bidType === 'normal' || bid.bidType === 'with')
        && bid.trumpSuit === undefined,
    );

    return hasPlayerEstimateBelowAuctionMinimum || hasNonOwnerEstimateWithoutTrump
      ? 'round-estimates'
      : 'auction-calls';
  }

  private resolveScoringProfile(profile: ScoringProfile, ruleSet: ScoringRuleSetId | undefined): ScoringProfile {
    if (ruleSet === HOUSE_RULES_V1) {
      return houseRulesV1ScoringProfile;
    }

    if (ruleSet === FEDERATION_2026) {
      return {
        ...profile,
        ruleSet: FEDERATION_2026,
        highContractThreshold: profile.highContractThreshold ?? 8,
      };
    }

    return profile;
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
