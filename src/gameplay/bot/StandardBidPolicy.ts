import type { EstimationBid } from '../../domain/bid.js';
import type { ContractSuit } from '../../domain/card.js';
import { ConfigurableScoringStrategy } from '../../scoring/ConfigurableScoringStrategy.js';
import { houseRulesV1ScoringProfile } from '../../scoring/houseRulesV1Profile.js';
import type {
  PlayerRoundEvaluation,
  PlayerRoundRole,
  RiskType,
  RoundType,
} from '../../scoring/types.js';
import { BidValidationService } from '../../services/BidValidationService.js';
import { HandStrengthEvaluator } from './HandStrengthEvaluator.js';
import {
  STANDARD_BOT_POLICY_VERSION,
  type BotBidDecision,
  type BotBidObservation,
  type TrickProbability,
} from './types.js';

interface EvaluatedBid {
  readonly bid: EstimationBid;
  readonly expectedUtility: number;
  readonly exactMatchProbability: number;
}

export class StandardBidPolicy {
  constructor(
    private readonly handStrengthEvaluator = new HandStrengthEvaluator(),
    private readonly scoringStrategy = new ConfigurableScoringStrategy(),
    private readonly bidValidationService = new BidValidationService(),
  ) {}

  decide(observation: BotBidObservation): BotBidDecision {
    this.validateObservation(observation);

    const evaluated = observation.legalBids
      .map((bid) => this.evaluateBid(observation, bid))
      .sort((left, right) => this.compareEvaluatedBids(left, right));
    const selected = evaluated[0]!;

    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      bid: selected.bid,
      expectedUtility: selected.expectedUtility,
      exactMatchProbability: selected.exactMatchProbability,
      evaluatedLegalBids: evaluated.length,
    };
  }

  private validateObservation(observation: BotBidObservation): void {
    if (observation.policyVersion !== STANDARD_BOT_POLICY_VERSION) {
      throw new Error(`Unsupported Standard bot policy version: ${observation.policyVersion}.`);
    }
    if (!observation.playerId.trim()) {
      throw new Error('Standard bid policy requires a player id.');
    }
    if (observation.legalBids.length === 0) {
      throw new Error('Standard bid policy requires at least one legal bid.');
    }
    if (observation.legalBids.some((bid) => bid.playerId !== observation.playerId)) {
      throw new Error(`Every legal bid must belong to bot player ${observation.playerId}.`);
    }

    const priorPlayerIds = observation.priorBids.map((bid) => bid.playerId);
    if (new Set(priorPlayerIds).size !== priorPlayerIds.length) {
      throw new Error('Prior public bids must contain unique player ids.');
    }
    if (priorPlayerIds.includes(observation.playerId)) {
      throw new Error(`Bot player ${observation.playerId} already has a prior public bid.`);
    }

    for (const bid of observation.legalBids) {
      const validation = this.bidValidationService.validateBid(bid, {
        playerCount: 4,
        cardsPerPlayer: 13,
        mode: observation.bidOwnerPlayerId === undefined ? 'round-estimates-no-owner' : 'resolved-contract-estimates',
        ...(observation.bidOwnerPlayerId === undefined ? {} : { bidOwnerPlayerId: observation.bidOwnerPlayerId }),
      });
      if (!validation.valid) {
        throw new Error(`Supplied legal bid is invalid: ${validation.errors.join(' ')}`);
      }

      if (observation.isLastBidder) {
        const projectedTotal = this.projectedTotal(observation, bid);
        if (projectedTotal === 13) {
          throw new Error('The supplied legal bid list contains a final estimate that makes total estimates equal 13.');
        }
      }

      this.resolveContractSuit(observation, bid);
    }

    for (const [playerId, score] of Object.entries(observation.currentScores)) {
      if (!playerId.trim() || !Number.isFinite(score)) {
        throw new Error('Current bot score entries require a player id and finite score.');
      }
    }
  }

  private evaluateBid(
    observation: BotBidObservation,
    bid: EstimationBid,
  ): EvaluatedBid {
    const contractSuit = this.resolveContractSuit(observation, bid);
    const distribution = this.handStrengthEvaluator.evaluate(observation.hand, contractSuit);
    const expectedUtility = distribution.reduce((total, outcome) => (
      total + outcome.probability * this.scoreOutcome(observation, bid, contractSuit, outcome)
    ), 0);
    const exactMatchProbability = distribution.find(
      (outcome) => outcome.tricks === bid.tricks,
    )?.probability ?? 0;

    return {
      bid,
      expectedUtility,
      exactMatchProbability,
    };
  }

  private scoreOutcome(
    observation: BotBidObservation,
    bid: EstimationBid,
    contractSuit: ContractSuit,
    outcome: TrickProbability,
  ): number {
    const projectedTotal = this.projectedTotal(observation, bid);
    const roundType: RoundType = projectedTotal > 13 ? 'over' : 'under';
    const roundRiskLevel = Math.abs(projectedTotal - 13);
    const riskModifier = observation.isLastBidder
      ? this.resolveRiskModifier(roundRiskLevel)
      : 0;
    const delta = Math.abs(outcome.tricks - bid.tricks);
    const didMatchBid = delta === 0;
    const highContractThreshold = houseRulesV1ScoringProfile.highContractThreshold;
    const isHighContract = bid.tricks >= highContractThreshold;
    const baseRole = this.resolveBaseRole(observation, bid);
    const isRiskTaker = riskModifier > 0;
    const role: PlayerRoundRole = isRiskTaker && baseRole === 'other-player'
      ? 'risk-taker'
      : baseRole;
    const evaluation: PlayerRoundEvaluation = {
      playerId: bid.playerId,
      bidTricks: bid.tricks,
      actualTricks: outcome.tricks,
      delta,
      didMatchBid,
      role,
      riskType: this.resolveRiskType(bid, isRiskTaker, isHighContract),
      isRiskTaker,
      riskModifier,
      isHighContract,
      isOnlyWinner: false,
      isOnlyLoser: false,
    };
    const ownerBid = bid.playerId === observation.bidOwnerPlayerId
      ? bid
      : observation.priorBids.find((priorBid) => priorBid.playerId === observation.bidOwnerPlayerId);

    return this.scoringStrategy.calculatePlayerScore({
      roundNumber: 1,
      roundType,
      roundRiskLevel,
      winningContractNumber: ownerBid?.tricks,
      ...(observation.bidOwnerPlayerId === undefined ? {} : { bidOwnerPlayerId: observation.bidOwnerPlayerId }),
      ownerOutcome: bid.playerId === observation.bidOwnerPlayerId
        ? (didMatchBid ? 'owner-won' : 'owner-lost')
        : undefined,
      trumpSuit: contractSuit,
      playerBid: bid,
      actualResult: {
        playerId: bid.playerId,
        actualTricks: outcome.tricks,
      },
      evaluation,
      profile: houseRulesV1ScoringProfile,
    }).score;
  }

  private resolveContractSuit(
    observation: BotBidObservation,
    bid: EstimationBid,
  ): ContractSuit {
    if (observation.bidOwnerPlayerId === undefined) return 'no-trump';
    if (bid.playerId === observation.bidOwnerPlayerId) {
      if (bid.trumpSuit === undefined) {
        throw new Error('A legal bid-owner action must include its contract suit.');
      }
      return bid.trumpSuit;
    }

    const ownerBid = observation.priorBids.find(
      (priorBid) => priorBid.playerId === observation.bidOwnerPlayerId,
    );
    if (ownerBid?.trumpSuit === undefined) {
      throw new Error(`Bid owner ${observation.bidOwnerPlayerId} must have a public contract suit before another player is evaluated.`);
    }
    return ownerBid.trumpSuit;
  }

  private projectedTotal(observation: BotBidObservation, bid: EstimationBid): number {
    return observation.priorBids.reduce((total, priorBid) => total + priorBid.tricks, 0) + bid.tricks;
  }

  private resolveRiskModifier(roundRiskLevel: number): number {
    if (roundRiskLevel >= 4) return 20;
    if (roundRiskLevel >= 2) return 10;
    return 0;
  }

  private resolveBaseRole(
    observation: BotBidObservation,
    bid: EstimationBid,
  ): PlayerRoundRole {
    if (bid.playerId === observation.bidOwnerPlayerId) return 'bid-owner';
    if (bid.bidType === 'with') return 'with-player';
    return 'other-player';
  }

  private resolveRiskType(
    bid: EstimationBid,
    isRiskTaker: boolean,
    isHighContract: boolean,
  ): RiskType {
    if (isRiskTaker) return 'round-risk';
    if (bid.bidType === 'dash') return 'dash';
    if (bid.bidType === 'dash-call') return 'dash-call';
    if (bid.bidType === 'with') return 'with';
    if (isHighContract) return 'high-contract';
    return 'none';
  }

  private compareEvaluatedBids(left: EvaluatedBid, right: EvaluatedBid): number {
    const utilityDifference = right.expectedUtility - left.expectedUtility;
    if (Math.abs(utilityDifference) > 1e-12) return utilityDifference;

    const exactDifference = right.exactMatchProbability - left.exactMatchProbability;
    if (Math.abs(exactDifference) > 1e-12) return exactDifference;

    if (left.bid.tricks !== right.bid.tricks) {
      return left.bid.tricks - right.bid.tricks;
    }

    return this.stableBidKey(left.bid).localeCompare(this.stableBidKey(right.bid));
  }

  private stableBidKey(bid: EstimationBid): string {
    return [
      bid.playerId,
      bid.bidType,
      bid.tricks,
      bid.trumpSuit ?? '',
      bid.withTargetPlayerId ?? '',
    ].join('|');
  }
}
