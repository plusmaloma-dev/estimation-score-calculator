import type { EstimationBid } from '../../domain/bid.js';
import type { Card, ContractSuit } from '../../domain/card.js';
import type {
  CompletedGameplayTrick,
  GameplayCommandRecord,
  GameplayTrickEntry,
  HouseRulesRoundState,
  SeatIndex,
  SeatOrder,
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
  readonly bidOwnerPlayerId?: string;
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

export type BotActionSource =
  | 'permanent-bot'
  | 'disconnect-substitute'
  | 'timeout-assistant';

export type BotAuditReasonCode =
  | BotReasonCode
  | 'EXPECTED_UTILITY_BID'
  | 'POLICY_TIMEOUT_FALLBACK'
  | 'POLICY_ERROR_FALLBACK';

export interface BotDecisionAudit {
  readonly policyVersion: StandardBotPolicyVersion;
  readonly actionSource: BotActionSource;
  readonly reasonCode: BotAuditReasonCode;
  readonly legalActionIds: readonly string[];
  readonly selectedActionId: string;
  readonly durationMs: number;
  readonly fallbackUsed: boolean;
}

export interface StandardBotCardResult {
  readonly decision: BotCardDecision;
  readonly audit: BotDecisionAudit;
}

export interface StandardBotBidResult {
  readonly decision: BotBidDecision;
  readonly audit: BotDecisionAudit;
}

export interface BotSimulationInput {
  readonly gameId: string;
  readonly dealId: string;
  readonly nonce: string;
  readonly seedHex: string;
  readonly firstSeat: SeatIndex;
  readonly roundNumber: number;
  readonly bidOrder: SeatOrder;
  readonly playOrder: SeatOrder;
  readonly bidOwnerSeat: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
}

export interface BotSimulationMetrics {
  readonly exactMatchRate: number;
  readonly meanAbsoluteEstimateError: number;
  readonly averageScore: number;
}

export interface BotSimulationResult {
  readonly finalState: HouseRulesRoundState;
  readonly version: number;
  readonly records: readonly GameplayCommandRecord[];
  readonly decisionAudits: readonly BotDecisionAudit[];
  readonly reasonCounts: Readonly<Record<string, number>>;
  readonly metrics: BotSimulationMetrics;
  readonly rejectedCommandCount: number;
  readonly replayVerified: boolean;
}
