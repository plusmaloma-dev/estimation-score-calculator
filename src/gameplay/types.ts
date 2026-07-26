import type { EstimationBid } from '../domain/bid.js';
import type { Card } from '../domain/card.js';
import type { MvpRoundResult } from '../services/EstimationMvpService.js';

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

export type GameplayRoundPhase = 'bidding' | 'playing' | 'scored';

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
  readonly bidOwnerSeat: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
}

export interface HouseRulesRoundState {
  readonly roundNumber: number;
  readonly phase: GameplayRoundPhase;
  readonly players: GameplaySeatPlayers;
  readonly hands: SeatHands;
  readonly bidOrder: SeatOrder;
  readonly playOrder: SeatOrder;
  readonly bidOwnerSeat: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
  readonly currentBidIndex: number;
  readonly currentTurnSeat?: SeatIndex;
  readonly bids: readonly EstimationBid[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly actualTricksBySeat: readonly [number, number, number, number];
  readonly roundMultiplier?: number;
  readonly multipleWithMultiplier?: 1 | 2;
  readonly scoreResult?: MvpRoundResult;
}

export interface GameplayStateTransition {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly state: HouseRulesRoundState;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type GameplayCommand =
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
