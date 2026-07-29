import type { Card } from '../domain/card.js';
import { HouseRulesRoundEngine } from './HouseRulesRoundEngine.js';
import type {
  CompletedGameplayTrick,
  GameplayTrickEntry,
  HouseRulesRoundState,
  SeatIndex,
} from './types.js';
import type {
  OnlineGameplayRoundPlayer,
  OnlineGameplayRoundSnapshot,
} from '../online/gameplay/roundTypes.js';

const NORMAL_ESTIMATES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export class GameplayRoundSnapshotProjector {
  constructor(private readonly roundEngine = new HouseRulesRoundEngine()) {}

  project(
    tableId: string,
    state: HouseRulesRoundState,
    version: number,
    viewerSeat: SeatIndex,
  ): OnlineGameplayRoundSnapshot {
    if (!tableId.trim()) throw new Error('Gameplay table ID is required.');
    if (!Number.isInteger(version) || version < 0) {
      throw new Error('Gameplay round version must be a non-negative integer.');
    }

    const nextBidSeat = state.phase === 'bidding'
      ? state.bidOrder[state.currentBidIndex]
      : undefined;
    const players: OnlineGameplayRoundPlayer[] = state.players.map(({ seat, playerId }) => {
      const playerBid = state.bids.find((bid) => bid.playerId === playerId);
      return {
        seat,
        playerId,
        cardCount: state.hands[seat].cards.length,
        ...(playerBid === undefined ? {} : { bid: { ...playerBid } }),
        actualTricks: state.actualTricksBySeat[seat],
      };
    });

    const currentTrick = state.currentTrick.map((entry) => this.copyEntry(entry));
    const completedTricks = state.completedTricks.map((trick) => this.copyCompletedTrick(trick));
    const legalNormalEstimates = nextBidSeat === viewerSeat
      ? this.legalNormalEstimates(state)
      : [];
    const legalCards = state.phase === 'playing' && state.currentTurnSeat === viewerSeat
      ? this.roundEngine.legalCards(state, viewerSeat).map((card) => this.copyCard(card))
      : [];

    return {
      tableId: tableId.trim(),
      roundNumber: state.roundNumber,
      phase: state.phase,
      version,
      viewerSeat,
      bidOwnerSeat: state.bidOwnerSeat,
      riskSeat: state.bidOrder[3],
      ...(state.dealAudit === undefined ? {} : { dealCommitment: state.dealAudit.commitment }),
      ...(nextBidSeat === undefined ? {} : { nextBidSeat }),
      ...(state.currentTurnSeat === undefined ? {} : { currentTurnSeat: state.currentTurnSeat }),
      players,
      ownHand: state.hands[viewerSeat].cards.map((card) => this.copyCard(card)),
      legalNormalEstimates,
      legalCards,
      currentTrick,
      completedTricks,
      ...(state.scoreResult === undefined ? {} : { scoreResult: state.scoreResult }),
    };
  }

  private legalNormalEstimates(state: HouseRulesRoundState): readonly number[] {
    if (state.phase !== 'bidding') return [];
    if (state.currentBidIndex !== 3) return [...NORMAL_ESTIMATES];

    const currentTotal = state.bids.reduce((total, bid) => total + bid.tricks, 0);
    const prohibitedEstimate = 13 - currentTotal;
    return NORMAL_ESTIMATES.filter((estimate) => estimate !== prohibitedEstimate);
  }

  private copyCard(card: Card): Card {
    return { suit: card.suit, rank: card.rank };
  }

  private copyEntry(entry: GameplayTrickEntry): GameplayTrickEntry {
    return { seat: entry.seat, card: this.copyCard(entry.card) };
  }

  private copyCompletedTrick(trick: CompletedGameplayTrick): CompletedGameplayTrick {
    return {
      trickNumber: trick.trickNumber,
      leaderSeat: trick.leaderSeat,
      entries: trick.entries.map((entry) => this.copyEntry(entry)),
      winnerSeat: trick.winnerSeat,
    };
  }
}
