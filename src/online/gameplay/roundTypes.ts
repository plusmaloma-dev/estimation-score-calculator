import type { EstimationBid } from '../../domain/bid.js';
import type { Card, ContractSuit } from '../../domain/card.js';
import type {
  CompletedGameplayTrick,
  GameplayAuctionAction,
  GameplayAuctionContract,
  GameplayAuctionHistoryEntry,
  GameplayRoundPhase,
  GameplayTrickEntry,
  SeatIndex,
} from '../../gameplay/types.js';
import type { MvpRoundResult } from '../../services/EstimationMvpService.js';

export interface OnlineGameplayRoundPlayer {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly cardCount: number;
  readonly bid?: EstimationBid;
  readonly actualTricks: number;
}

export interface OnlineGameplayBidOption {
  readonly tricks: number;
  readonly bidType: 'normal' | 'with';
  readonly requiresContractSuit: boolean;
  readonly legalContractSuits: readonly ContractSuit[];
  readonly withTargetPlayerId?: string;
}

export interface OnlineGameplayAuctionOption {
  readonly action: GameplayAuctionAction;
}

export interface OnlineGameplayRoundSnapshot {
  readonly tableId: string;
  readonly roundNumber: number;
  readonly phase: GameplayRoundPhase;
  readonly version: number;
  readonly viewerSeat: SeatIndex;
  readonly dealerSeat?: SeatIndex;
  readonly bidOwnerSeat?: SeatIndex;
  readonly callerSeat?: SeatIndex;
  readonly trumpSuit?: ContractSuit;
  readonly auctionActiveSeat?: SeatIndex;
  readonly passedAuctionSeats?: readonly SeatIndex[];
  readonly consecutiveAuctionPasses?: number;
  readonly auctionHistory?: readonly GameplayAuctionHistoryEntry[];
  readonly currentHighestContract?: GameplayAuctionContract;
  readonly riskSeat?: SeatIndex;
  readonly dealCommitment?: string;
  readonly nextBidSeat?: SeatIndex;
  readonly currentTurnSeat?: SeatIndex;
  readonly players: readonly OnlineGameplayRoundPlayer[];
  readonly ownHand: readonly Card[];
  readonly legalNormalEstimates: readonly number[];
  readonly legalBidOptions?: readonly OnlineGameplayBidOption[];
  readonly legalAuctionActions?: readonly OnlineGameplayAuctionOption[];
  readonly legalCards: readonly Card[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly scoreResult?: MvpRoundResult;
}
