import type { EstimationBid } from '../../domain/bid.js';
import type { Card } from '../../domain/card.js';
import type {
  CompletedGameplayTrick,
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

export interface OnlineGameplayRoundSnapshot {
  readonly tableId: string;
  readonly roundNumber: number;
  readonly phase: GameplayRoundPhase;
  readonly version: number;
  readonly viewerSeat: SeatIndex;
  readonly bidOwnerSeat: SeatIndex;
  readonly riskSeat?: SeatIndex;
  readonly dealCommitment?: string;
  readonly nextBidSeat?: SeatIndex;
  readonly currentTurnSeat?: SeatIndex;
  readonly players: readonly OnlineGameplayRoundPlayer[];
  readonly ownHand: readonly Card[];
  readonly legalNormalEstimates: readonly number[];
  readonly legalCards: readonly Card[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly completedTricks: readonly CompletedGameplayTrick[];
  readonly scoreResult?: MvpRoundResult;
}
