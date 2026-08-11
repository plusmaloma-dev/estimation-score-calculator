import type { ContractSuit } from '../../domain/card.js';
import type {
  CompletedGameplayTrick,
  GameplayTrickEntry,
  SeatIndex,
} from '../../gameplay/types.js';
import type {
  ActiveTurnActionKind,
  ActiveTurnStatus,
  SeatControlOwner,
} from '../../gameplay/control/types.js';
import type {
  OnlineActiveGameControlSnapshot,
  OnlineActiveSeatControl,
} from '../../online/gameplay/activeControlTypes.js';
import type {
  OnlineGameplayRoundPlayer,
  OnlineGameplayRoundSnapshot,
} from '../../online/gameplay/roundTypes.js';
import type { RiskType } from '../../scoring/types.js';
import type { MvpRoundResult } from '../../services/EstimationMvpService.js';

export type ActiveRoundPresentationPhase =
  | 'loading'
  | 'synchronizing'
  | 'auction'
  | 'estimate'
  | 'playing'
  | 'scored'
  | 'paused'
  | 'terminated';

export type ActiveRoundSynchronizationReason =
  | 'table-mismatch'
  | 'viewer-seat-mismatch'
  | 'risk-seat-missing'
  | 'turn-mismatch'
  | 'scored-turn-present'
  | 'completed-estimates-total-thirteen'
  | 'legacy-phase';

export type EstimateStatus = 'under' | 'over' | 'at-13';

export interface SeatEstimatePresentation {
  readonly seat: SeatIndex;
  readonly playerId: string;
  readonly estimate?: number;
  readonly isViewer: boolean;
  readonly isCaller: boolean;
}

export interface RoundRiskPresentation {
  readonly seat: SeatIndex;
  readonly type: 'pending' | RiskType;
}

export interface ActiveRoundPresentation {
  readonly phase: ActiveRoundPresentationPhase;
  readonly tableId?: string;
  readonly roundNumber?: number;
  readonly viewerSeat?: SeatIndex;
  readonly viewerActionRequired: boolean;
  readonly activeSeat?: SeatIndex;
  readonly actionKind?: ActiveTurnActionKind;
  readonly activeTurnStatus?: ActiveTurnStatus;
  readonly activeControlOwner?: SeatControlOwner;
  readonly countdownSeconds?: number;
  readonly seatControls: readonly OnlineActiveSeatControl[];
  readonly estimatesBySeat: readonly SeatEstimatePresentation[];
  readonly callerSeat?: SeatIndex;
  readonly callerEstimate?: number;
  readonly trump?: ContractSuit;
  readonly totalEstimatedTricks: number;
  readonly estimateStatus: EstimateStatus;
  readonly estimateDistanceFrom13: number;
  readonly estimatesComplete: boolean;
  readonly risk?: RoundRiskPresentation;
  readonly currentTrick: readonly GameplayTrickEntry[];
  readonly lastCompletedTrick?: CompletedGameplayTrick;
  readonly scoredResults?: MvpRoundResult;
  readonly ownHand: OnlineGameplayRoundSnapshot['ownHand'];
  readonly legalNormalEstimates: readonly number[];
  readonly legalCards: OnlineGameplayRoundSnapshot['legalCards'];
  readonly canStartNextRound: boolean;
  readonly isSynchronizing: boolean;
  readonly synchronizationReason?: ActiveRoundSynchronizationReason;
  readonly synchronizationKey?: string;
}

export interface CreateActiveRoundPresentationInput {
  readonly activeControl?: OnlineActiveGameControlSnapshot;
  readonly round?: OnlineGameplayRoundSnapshot;
  readonly viewerUserId: string;
  readonly nowMs: number;
}

interface RoundDerivedPresentation {
  readonly estimatesBySeat: readonly SeatEstimatePresentation[];
  readonly callerEstimate?: number;
  readonly trump?: ContractSuit;
  readonly totalEstimatedTricks: number;
  readonly estimateStatus: EstimateStatus;
  readonly estimateDistanceFrom13: number;
  readonly estimatesComplete: boolean;
  readonly risk?: RoundRiskPresentation;
}

function estimateStatus(total: number): EstimateStatus {
  if (total === 13) return 'at-13';
  return total < 13 ? 'under' : 'over';
}

function scoredRiskType(
  round: OnlineGameplayRoundSnapshot,
  riskPlayer: OnlineGameplayRoundPlayer,
): RiskType {
  return round.scoreResult?.scoreResult?.playerScores
    .find((score) => score.playerId === riskPlayer.playerId)?.riskType
    ?? 'round-risk';
}

function deriveRound(round: OnlineGameplayRoundSnapshot): RoundDerivedPresentation {
  const estimatesBySeat = [...round.players]
    .sort((left, right) => left.seat - right.seat)
    .map((player): SeatEstimatePresentation => ({
      seat: player.seat,
      playerId: player.playerId,
      ...(player.bid === undefined ? {} : { estimate: player.bid.tricks }),
      isViewer: player.seat === round.viewerSeat,
      isCaller: player.seat === (round.callerSeat ?? round.bidOwnerSeat),
    }));
  const callerBid = round.players.find((player) => player.seat === (round.callerSeat ?? round.bidOwnerSeat))?.bid;
  const totalEstimatedTricks = round.players.reduce(
    (total, player) => total + (player.bid?.tricks ?? 0),
    0,
  );
  const estimatesComplete = round.players.every((player) => player.bid !== undefined);
  const riskPlayer = round.riskSeat === undefined
    ? undefined
    : round.players.find((player) => player.seat === round.riskSeat);
  const riskType = riskPlayer === undefined
    ? undefined
    : estimatesComplete
      ? round.phase === 'scored'
        ? scoredRiskType(round, riskPlayer)
        : 'round-risk'
      : 'pending';

  return {
    estimatesBySeat,
    ...(callerBid === undefined ? {} : { callerEstimate: callerBid.tricks }),
    ...(round.trumpSuit ?? callerBid?.trumpSuit) === undefined ? {} : { trump: round.trumpSuit ?? callerBid?.trumpSuit },
    totalEstimatedTricks,
    estimateStatus: estimateStatus(totalEstimatedTricks),
    estimateDistanceFrom13: Math.abs(13 - totalEstimatedTricks),
    estimatesComplete,
    ...(riskPlayer === undefined || riskType === undefined
      ? {}
      : { risk: { seat: riskPlayer.seat, type: riskType } }),
  };
}

function countdownSeconds(
  activeControl: OnlineActiveGameControlSnapshot,
  nowMs: number,
): number | undefined {
  const turn = activeControl.turn;
  if (turn === undefined) return undefined;
  if (activeControl.lifecycle === 'paused' && turn.remainingMs !== undefined) {
    return Math.ceil(Math.max(0, turn.remainingMs) / 1_000);
  }
  if (turn.deadlineAt === undefined) return undefined;
  const deadlineMs = Date.parse(turn.deadlineAt);
  if (!Number.isFinite(deadlineMs)) return undefined;
  return Math.ceil(Math.max(0, deadlineMs - nowMs) / 1_000);
}

function synchronizationKey(
  activeControl: OnlineActiveGameControlSnapshot,
  round: OnlineGameplayRoundSnapshot,
): string {
  return [
    activeControl.tableId,
    activeControl.version,
    activeControl.turn?.turnId ?? 'no-turn',
    round.tableId,
    round.roundNumber,
    round.version,
    round.phase,
  ].join(':');
}

function expectedTurn(round: OnlineGameplayRoundSnapshot): {
  readonly seat: SeatIndex;
  readonly actionKind: ActiveTurnActionKind;
  readonly turnId: string;
} | undefined {
  const seat = round.phase === 'auction' || round.phase === 'estimate'
    ? round.nextBidSeat
    : round.currentTurnSeat;
  const actionKind = round.phase === 'auction' || round.phase === 'estimate'
    ? 'bid'
    : round.phase === 'playing'
      ? 'card'
      : undefined;
  if (seat === undefined || actionKind === undefined) return undefined;
  return {
    seat,
    actionKind,
    turnId: `round-${round.roundNumber}:${actionKind}:${round.version}:${seat}`,
  };
}

function isExactTurn(
  activeControl: OnlineActiveGameControlSnapshot,
  round: OnlineGameplayRoundSnapshot,
): boolean {
  const expected = expectedTurn(round);
  const actual = activeControl.turn;
  return expected !== undefined
    && actual !== undefined
    && actual.seat === expected.seat
    && actual.actionKind === expected.actionKind
    && actual.turnId === expected.turnId;
}

function basePresentation(
  activeControl: OnlineActiveGameControlSnapshot | undefined,
  round: OnlineGameplayRoundSnapshot | undefined,
  nowMs: number,
): Omit<
  ActiveRoundPresentation,
  'phase' | 'viewerActionRequired' | 'canStartNextRound' | 'isSynchronizing'
> {
  const derived = round === undefined
    ? {
        estimatesBySeat: [],
        totalEstimatedTricks: 0,
        estimateStatus: 'under' as const,
        estimateDistanceFrom13: 13,
        estimatesComplete: false,
      }
    : deriveRound(round);
  const activeSeat = activeControl?.turn?.seat;
  const activeSeatControl = activeSeat === undefined
    ? undefined
    : activeControl?.seats.find((candidate) => candidate.seat === activeSeat);

  return {
    ...(round?.tableId === undefined && activeControl?.tableId === undefined
      ? {}
      : { tableId: round?.tableId ?? activeControl?.tableId }),
    ...(round === undefined ? {} : {
      roundNumber: round.roundNumber,
      viewerSeat: round.viewerSeat,
      ...(round.callerSeat ?? round.bidOwnerSeat) === undefined ? {} : { callerSeat: round.callerSeat ?? round.bidOwnerSeat },
      currentTrick: round.currentTrick,
      ownHand: round.ownHand,
      legalNormalEstimates: round.legalNormalEstimates,
      legalCards: round.legalCards,
      ...(round.completedTricks.at(-1) === undefined
        ? {}
        : { lastCompletedTrick: round.completedTricks.at(-1) }),
      ...(round.scoreResult === undefined ? {} : { scoredResults: round.scoreResult }),
    }),
    ...(activeSeat === undefined ? {} : { activeSeat }),
    ...(activeControl?.turn?.actionKind === undefined
      ? {}
      : { actionKind: activeControl.turn.actionKind }),
    ...(activeControl?.turn?.status === undefined
      ? {}
      : { activeTurnStatus: activeControl.turn.status }),
    ...(activeSeatControl === undefined
      ? {}
      : { activeControlOwner: activeSeatControl.controlOwner }),
    ...(activeControl === undefined
      ? {}
      : {
          seatControls: activeControl.seats,
          ...(countdownSeconds(activeControl, nowMs) === undefined
            ? {}
            : { countdownSeconds: countdownSeconds(activeControl, nowMs) }),
        }),
    ...derived,
    currentTrick: round?.currentTrick ?? [],
    ownHand: round?.ownHand ?? [],
    legalNormalEstimates: round?.legalNormalEstimates ?? [],
    legalCards: round?.legalCards ?? [],
    seatControls: activeControl?.seats ?? [],
  };
}

function synchronizing(
  base: ReturnType<typeof basePresentation>,
  activeControl: OnlineActiveGameControlSnapshot,
  round: OnlineGameplayRoundSnapshot,
  reason: ActiveRoundSynchronizationReason,
): ActiveRoundPresentation {
  return {
    ...base,
    phase: 'synchronizing',
    viewerActionRequired: false,
    canStartNextRound: false,
    isSynchronizing: true,
    synchronizationReason: reason,
    synchronizationKey: synchronizationKey(activeControl, round),
  };
}

export function createActiveRoundPresentation({
  activeControl,
  round,
  viewerUserId,
  nowMs,
}: CreateActiveRoundPresentationInput): ActiveRoundPresentation {
  const base = basePresentation(activeControl, round, nowMs);
  if (activeControl === undefined || round === undefined) {
    return {
      ...base,
      phase: 'loading',
      viewerActionRequired: false,
      canStartNextRound: false,
      isSynchronizing: false,
    };
  }
  if (activeControl.tableId !== round.tableId) {
    return synchronizing(base, activeControl, round, 'table-mismatch');
  }
  if (round.phase === 'bidding') {
    return synchronizing(base, activeControl, round, 'legacy-phase');
  }

  if (activeControl.lifecycle === 'terminated') {
    return {
      ...base,
      phase: 'terminated',
      viewerActionRequired: false,
      canStartNextRound: false,
      isSynchronizing: false,
    };
  }

  const viewerControl = activeControl.seats.find(
    (candidate) => candidate.humanUserId === viewerUserId,
  );
  if (viewerControl === undefined || viewerControl.seat !== round.viewerSeat) {
    return synchronizing(base, activeControl, round, 'viewer-seat-mismatch');
  }
  if ((round.phase === 'estimate' || round.phase === 'playing' || round.phase === 'scored') && round.riskSeat === undefined) {
    return synchronizing(base, activeControl, round, 'risk-seat-missing');
  }
  if (base.estimatesComplete && base.totalEstimatedTricks === 13) {
    return synchronizing(base, activeControl, round, 'completed-estimates-total-thirteen');
  }

  if (round.phase === 'scored') {
    if (activeControl.turn !== undefined) {
      return synchronizing(base, activeControl, round, 'scored-turn-present');
    }
  } else if (!isExactTurn(activeControl, round)) {
    return synchronizing(base, activeControl, round, 'turn-mismatch');
  }

  if (activeControl.lifecycle === 'paused') {
    return {
      ...base,
      phase: 'paused',
      viewerActionRequired: false,
      canStartNextRound: false,
      isSynchronizing: false,
    };
  }

  const activeSeatControl = activeControl.turn === undefined
    ? undefined
    : activeControl.seats.find((candidate) => candidate.seat === activeControl.turn?.seat);
  const viewerActionRequired = activeControl.turn !== undefined
    && activeControl.turn.status === 'running'
    && activeControl.turn.seat === round.viewerSeat
    && activeSeatControl?.humanUserId === viewerUserId
    && activeSeatControl.controlOwner === 'human'
    && activeSeatControl.connection === 'connected';

  return {
    ...base,
    phase: round.phase,
    viewerActionRequired,
    canStartNextRound: round.phase === 'scored'
      && activeControl.hostUserId === viewerUserId,
    isSynchronizing: false,
  };
}
