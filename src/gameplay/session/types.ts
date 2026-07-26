import type { Card } from '../../domain/card.js';
import type { ActiveTurnActionKind } from '../control/types.js';
import type {
  GameplaySeatPlayers,
  HouseRulesRoundState,
  SeatIndex,
} from '../types.js';

export interface GameplayDealAuditRecord {
  readonly gameId: string;
  readonly dealId: string;
  readonly ruleSet: 'HOUSE_RULES_V1';
  readonly nonce: string;
  readonly seedHex: string;
  readonly firstSeat: SeatIndex;
  readonly dealerSeat: SeatIndex;
  readonly commitment: string;
  readonly shuffledDeck: readonly Card[];
  readonly revealed: boolean;
}

export interface GameplaySessionBootstrapInput {
  readonly tableId: string;
  readonly roundNumber: number;
  readonly seats: GameplaySeatPlayers;
  readonly seedHex: string;
  readonly dealId: string;
  readonly nonce: string;
}

export interface GameplayInitialTurn {
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
}

export interface GameplaySessionBootstrapResult {
  readonly state: HouseRulesRoundState;
  readonly dealerSeat: SeatIndex;
  readonly firstLeadSeat: SeatIndex;
  readonly firstTurn: GameplayInitialTurn;
  readonly dealCommitment: string;
}
