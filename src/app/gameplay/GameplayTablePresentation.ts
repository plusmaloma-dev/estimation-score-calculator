import type { Card, ContractSuit } from '../../domain/card.js';
import type {
  CompletedGameplayTrick,
  GameplayAuctionHistoryEntry,
  GameplayTrickEntry,
  SeatIndex,
} from '../../gameplay/types.js';
import type { ActiveRoundPresentation } from './ActiveRoundPresentation.js';
import type {
  OnlineGameplayAuctionOption,
  OnlineGameplayEstimateOption,
  OnlineGameplayRoundSnapshot,
} from '../../online/gameplay/roundTypes.js';
import type { GameplayRoundScoreHistoryRow } from '../../gameplay/scoreHistoryTypes.js';

export type GameplayTableSeatPosition = 'bottom' | 'right' | 'top' | 'left';

export interface GameplayTableSeatPresentation {
  readonly seat: SeatIndex;
  readonly position: GameplayTableSeatPosition;
  readonly displayName: string;
  readonly isViewer: boolean;
  readonly isBot: boolean;
  readonly isActive: boolean;
  readonly isDealer: boolean;
  readonly isCaller: boolean;
  readonly isWith: boolean;
  readonly isRisk: boolean;
  readonly bid?: number;
  readonly won: number;
  readonly score: number;
}

export interface GameplayTablePresentation {
  readonly phase: ActiveRoundPresentation['phase'];
  readonly roundNumber?: number;
  readonly dealerSeat?: SeatIndex;
  readonly callerSeat?: SeatIndex;
  readonly trump?: ContractSuit;
  readonly risk?: ActiveRoundPresentation['risk'];
  readonly riskCandidateSeat?: SeatIndex;
  readonly currentHighestContract?: OnlineGameplayRoundSnapshot['currentHighestContract'];
  readonly auctionActiveSeat?: SeatIndex;
  readonly passedAuctionSeats: readonly SeatIndex[];
  readonly consecutiveAuctionPasses: number;
  readonly auctionHistory: readonly GameplayAuctionHistoryEntry[];
  readonly totalEstimatedTricks: number;
  readonly estimateStatus: ActiveRoundPresentation['estimateStatus'];
  readonly estimateDistanceFrom13: number;
  readonly activeSeat?: SeatIndex;
  readonly actionKind?: ActiveRoundPresentation['actionKind'];
  readonly viewerActionRequired: boolean;
  readonly countdownSeconds?: number;
  readonly seats: readonly GameplayTableSeatPresentation[];
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly currentWinningSeat?: SeatIndex;
  readonly leadSuit?: Card['suit'];
  readonly lastCompletedTrick?: CompletedGameplayTrick;
  readonly ownHand: OnlineGameplayRoundSnapshot['ownHand'];
  readonly legalCards: OnlineGameplayRoundSnapshot['legalCards'];
  readonly estimateOptions: readonly OnlineGameplayEstimateOption[];
  readonly legalAuctionActions: readonly OnlineGameplayAuctionOption[];
  readonly scoreHistory: readonly GameplayRoundScoreHistoryRow[];
  readonly cumulativeScoresBySeat: readonly [number, number, number, number];
  readonly isSynchronizing: boolean;
}

const POSITIONS: readonly GameplayTableSeatPosition[] = ['bottom', 'right', 'top', 'left'];

function relativePosition(viewerSeat: SeatIndex, seat: SeatIndex): GameplayTableSeatPosition {
  return POSITIONS[((seat - viewerSeat) + 4) % 4]!;
}

function seatName(
  player: OnlineGameplayRoundSnapshot['players'][number],
  viewerSeat: SeatIndex,
  seatKind: 'human' | 'bot' | undefined,
): string {
  if (player.seat === viewerSeat) return 'You';
  if (seatKind === 'bot' || player.isBot === true) return `Standard Bot ${player.seat + 1}`;
  return player.displayName ?? `Seat ${player.seat + 1}`;
}

function withSeats(snapshot: OnlineGameplayRoundSnapshot): ReadonlySet<SeatIndex> {
  const seats = new Set<SeatIndex>();
  for (const player of snapshot.players) {
    if (player.bid?.bidType === 'with') seats.add(player.seat);
  }
  for (const score of snapshot.scoreResult?.scoreResult?.playerScores ?? []) {
    if (score.role !== 'with-player') continue;
    const player = snapshot.players.find((candidate) => candidate.playerId === score.playerId);
    if (player !== undefined) seats.add(player.seat);
  }
  for (const entry of snapshot.auctionHistory ?? []) {
    if (entry.action.type === 'with') seats.add(entry.seat);
  }
  return seats;
}

export function createGameplayTablePresentation(
  presentation: ActiveRoundPresentation,
  snapshot: OnlineGameplayRoundSnapshot,
): GameplayTablePresentation {
  const viewerSeat = snapshot.viewerSeat;
  const withSeatSet = withSeats(snapshot);
  const scores: readonly [number, number, number, number] = snapshot.cumulativeScoresBySeat ?? [0, 0, 0, 0];
  return {
    phase: presentation.phase,
    ...(presentation.roundNumber === undefined ? {} : { roundNumber: presentation.roundNumber }),
    ...(snapshot.dealerSeat === undefined ? {} : { dealerSeat: snapshot.dealerSeat }),
    ...(snapshot.callerSeat === undefined && snapshot.bidOwnerSeat === undefined
      ? {}
      : { callerSeat: snapshot.callerSeat ?? snapshot.bidOwnerSeat }),
    ...(snapshot.trumpSuit === undefined ? {} : { trump: snapshot.trumpSuit }),
    ...(presentation.risk === undefined ? {} : { risk: presentation.risk }),
    ...(presentation.riskCandidateSeat === undefined ? {} : { riskCandidateSeat: presentation.riskCandidateSeat }),
    ...(snapshot.currentHighestContract === undefined ? {} : { currentHighestContract: snapshot.currentHighestContract }),
    ...(snapshot.auctionActiveSeat === undefined ? {} : { auctionActiveSeat: snapshot.auctionActiveSeat }),
    passedAuctionSeats: [...(snapshot.passedAuctionSeats ?? [])],
    consecutiveAuctionPasses: snapshot.consecutiveAuctionPasses ?? 0,
    auctionHistory: [...(snapshot.auctionHistory ?? [])],
    totalEstimatedTricks: presentation.totalEstimatedTricks,
    estimateStatus: presentation.estimateStatus,
    estimateDistanceFrom13: presentation.estimateDistanceFrom13,
    ...(presentation.activeSeat === undefined ? {} : { activeSeat: presentation.activeSeat }),
    ...(presentation.actionKind === undefined ? {} : { actionKind: presentation.actionKind }),
    viewerActionRequired: presentation.viewerActionRequired,
    ...(presentation.countdownSeconds === undefined ? {} : { countdownSeconds: presentation.countdownSeconds }),
    seats: snapshot.players.map((player) => {
      const seatControl = presentation.seatControls.find((candidate) => candidate.seat === player.seat);
      const isBot = seatControl?.seatKind === 'bot' || player.isBot === true;
      return ({
      seat: player.seat,
      position: relativePosition(viewerSeat, player.seat),
      displayName: seatName(player, viewerSeat, seatControl?.seatKind),
      isViewer: player.seat === viewerSeat,
      isBot,
      isActive: player.seat === presentation.activeSeat,
      isDealer: player.seat === snapshot.dealerSeat,
      isCaller: player.seat === (snapshot.callerSeat ?? snapshot.bidOwnerSeat),
      isWith: withSeatSet.has(player.seat),
      isRisk: player.seat === presentation.risk?.seat || snapshot.scoreResult?.scoreResult?.playerScores
        .some((score) => score.playerId === player.playerId && score.isRiskTaker) === true,
      ...(player.bid?.tricks === undefined ? {} : { bid: player.bid.tricks }),
      won: player.actualTricks,
      score: player.cumulativeScore ?? scores[player.seat] ?? 0,
      });
    }),
    currentTrick: snapshot.currentTrick,
    ...(snapshot.currentWinningSeat === undefined ? {} : { currentWinningSeat: snapshot.currentWinningSeat }),
    ...(snapshot.currentTrick[0] === undefined ? {} : { leadSuit: snapshot.currentTrick[0].card.suit }),
    ...(snapshot.completedTricks.at(-1) === undefined ? {} : { lastCompletedTrick: snapshot.completedTricks.at(-1) }),
    ownHand: snapshot.ownHand,
    legalCards: snapshot.legalCards,
    estimateOptions: snapshot.estimateOptions
      ?? snapshot.legalNormalEstimates.map((value) => ({ value, enabled: true })),
    legalAuctionActions: snapshot.legalAuctionActions ?? [],
    scoreHistory: snapshot.scoreHistory ?? [],
    cumulativeScoresBySeat: scores,
    isSynchronizing: presentation.isSynchronizing,
  };
}
