import type { EstimationBid } from '../../domain/bid.js';
import { cardId } from '../../domain/card.js';
import { StandardBidPolicy } from './StandardBidPolicy.js';
import { StandardCardPolicy } from './StandardCardPolicy.js';
import {
  STANDARD_BOT_POLICY_VERSION,
  type BotActionSource,
  type BotAuditReasonCode,
  type BotBidDecision,
  type BotBidObservation,
  type BotCardDecision,
  type BotCardObservation,
  type StandardBotBidResult,
  type StandardBotCardResult,
} from './types.js';

interface CardPolicyPort {
  decide(observation: BotCardObservation): BotCardDecision;
}

interface BidPolicyPort {
  decide(observation: BotBidObservation): BotBidDecision;
}

export interface StandardBotPolicyOptions {
  readonly cardPolicy?: CardPolicyPort;
  readonly bidPolicy?: BidPolicyPort;
  readonly fallbackCardPolicy?: CardPolicyPort;
  readonly clock?: () => number;
  readonly hardLimitMs?: number;
  readonly deadlineExceeded?: () => boolean;
}

class PolicyDeadlineError extends Error {}

export class StandardBotPolicy {
  private readonly cardPolicy: CardPolicyPort;
  private readonly bidPolicy: BidPolicyPort;
  private readonly fallbackCardPolicy: CardPolicyPort;
  private readonly clock: () => number;
  private readonly hardLimitMs: number;
  private readonly deadlineExceeded?: () => boolean;

  constructor(options: StandardBotPolicyOptions = {}) {
    this.cardPolicy = options.cardPolicy ?? new StandardCardPolicy();
    this.bidPolicy = options.bidPolicy ?? new StandardBidPolicy();
    this.fallbackCardPolicy = options.fallbackCardPolicy ?? new StandardCardPolicy();
    this.clock = options.clock ?? Date.now;
    this.hardLimitMs = options.hardLimitMs ?? 5_000;
    this.deadlineExceeded = options.deadlineExceeded;

    if (!Number.isFinite(this.hardLimitMs) || this.hardLimitMs <= 0) {
      throw new Error('Standard bot hard decision limit must be a positive number of milliseconds.');
    }
  }

  decideCard(
    observation: BotCardObservation,
    actionSource: BotActionSource,
  ): StandardBotCardResult {
    const startedAt = this.clock();
    let decision: BotCardDecision;
    let fallbackUsed = false;
    let reasonCode: BotAuditReasonCode;

    try {
      this.assertDeadlineAvailable();
      decision = this.cardPolicy.decide(observation);
      const elapsed = this.elapsedSince(startedAt);
      if (elapsed > this.hardLimitMs || this.deadlineExceeded?.() === true) {
        throw new PolicyDeadlineError('Primary card policy exceeded its deadline.');
      }
      this.assertLegalCardDecision(observation, decision);
      reasonCode = decision.reasonCode;
    } catch (error) {
      fallbackUsed = true;
      reasonCode = error instanceof PolicyDeadlineError
        ? 'POLICY_TIMEOUT_FALLBACK'
        : 'POLICY_ERROR_FALLBACK';
      decision = this.fallbackCardPolicy.decide(observation);
      this.assertLegalCardDecision(observation, decision);
    }

    return {
      decision,
      audit: {
        policyVersion: STANDARD_BOT_POLICY_VERSION,
        actionSource,
        reasonCode,
        legalActionIds: observation.legalCards.map(cardId),
        selectedActionId: cardId(decision.card),
        durationMs: this.elapsedSince(startedAt),
        fallbackUsed,
      },
    };
  }

  decideBid(
    observation: BotBidObservation,
    actionSource: BotActionSource,
  ): StandardBotBidResult {
    const startedAt = this.clock();
    let decision: BotBidDecision;
    let fallbackUsed = false;
    let reasonCode: BotAuditReasonCode = 'EXPECTED_UTILITY_BID';

    try {
      this.assertDeadlineAvailable();
      decision = this.bidPolicy.decide(observation);
      const elapsed = this.elapsedSince(startedAt);
      if (elapsed > this.hardLimitMs || this.deadlineExceeded?.() === true) {
        throw new PolicyDeadlineError('Primary bid policy exceeded its deadline.');
      }
      this.assertLegalBidDecision(observation, decision);
    } catch (error) {
      fallbackUsed = true;
      reasonCode = error instanceof PolicyDeadlineError
        ? 'POLICY_TIMEOUT_FALLBACK'
        : 'POLICY_ERROR_FALLBACK';
      decision = this.fallbackBidDecision(observation);
      this.assertLegalBidDecision(observation, decision);
    }

    return {
      decision,
      audit: {
        policyVersion: STANDARD_BOT_POLICY_VERSION,
        actionSource,
        reasonCode,
        legalActionIds: observation.legalBids.map((bid) => this.bidActionId(bid)),
        selectedActionId: this.bidActionId(decision.bid),
        durationMs: this.elapsedSince(startedAt),
        fallbackUsed,
      },
    };
  }

  private fallbackBidDecision(observation: BotBidObservation): BotBidDecision {
    const bid = observation.legalBids[0];
    if (bid === undefined) {
      throw new Error('Standard bid fallback requires at least one legal bid.');
    }

    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      bid: { ...bid },
      expectedUtility: 0,
      exactMatchProbability: 0,
      evaluatedLegalBids: observation.legalBids.length,
    };
  }

  private assertDeadlineAvailable(): void {
    if (this.deadlineExceeded?.() === true) {
      throw new PolicyDeadlineError('Bot decision deadline was already exceeded.');
    }
  }

  private assertLegalCardDecision(
    observation: BotCardObservation,
    decision: BotCardDecision,
  ): void {
    if (decision.policyVersion !== STANDARD_BOT_POLICY_VERSION) {
      throw new Error('Primary card policy returned an unsupported policy version.');
    }
    const selectedId = cardId(decision.card);
    if (!observation.legalCards.some((card) => cardId(card) === selectedId)) {
      throw new Error('Primary card policy selected a card outside the legal action list.');
    }
  }

  private assertLegalBidDecision(
    observation: BotBidObservation,
    decision: BotBidDecision,
  ): void {
    if (decision.policyVersion !== STANDARD_BOT_POLICY_VERSION) {
      throw new Error('Primary bid policy returned an unsupported policy version.');
    }
    const selectedId = this.bidActionId(decision.bid);
    if (!observation.legalBids.some((bid) => this.bidActionId(bid) === selectedId)) {
      throw new Error('Primary bid policy selected a bid outside the legal action list.');
    }
  }

  private elapsedSince(startedAt: number): number {
    return Math.max(0, this.clock() - startedAt);
  }

  private bidActionId(bid: EstimationBid): string {
    return [
      bid.playerId,
      bid.bidType,
      bid.tricks,
      bid.trumpSuit ?? '',
      bid.withTargetPlayerId ?? '',
    ].join('|');
  }
}
