import type { Card } from '../domain/card.js';
import { HouseRulesBidOptionsService } from './HouseRulesBidOptionsService.js';
import { HouseRulesRoundEngine } from './HouseRulesRoundEngine.js';
import { TrickResolutionService } from './TrickResolutionService.js';
import type { GameplayRoundScoreHistoryRow } from './scoreHistoryTypes.js';
import type { GameplayRoundSeatControl } from './roundApplicationTypes.js';
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

export class GameplayRoundSnapshotProjector {
  constructor(
    private readonly roundEngine = new HouseRulesRoundEngine(),
    private readonly bidOptionsService = new HouseRulesBidOptionsService(),
    private readonly trickResolutionService = new TrickResolutionService(),
  ) {}

  project(
    tableId: string,
    state: HouseRulesRoundState,
    version: number,
    viewerSeat: SeatIndex,
    options: {
      readonly scoreHistory?: readonly GameplayRoundScoreHistoryRow[];
      readonly seatControls?: readonly GameplayRoundSeatControl[];
    } = {},
  ): OnlineGameplayRoundSnapshot {
    if (!tableId.trim()) throw new Error('Gameplay table ID is required.');
    if (!Number.isInteger(version) || version < 0) {
      throw new Error('Gameplay round version must be a non-negative integer.');
    }

    const nextBidSeat = state.phase === 'auction'
      ? state.auctionActiveSeat
      : state.phase === 'estimate'
        ? state.estimateOrder[state.currentEstimateIndex]
        : undefined;
    const scoreHistory = [...(options.scoreHistory ?? [])]
      .sort((left, right) => left.roundNumber - right.roundNumber)
      .map((row) => ({
        roundNumber: row.roundNumber,
        deltasBySeat: [...row.deltasBySeat] as [number, number, number, number],
      }));
    const cumulativeScoresBySeat = scoreHistory.reduce(
      (totals, row) => row.deltasBySeat.map((delta, seat) => totals[seat]! + delta) as [number, number, number, number],
      [0, 0, 0, 0] as [number, number, number, number],
    );
    const seatControls = options.seatControls ?? [];
    const players: OnlineGameplayRoundPlayer[] = state.players.map(({ seat, playerId }) => {
      const playerBid = state.bids.find((bid) => bid.playerId === playerId);
      const seatControl = seatControls.find((candidate) => candidate.seat === seat);
      return {
        seat,
        playerId,
        ...(seatControl?.displayName === undefined ? {} : { displayName: seatControl.displayName }),
        ...(seatControl?.seatKind === undefined ? {} : { isBot: seatControl.seatKind === 'bot' }),
        cardCount: state.hands[seat].cards.length,
        ...(playerBid === undefined ? {} : { bid: { ...playerBid } }),
        actualTricks: state.actualTricksBySeat[seat],
        cumulativeScore: cumulativeScoresBySeat[seat],
      };
    });

    const currentTrick = state.currentTrick.map((entry) => this.copyEntry(entry));
    const completedTricks = state.completedTricks.map((trick) => this.copyCompletedTrick(trick));
    const legalEstimateOptions = this.bidOptionsService.legalOptions(state, viewerSeat);
    const legalAuctionActions = this.bidOptionsService.legalAuctionActions(state, viewerSeat);
    const legalNormalEstimates = legalEstimateOptions
      .filter((option) => option.bidType === 'normal')
      .map((option) => option.tricks);
    const estimateOptions = state.phase === 'estimate'
      ? Array.from({ length: (state.currentHighestContract?.tricks ?? 12) + 1 }, (_, value) => ({
          value,
          enabled: legalNormalEstimates.includes(value),
          ...(legalNormalEstimates.includes(value) || state.currentEstimateIndex !== state.estimateOrder.length - 1
            ? {}
            : { reason: 'would_total_13' as const }),
        }))
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
      dealerSeat: state.dealerSeat,
      ...(state.bidOwnerSeat === undefined ? {} : { bidOwnerSeat: state.bidOwnerSeat }),
      ...(state.callerSeat === undefined ? {} : { callerSeat: state.callerSeat }),
      ...(state.trumpSuit === undefined ? {} : { trumpSuit: state.trumpSuit }),
      ...(state.estimateOrder.length === 0 ? {} : { riskSeat: state.estimateOrder.at(-1) }),
      ...(state.auctionActiveSeat === undefined ? {} : { auctionActiveSeat: state.auctionActiveSeat }),
      passedAuctionSeats: [...state.passedAuctionSeats],
      consecutiveAuctionPasses: state.consecutiveAuctionPasses,
      auctionHistory: state.auctionHistory.map((entry) => ({
        ...entry,
        action: { ...entry.action },
        ...(entry.referencedContract === undefined ? {} : { referencedContract: { ...entry.referencedContract } }),
      })),
      ...(state.currentHighestContract === undefined ? {} : { currentHighestContract: { ...state.currentHighestContract } }),
      ...(state.dealAudit === undefined ? {} : { dealCommitment: state.dealAudit.commitment }),
      ...(nextBidSeat === undefined ? {} : { nextBidSeat }),
      ...(state.currentTurnSeat === undefined ? {} : { currentTurnSeat: state.currentTurnSeat }),
      players,
      ownHand: state.hands[viewerSeat].cards.map((card) => this.copyCard(card)),
      legalNormalEstimates,
      estimateOptions,
      legalAuctionActions: legalAuctionActions.map((option) => ({ action: { ...option.action } })),
      legalCards,
      currentTrick,
      completedTricks,
      ...(currentTrick.length === 0 || state.trumpSuit === undefined
        ? {}
        : { currentWinningSeat: this.trickResolutionService.resolvePartial(currentTrick, state.trumpSuit) }),
      scoreHistory,
      cumulativeScoresBySeat,
      ...(state.scoreResult === undefined ? {} : { scoreResult: state.scoreResult }),
    };
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
