import type { ContractSuit } from '../../domain/card.js';

export type BiddingPlayerStatus = 'normal' | 'with' | 'hold';

export interface BiddingState {
  readonly playerOrder: readonly string[];
  readonly estimateEntryOrder: readonly string[];
  readonly estimatesByPlayerId: Readonly<Record<string, number | undefined>>;
  readonly statusByPlayerId: Readonly<Record<string, BiddingPlayerStatus>>;
  readonly normalBiddingStarted: boolean;
  readonly dashCallPlayerId?: string;
  readonly bidOwnerPlayerId?: string;
  readonly winningEstimate: number;
  readonly trumpSuit?: ContractSuit;
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

function resolveNonOwnerStatus(
  state: BiddingState,
  playerId: string,
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
  winningEstimate: number,
): BiddingPlayerStatus {
  const estimate = estimatesByPlayerId[playerId] ?? 0;
  if (estimate <= 0) return 'normal';
  if (state.statusByPlayerId[playerId] === 'hold') return 'hold';
  return estimate === winningEstimate ? 'with' : 'normal';
}

function deriveStatusByPlayerId(
  state: BiddingState,
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
  ownerPlayerId: string | undefined,
  winningEstimate: number,
): Readonly<Record<string, BiddingPlayerStatus>> {
  return Object.fromEntries(
    state.playerOrder.map((playerId) => [
      playerId,
      playerId === ownerPlayerId
        ? 'normal'
        : resolveNonOwnerStatus(state, playerId, estimatesByPlayerId, winningEstimate),
    ]),
  ) as Record<string, BiddingPlayerStatus>;
}

function transferOwnership(
  state: BiddingState,
  estimatesByPlayerId: Readonly<Record<string, number | undefined>>,
  estimateEntryOrder: readonly string[],
  newOwnerPlayerId: string,
): BiddingState {
  const winningEstimate = estimatesByPlayerId[newOwnerPlayerId] ?? 0;
  const statusByPlayerId = deriveStatusByPlayerId(
    state,
    estimatesByPlayerId,
    newOwnerPlayerId,
    winningEstimate,
  );

  return {
    ...state,
    estimatesByPlayerId,
    estimateEntryOrder,
    statusByPlayerId,
    bidOwnerPlayerId: newOwnerPlayerId,
    winningEstimate,
    trumpSuit: undefined,
  };
}

export function createBiddingState(playerOrder: readonly string[]): BiddingState {
  return {
    playerOrder: [...playerOrder],
    estimateEntryOrder: [],
    estimatesByPlayerId: Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined])),
    statusByPlayerId: Object.fromEntries(playerOrder.map((playerId) => [playerId, 'normal'])),
    normalBiddingStarted: false,
    winningEstimate: 0,
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
  if (state.dashCallPlayerId === playerId) return state;

  const activeState = value !== undefined && !state.normalBiddingStarted
    ? { ...state, normalBiddingStarted: true }
    : state;
  const isTemporaryOwnerBlank = value === undefined && activeState.bidOwnerPlayerId === playerId;
  const wasEntered = activeState.estimatesByPlayerId[playerId] !== undefined
    || activeState.estimateEntryOrder.includes(playerId);
  const estimateEntryOrder = value === undefined
    ? isTemporaryOwnerBlank
      ? activeState.estimateEntryOrder
      : activeState.estimateEntryOrder.filter((candidate) => candidate !== playerId)
    : wasEntered
      ? activeState.estimateEntryOrder
      : [...activeState.estimateEntryOrder, playerId];
  const estimatesByPlayerId = { ...activeState.estimatesByPlayerId, [playerId]: value };
  const nextValue = value ?? 0;

  if (isTemporaryOwnerBlank) {
    return {
      ...activeState,
      estimateEntryOrder,
      estimatesByPlayerId,
    };
  }

  if (activeState.bidOwnerPlayerId === undefined) {
    const owner = firstEnteredHighestPlayerId(activeState.playerOrder, estimateEntryOrder, estimatesByPlayerId);
    if (owner === undefined) {
      return {
        ...activeState,
        estimateEntryOrder,
        estimatesByPlayerId,
        winningEstimate: 0,
        statusByPlayerId: Object.fromEntries(
          activeState.playerOrder.map((candidate) => [candidate, 'normal']),
        ) as Record<string, BiddingPlayerStatus>,
      };
    }
    return transferOwnership(activeState, estimatesByPlayerId, estimateEntryOrder, owner);
  }

  if (playerId !== activeState.bidOwnerPlayerId && nextValue > activeState.winningEstimate) {
    return transferOwnership(activeState, estimatesByPlayerId, estimateEntryOrder, playerId);
  }

  if (playerId === activeState.bidOwnerPlayerId && nextValue > activeState.winningEstimate) {
    const statusByPlayerId = deriveStatusByPlayerId(
      activeState,
      estimatesByPlayerId,
      activeState.bidOwnerPlayerId,
      nextValue,
    );
    return {
      ...activeState,
      estimateEntryOrder,
      estimatesByPlayerId,
      winningEstimate: nextValue,
      statusByPlayerId,
    };
  }

  if (playerId === activeState.bidOwnerPlayerId && nextValue < activeState.winningEstimate) {
    const nextOwner = firstEnteredHighestPlayerId(activeState.playerOrder, estimateEntryOrder, estimatesByPlayerId);
    if (nextOwner === undefined) {
      return {
        ...activeState,
        estimateEntryOrder,
        estimatesByPlayerId,
        statusByPlayerId: Object.fromEntries(activeState.playerOrder.map((candidate) => [candidate, 'normal'])),
        bidOwnerPlayerId: undefined,
        winningEstimate: 0,
        trumpSuit: undefined,
      };
    }
    if (nextOwner !== activeState.bidOwnerPlayerId) {
      return transferOwnership(activeState, estimatesByPlayerId, estimateEntryOrder, nextOwner);
    }
    const statusByPlayerId = deriveStatusByPlayerId(
      activeState,
      estimatesByPlayerId,
      activeState.bidOwnerPlayerId,
      nextValue,
    );
    return {
      ...activeState,
      estimateEntryOrder,
      estimatesByPlayerId,
      winningEstimate: nextValue,
      statusByPlayerId,
    };
  }

  const statusByPlayerId = deriveStatusByPlayerId(
    activeState,
    estimatesByPlayerId,
    activeState.bidOwnerPlayerId,
    activeState.winningEstimate,
  );

  return {
    ...activeState,
    estimateEntryOrder,
    estimatesByPlayerId,
    statusByPlayerId,
  };
}

export function announceDashCall(state: BiddingState, playerId: string): BiddingState {
  assertPlayer(state, playerId);
  if (
    state.confirmed
    || state.dashCallPlayerId !== undefined
    || state.normalBiddingStarted
    || state.estimateEntryOrder.length > 0
  ) {
    return state;
  }

  return {
    ...state,
    dashCallPlayerId: playerId,
    estimatesByPlayerId: { ...state.estimatesByPlayerId, [playerId]: 0 },
  };
}

export function setBiddingTrump(state: BiddingState, suit: ContractSuit): BiddingState {
  if (state.confirmed || state.bidOwnerPlayerId === undefined) return state;
  return { ...state, trumpSuit: suit };
}

export function toggleBiddingHold(state: BiddingState, playerId: string): BiddingState {
  assertPlayer(state, playerId);
  if (state.confirmed) return state;
  const estimate = normalizedEstimate(state, playerId);
  if (playerId === state.bidOwnerPlayerId || estimate <= 0) return state;
  const nextStatus = state.statusByPlayerId[playerId] === 'hold'
    ? estimate === state.winningEstimate ? 'with' : 'normal'
    : 'hold';
  return {
    ...state,
    statusByPlayerId: { ...state.statusByPlayerId, [playerId]: nextStatus },
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
  const underRisk = totalEstimates <= 11;
  const overRisk = totalEstimates >= 15;
  return underRisk || overRisk ? candidate : undefined;
}

export function confirmBidding(state: BiddingState): ConfirmBiddingResult {
  const errors: string[] = [];
  const estimates = state.playerOrder.map((playerId) => state.estimatesByPlayerId[playerId]);
  if (estimates.some((value) => value !== undefined && (!Number.isInteger(value) || value < 0 || value > 12))) {
    errors.push('Each estimate must be between 0 and 12.');
  }
  if (sumEstimates(state) === 13) {
    errors.push('Total estimates cannot equal 13.');
  }
  if (state.dashCallPlayerId !== undefined && normalizedEstimate(state, state.dashCallPlayerId) !== 0) {
    errors.push('Dash Call estimate must remain zero.');
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
