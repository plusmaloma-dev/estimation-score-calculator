import type { ContractSuit } from '../../index.js';
import {
  confirmBidding,
  createBiddingState,
  resolveActiveWithPlayerIds,
  resolveFollow,
  resolveHold,
  resolveMultipleWithMultiplier,
  resolveRiskPlayerId,
  setBiddingEstimate,
  setBiddingTrump,
  type BiddingState,
} from './biddingState.js';

export type CurrentRoundPhase = 'estimating' | 'actuals';

export interface CurrentRoundDraft {
  readonly playerOrder: readonly string[];
  readonly estimateEntryOrder: readonly string[];
  readonly estimates: Readonly<Record<string, number | undefined>>;
  readonly actuals: Readonly<Record<string, number | undefined>>;
  readonly trumpSuit?: ContractSuit;
  readonly overUnder: number;
  readonly phase: CurrentRoundPhase;
  readonly bidding: BiddingState;
  readonly pendingWithDecisionPlayerIds: readonly string[];
}

export type CurrentRoundAction =
  | { readonly type: 'set-estimate'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-actual'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-trump'; readonly suit: ContractSuit }
  | { readonly type: 'follow-with'; readonly playerId: string }
  | { readonly type: 'hold-with'; readonly playerId: string }
  | { readonly type: 'accept-estimates' }
  | { readonly type: 'reset' };

function normalizedEstimate(draft: CurrentRoundDraft, playerId: string): number {
  return draft.estimates[playerId] ?? 0;
}

function sumValues(values: Readonly<Record<string, number | undefined>>): number {
  return Object.values(values).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function withBidding(draft: CurrentRoundDraft, bidding: BiddingState): CurrentRoundDraft {
  const estimates = bidding.estimatesByPlayerId;
  return {
    ...draft,
    playerOrder: bidding.playerOrder,
    estimateEntryOrder: bidding.estimateEntryOrder,
    estimates,
    trumpSuit: bidding.trumpSuit,
    overUnder: sumValues(estimates) - 13,
    bidding,
    pendingWithDecisionPlayerIds: bidding.pendingDecisionPlayerIds,
  };
}

export function createCurrentRoundDraft(playerOrder: readonly string[]): CurrentRoundDraft {
  const bidding = createBiddingState(playerOrder);
  const actuals = Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined]));
  return {
    playerOrder: [...playerOrder],
    estimateEntryOrder: [],
    estimates: bidding.estimatesByPlayerId,
    actuals,
    overUnder: -13,
    phase: 'estimating',
    bidding,
    pendingWithDecisionPlayerIds: [],
  };
}

function assertPlayer(draft: CurrentRoundDraft, playerId: string): void {
  if (!draft.playerOrder.includes(playerId)) throw new Error(`Unknown current-round player: ${playerId}.`);
}

export function resolveHighestEstimatePlayerId(draft: CurrentRoundDraft): string | undefined {
  return draft.bidding.bidOwnerPlayerId;
}

export function resolveWithPlayerIds(draft: CurrentRoundDraft): readonly string[] {
  return resolveActiveWithPlayerIds(draft.bidding);
}

export function resolveHoldPlayerIds(draft: CurrentRoundDraft): readonly string[] {
  return draft.playerOrder.filter((playerId) => draft.bidding.statusByPlayerId[playerId] === 'hold');
}

export function resolveMultipleWithRoundMultiplier(draft: CurrentRoundDraft): 1 | 2 {
  return resolveMultipleWithMultiplier(draft.bidding);
}

export function resolveAutomaticRiskPlayerId(draft: CurrentRoundDraft): string | undefined {
  return resolveRiskPlayerId(draft.bidding);
}

export function validateAcceptedEstimates(draft: CurrentRoundDraft): readonly string[] {
  return confirmBidding(draft.bidding).errors;
}

export function validateActualTricks(draft: CurrentRoundDraft): readonly string[] {
  const actuals = draft.playerOrder.map((playerId) => draft.actuals[playerId]);
  const errors: string[] = [];

  if (draft.phase !== 'actuals') errors.push('Estimates must be accepted before entering actual tricks.');
  if (actuals.some((value) => value === undefined || !Number.isInteger(value) || value < 0 || value > 13)) {
    errors.push('All four actual trick values must be between 0 and 13.');
  }
  if (actuals.every((value) => value !== undefined) && sumValues(draft.actuals) !== 13) {
    errors.push('Actual tricks must total 13.');
  }

  return errors;
}

export function currentRoundReducer(draft: CurrentRoundDraft, action: CurrentRoundAction): CurrentRoundDraft {
  switch (action.type) {
    case 'set-estimate':
      if (draft.phase !== 'estimating') return draft;
      return withBidding(draft, setBiddingEstimate(draft.bidding, action.playerId, action.value));
    case 'set-actual': {
      assertPlayer(draft, action.playerId);
      if (draft.phase !== 'actuals') return draft;
      return { ...draft, actuals: { ...draft.actuals, [action.playerId]: action.value } };
    }
    case 'set-trump':
      return draft.phase === 'estimating'
        ? withBidding(draft, setBiddingTrump(draft.bidding, action.suit))
        : draft;
    case 'follow-with':
      return draft.phase === 'estimating'
        ? withBidding(draft, resolveFollow(draft.bidding, action.playerId))
        : draft;
    case 'hold-with':
      return draft.phase === 'estimating'
        ? withBidding(draft, resolveHold(draft.bidding, action.playerId))
        : draft;
    case 'accept-estimates': {
      if (draft.phase !== 'estimating') return draft;
      const confirmation = confirmBidding(draft.bidding);
      if (confirmation.errors.length > 0) return draft;
      return {
        ...withBidding(draft, confirmation.state),
        phase: 'actuals',
      };
    }
    case 'reset':
      return createCurrentRoundDraft(draft.playerOrder);
  }
}

export function validateCurrentRoundDraft(draft: CurrentRoundDraft): readonly string[] {
  return draft.phase === 'estimating' ? validateAcceptedEstimates(draft) : validateActualTricks(draft);
}
