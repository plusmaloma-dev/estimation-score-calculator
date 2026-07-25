import type { EstimationBid } from '../../domain/bid.js';
import type { Card, ContractSuit } from '../../domain/card.js';
import type {
  CompletedGameplayTrick,
  GameplayTrickEntry,
  SeatIndex,
} from '../types.js';

export const STANDARD_BOT_POLICY_VERSION = 'STANDARD_V1' as const;
export type StandardBotPolicyVersion = typeof STANDARD_BOT_POLICY_VERSION;

export type BotCardMode = 'acquire' | 'control' | 'dump' | 'recovery' | 'endgame';

export type BotReasonCode =
  | 'FOLLOW_SUIT_ONLY_ACTION'
  | 'ACQUIRE_REQUIRED_TRICK'
  | 'CONTROL_EXACT_TARGET'
  | 'AVOID_OVERTRICK'
  | 'MINIMIZE_DAMAGE'
  | 'ENDGAME_EXACT_SEARCH';

export interface BotCardObservation {
  readonly policyVersion: StandardBotPolicyVersion;
  readonly seat: SeatIndex;
  readonly hand: readonly Card[];
  readonly legalCards: readonly Card[];
  readonly bids: readonly EstimationBid[];
  readonly contractSuit: ContractSuit;
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly estimate: number;
  readonly tricksWon: number;
  readonly cardsRemaining: number;
}

export interface BotCardDecision {
  readonly policyVersion: StandardBotPolicyVersion;
  readonly mode: BotCardMode;
  readonly reasonCode: BotReasonCode;
  readonly card: Card;
  readonly legalCardIds: readonly string[];
}

export interface TrickProbability {
  readonly tricks: number;
  readonly probability: number;
}

export interface BotBidObservation {
  readonly policyVersion: StandardBotPolicyVersion;
  readonly playerId: string;
  readonly hand: readonly Card[];
  readonly legalBids: readonly EstimationBid[];
  readonly priorBids: readonly EstimationBid[];
  readonly bidOwnerPlayerId: string;
  readonly isLastBidder: boolean;
  readonly currentScores: Readonly<Record<string, number>>;
}

export interface BotBidDecision {
  readonly policyVersion: StandardBotPolicyVersion;
  readonly bid: EstimationBid;
  readonly expectedUtility: number;
  readonly exactMatchProbability: number;
  readonly evaluatedLegalBids: number;
}
