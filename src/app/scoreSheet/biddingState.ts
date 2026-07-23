import type { ContractSuit } from '../../domain/card.js';

export type BiddingPlayerStatus = 'normal' | 'with' | 'hold';

export interface BiddingState {
  readonly playerOrder: readonly string[];
  readonly estimateEntryOrder: readonly string[];
  readonly estimatesByPlayerId: Readonly<Record<string, number | undefined>>;
  readonly statusByPlayerId: Readonly<Record<string, BiddingPlayerStatus>>;
  readonly bidOwnerPlayerId?: string;
  readonly winningEstimate: number;
  readonly trumpSuit?: ContractSuit;
  readonly pendingDecisionPlayerIds: readonly string[];
  readonly previousWithEstimateByPlayerId: Readonly<Record<string, number | undefined>>;
  readonly confirmed: boolean;
}

export interface ConfirmBiddingResult {
  readonly state: BiddingState;
  readonly errors: readonly string[];
}

function assertPlayer(state: BiddingState, playerId: string): void {
  if (!state.playerOrder.includes(playerId)) {
    throw new Error(`Unknown bidding player: ${playerId}.`);
  }
}

function normalizedEstimate(state: BiddingState, playerId: string): number {
  return state.estimatesByPlayerId[playerId] ?? 0;
}

function sumEstimates(state: BiddingState): number {
  return state.playerOrder.reduce((total, playerId) => total + normalizedEstimate(state, playerId), 0);
}

function firstEnteredHighestPlayerId(
  playerOrder: readonly string[],
  estimateEntryOrder: readonly string[],
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
): string | undefined {
  const highest = Math.max(...playerOrder.map((playerId) => estimatesByPlayerId[playerId] ?? 0));
  if (highest <= 0) return undefined;
  const isHighest = (playerId: string) => (estimatesByPlayerId[playerId] ?? 0) === highest;
  return estimateEntryOrder.find(isHighest) ?? playerOrder.find(isHighest);
}

function transferOwnership(
  state: BiddingState,
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
  estimateEntryOrder: readonly string[],
  newOwnerPlayerId: string,
): BiddingState {
  const winningEstimate = estimatesByPlayerId[newOwnerPlayerId] ?? 0;
  const statusByPlayerId = Object.fromEntries(
    state.playerOrder.map((playerId) => [
      playerId,
      playerId !== newOwnerPlayerId && (estimatesByPlayerId[playerId] ?? 0) === winningEstimate
        ? 'with'
        : 'normal',
    ]),
  ) as Record<string, BiddingPlayerStatus>;

  return {
    ...state,
    estimatesByPlayerId,
    estimateEntryOrder,
    statusByPlayerId,
    bidOwnerPlayerId: newOwnerPlayerId,
    winningEstimate,
    trumpSuit: undefined,
    pendingDecisionPlayerIds: [],
    previousWithEstimateByPlayerId: {},
  };
}

export function createBiddingState(playerOrder: readonly string[]): BiddingState {
  return {
    playerOrder: [...playerOrder],
    estimateEntryOrder: [],
    estimatesByPlayerId: Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined])),
    statusByPlayerId: Object.fromEntries(playerOrder.map((playerId) => [playerId, 'normal'])),
    winningEstimate: 0,
    pendingDecisionPlayerIds: [],
    previousWithEstimateByPlayerId: {},
    confirmed: false,
  };
}

export function setBiddingEstimate(
  state: BiddingState,
  playerId: string,
  value: number | undefined,
): BiddingState {
  assertPlayer(state, playerId);
  if (state.confirmed) return state;

  const isTemporaryOwnerBlank = value === undefined && state.bidOwnerPlayerId === playerId;
  const wasEntered = state.estimatesByPlayerId[playerId] !== undefined
    || state.estimateEntryOrder.includes(playerId);
  const estimateEntryOrder = value === undefined
    ? isTemporaryOwnerBlank
      ? state.estimateEntryOrder
      : state.estimateEntryOrder.filter((candidate) => candidate !== playerId)
    : wasEntered
      ? state.estimateEntryOrder
      : [...state.estimateEntryOrder, playerId];
  const estimatesByPlayerId = { ...state.estimatesByPlayerId, [playerId]: value };
  const nextValue = value ?? 0;

  if (isTemporaryOwnerBlank) {
    return {
      ...state,
      estimateEntryOrder,
      estimatesByPlayerId,
    };
  }

  if (state.bidOwnerPlayerId === undefined) {
    const owner = firstEnteredHighestPlayerId(state.playerOrder, estimateEntryOrder, estimatesByPlayerId);
    if (owner === undefined) {
      return {
        ...state,
        estimateEntryOrder,
        estimatesByPlayerId,
        winningEstimate: 0,
      };
    }
    return transferOwnership(state, estimatesByPlayerId, estimateEntryOrder, owner);
  }

  if (playerId !== state.bidOwnerPlayerId && nextValue > state.winningEstimate) {
    return transferOwnership(state, estimatesByPlayerId, estimateEntryOrder, playerId);
  }

  if (playerId === state.bidOwnerPlayerId && nextValue > state.winningEstimate) {
    const activeWithPlayerIds = state.playerOrder.filter(
      (candidate) => candidate !== playerId
        && state.statusByPlayerId[candidate] === 'with'
        && normalizedEstimate(state, candidate) === state.winningEstimate,
    );
    const previousWithEstimateByPlayerId = {
      ...state.previousWithEstimateByPlayerId,
      ...Object.fromEntries(activeWithPlayerIds.map((candidate) => [candidate, normalizedEstimate(state, candidate)])),
    };
    return {
      ...state,
      estimateEntryOrder,
      estimatesByPlayerId,
      winningEstimate: nextValue,
      pendingDecisionPlayerIds: activeWithPlayerIds,
      previousWithEstimateByPlayerId,
    };
  }

  if (playerId === state.bidOwnerPlayerId && nextValue < state.winningEstimate) {
    const nextOwner = firstEnteredHighestPlayerId(state.playerOrder, estimateEntryOrder, estimatesByPlayerId);
    if (nextOwner === undefined) {
      return {
        ...state,
        estimateEntryOrder,
        estimatesByPlayerId,
        statusByPlayerId: Object.fromEntries(state.playerOrder.map((candidate) => [candidate, 'normal'])),
        bidOwnerPlayerId: undefined,
        winningEstimate: 0,
        trumpSuit: undefined,
        pendingDecisionPlayerIds: [],
        previousWithEstimateByPlayerId: {},
      };
    }
    if (nextOwner !== state.bidOwnerPlayerId) {
      return transferOwnership(state, estimatesByPlayerId, estimateEntryOrder, nextOwner);
    }
  }

  const statusByPlayerId = { ...state.statusByPlayerId };
  if (playerId !== state.bidOwnerPlayerId) {
    if (nextValue > 0 && nextValue === state.winningEstimate) {
      statusByPlayerId[playerId] = 'with';
    } else if (statusByPlayerId[playerId] === 'with') {
      statusByPlayerId[playerId] = 'normal';
    }
  }

  return {
    ...state,
    estimateEntryOrder,
    estimatesByPlayerId,
    statusByPlayerId,
    pendingDecisionPlayerIds: state.pendingDecisionPlayerIds.filter((candidate) => candidate !== playerId),
    previousWithEstimateByPlayerId: Object.fromEntries(
      Object.entries(state.previousWithEstimateByPlayerId).filter(([candidate]) => candidate !== playerId),
    ),
  };
}

export function setBiddingTrump(state: BiddingState, suit: ContractSuit): BiddingState {
  if (state.confirmed || state.bidOwnerPlayerId === undefined) return state;
  return { ...state, trumpSuit: suit };
}

export function resolveFollow(state: BiddingState, playerId: string): BiddingState {
  assertPlayer(state, playerId);
  if (!state.pendingDecisionPlayerIds.includes(playerId) || state.confirmed) return state;
  return {
    ...state,
    estimatesByPlayerId: { ...state.estimatesByPlayerId, [playerId]: state.winningEstimate },
    statusByPlayerId: { ...state.statusByPlayerId, [playerId]: 'with' },
    pendingDecisionPlayerIds: state.pendingDecisionPlayerIds.filter((candidate) => candidate !== playerId),
    previousWithEstimateByPlayerId: Object.fromEntries(
      Object.entries(state.previousWithEstimateByPlayerId).filter(([candidate]) => candidate !== playerId),
    ),
  };
}

export function resolveHold(state: BiddingState, playerId: string): BiddingState {
  assertPlayer(state, playerId);
  if (!state.pendingDecisionPlayerIds.includes(playerId) || state.confirmed) return state;
  const heldEstimate = state.previousWithEstimateByPlayerId[playerId] ?? state.estimatesByPlayerId[playerId] ?? 0;
  return {
    ...state,
    estimatesByPlayerId: { ...state.estimatesByPlayerId, [playerId]: heldEstimate },
    statusByPlayerId: { ...state.statusByPlayerId, [playerId]: 'hold' },
    pendingDecisionPlayerIds: state.pendingDecisionPlayerIds.filter((candidate) => candidate !== playerId),
    previousWithEstimateByPlayerId: Object.fromEntries(
      Object.entries(state.previousWithEstimateByPlayerId).filter(([candidate]) => candidate !== playerId),
    ),
  };
}

export function resolveActiveWithPlayerIds(state: BiddingState): readonly string[] {
  return state.playerOrder.filter(
    (playerId) => playerId !== state.bidOwnerPlayerId
      && state.statusByPlayerId[playerId] === 'with'
      && normalizedEstimate(state, playerId) === state.winningEstimate,
  );
}

export function resolveMultipleWithMultiplier(state: BiddingState): 1 | 2 {
  return resolveActiveWithPlayerIds(state).length >= 2 ? 2 : 1;
}

export function resolveRiskPlayerId(state: BiddingState): string | undefined {
  const ownerPlayerId = state.bidOwnerPlayerId;
  if (ownerPlayerId === undefined || state.playerOrder.length < 2) return undefined;
  const ownerIndex = state.playerOrder.indexOf(ownerPlayerId);
  if (ownerIndex < 0) return undefined;

  let candidate: string | undefined;
  for (let offset = 1; offset < state.playerOrder.length; offset += 1) {
    const index = (ownerIndex - offset + state.playerOrder.length) % state.playerOrder.length;
    const playerId = state.playerOrder[index];
    if (playerId !== undefined && state.statusByPlayerId[playerId] !== 'hold') {
      candidate = playerId;
      break;
    }
  }
  if (candidate === undefined) return undefined;

  const totalEstimates = sumEstimates(state);
  const candidateEstimate = normalizedEstimate(state, candidate);
  const underRisk = totalEstimates <= 11;
  const overRisk = totalEstimates >= 15 && candidateEstimate >= 2;
  return underRisk || overRisk ? candidate : undefined;
}

export function confirmBidding(state: BiddingState): ConfirmBiddingResult {
  const errors: string[] = [];
  const estimates = state.playerOrder.map((playerId) => state.estimatesByPlayerId[playerId]);
  if (state.pendingDecisionPlayerIds.length > 0) {
    errors.push('Every With player must choose Follow or Hold.');
  }
  if (estimates.some((value) => value !== undefined && (!Number.isInteger(value) || value < 0 || value > 12))) {
    errors.push('Each estimate must be between 0 and 12.');
  }
  if (sumEstimates(state) === 13) {
    errors.push('Total estimates cannot equal 13.');
  }
  if (state.bidOwnerPlayerId === undefined || state.winningEstimate <= 0) {
    errors.push('At least one positive estimate is required.');
  } else if (normalizedEstimate(state, state.bidOwnerPlayerId) !== state.winningEstimate) {
    errors.push('Bid owner must keep the highest estimate.');
  }
  if (state.trumpSuit === undefined) {
    errors.push('Trump suit is required.');
  }
  if (errors.length > 0) return { state, errors };

  return {
    state: {
      ...state,
      estimatesByPlayerId: Object.fromEntries(
        state.playerOrder.map((playerId) => [playerId, normalizedEstimate(state, playerId)]),
      ),
      confirmed: true,
    },
    errors: [],
  };
}
