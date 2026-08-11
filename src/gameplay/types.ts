import type { EstimationBid } from '../domain/bid.js';
import type { Card, ContractSuit } from '../domain/card.js';
import type { GameplayRoundScoringResult } from './scoring/RoundScoringPort.js';
import type { GameplayDealAuditRecord } from './session/types.js';

export const SEAT_INDICES = [0, 1, 2, 3] as const;
export type SeatIndex = (typeof SEAT_INDICES)[number];

export interface SeatHand {
  readonly seat: SeatIndex;
  readonly cards: readonly Card[];
}

export type SeatHands = readonly [SeatHand, SeatHand, SeatHand, SeatHand];
export type SeatOrder = readonly [SeatIndex, SeatIndex, SeatIndex, SeatIndex];

export interface GameplayTrickEntry {
  readonly seat: SeatIndex;
  readonly card: Card;
}

export interface FairDealInput {
  readonly gameId: string;
  readonly dealId: string;
  readonly ruleSet: 'HOUSE_RULES_V1';
  readonly nonce: string;
  readonly seedHex: string;
  readonly firstSeat: SeatIndex;
}

export interface FairDealVerificationInput extends FairDealInput {
  readonly commitment: string;
  readonly shuffledDeck: readonly Card[];
  readonly hands: readonly SeatHand[];
}

export interface FairDealResult extends FairDealVerificationInput {
  readonly hands: SeatHands;
}

export interface DealVerificationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** `bidding` remains readable only for pre-migration aggregates; new rounds never emit it. */
export type GameplayRoundPhase = 'auction' | 'estimate' | 'playing' | 'scored' | 'bidding';

export interface GameplaySeatPlayer {
  readonly seat: SeatIndex;
  readonly playerId: string;
}

export type GameplaySeatPlayers = readonly [
  GameplaySeatPlayer,
  GameplaySeatPlayer,
  GameplaySeatPlayer,
  GameplaySeatPlayer,
];

export interface GameplaySessionBootstrapBaseInput {
  readonly tableId: string;
  readonly roundNumber: number;
  readonly seats: GameplaySeatPlayers;
  readonly seedHex: string;
  readonly dealId: string;
  readonly nonce: string;
}

export interface GameplayFirstRoundBootstrapInput extends GameplaySessionBootstrapBaseInput {
  readonly initialization: {
    readonly kind: 'first-round';
  };
}

export interface GameplaySubsequentRoundBootstrapInput extends GameplaySessionBootstrapBaseInput {
  readonly initialization: {
    readonly kind: 'subsequent-round';
    readonly dealerSeat: SeatIndex;
    readonly roundMultiplier: number;
  };
}

export type GameplaySessionBootstrapRequest =
  | GameplayFirstRoundBootstrapInput
  | GameplaySubsequentRoundBootstrapInput;

export interface CompletedGameplayTrick {
  readonly trickNumber: number;
  readonly leaderSeat: SeatIndex;
  readonly entries: readonly GameplayTrickEntry[];
  readonly winnerSeat: SeatIndex;
}

export interface CreateHouseRulesRoundInput {
  readonly roundNumber: number;
  readonly players: GameplaySeatPlayers;
  readonly hands: SeatHands;
  readonly bidOrder: SeatOrder;
  readonly playOrder: SeatOrder;
  /** @deprecated New rounds must supply dealerSeat; retained only for legacy fixtures. */
  readonly bidOwnerSeat?: SeatIndex;
  readonly dealerSeat?: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
  readonly dealAudit?: GameplayDealAuditRecord;
}

export type GameplayAuctionAction =
  | { readonly type: 'pass' }
  | { readonly type: 'contract'; readonly tricks: number; readonly trumpSuit: ContractSuit }
  | { readonly type: 'with'; readonly referenceSeat: SeatIndex };

export interface GameplayAuctionContract {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly tricks: number;
  readonly trumpSuit: ContractSuit;
}

export interface GameplayAuctionHistoryEntry {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly action: GameplayAuctionAction;
  readonly referencedContract?: GameplayAuctionContract;
}

export interface HouseRulesRoundState {
  readonly roundNumber: number;
  readonly phase: GameplayRoundPhase;
  readonly players: GameplaySeatPlayers;
  readonly hands: SeatHands;
  readonly dealerSeat: SeatIndex;
  /** Legacy public order; new logic uses auctionOrder and estimateOrder. */
  readonly bidOrder: SeatOrder;
  readonly auctionOrder: SeatOrder;
  readonly playOrder: SeatOrder;
  readonly bidOwnerSeat?: SeatIndex;
  readonly callerSeat?: SeatIndex;
  readonly trumpSuit?: ContractSuit;
  readonly firstLeadSeat: SeatIndex;
  readonly auctionActiveSeat?: SeatIndex;
  readonly passedAuctionSeats: readonly SeatIndex[];
  readonly consecutiveAuctionPasses: number;
  readonly auctionHistory: readonly GameplayAuctionHistoryEntry[];
  readonly currentHighestContract?: GameplayAuctionContract;
  readonly estimateOrder: readonly SeatIndex[];
  readonly currentEstimateIndex: number;
  readonly allPassAuction: boolean;
  /** @deprecated New logic uses currentEstimateIndex. */
  readonly currentBidIndex: number;
  readonly currentTurnSeat?: SeatIndex;
  readonly bids: readonly EstimationBid[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly actualTricksBySeat: readonly [number, number, number, number];
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
  readonly scoreResult?: GameplayRoundScoringResult;
  readonly dealAudit?: GameplayDealAuditRecord;
}

export interface GameplayStateTransition {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: HouseRulesRoundState;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type GameplayCommand =
  | {
      readonly type: 'SUBMIT_AUCTION_ACTION';
      readonly seat: SeatIndex;
      readonly action: GameplayAuctionAction;
    }
  | {
      readonly type: 'SUBMIT_BID';
      readonly seat: SeatIndex;
      readonly bid: EstimationBid;
    }
  | {
      readonly type: 'PLAY_CARD';
      readonly seat: SeatIndex;
      readonly card: Card;
    };

export interface GameplayCommandEnvelope {
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly command: GameplayCommand;
}

export interface GameplayCommandRecord extends GameplayCommandEnvelope {
  readonly accepted: boolean;
  readonly resultingVersion: number;
  readonly errors: readonly string[];
  readonly transition: GameplayStateTransition;
}

export interface GameplayCommandProcessResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicate: boolean;
  readonly state: HouseRulesRoundState;
  readonly version: number;
  readonly records: readonly GameplayCommandRecord[];
  readonly record?: GameplayCommandRecord;
}

export interface GameplayReplayResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: HouseRulesRoundState;
  readonly version: number;
}
