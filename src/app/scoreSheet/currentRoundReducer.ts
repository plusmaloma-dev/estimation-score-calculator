import type { ContractSuit } from '../../index.js';

export type CurrentRoundPhase = 'estimating' | 'actuals';

export interface CurrentRoundDraft {
  readonly playerOrder: readonly string[];
  readonly estimateEntryOrder: readonly string[];
  readonly estimates: Readonly<Record<string, number | undefined>>;
  readonly actuals: Readonly<Record<string, number | undefined>>;
  readonly trumpSuit?: ContractSuit;
  readonly overUnder: number;
  readonly phase: CurrentRoundPhase;
}

export type CurrentRoundAction =
  | { readonly type: 'set-estimate'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-actual'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-trump'; readonly suit: ContractSuit }
  | { readonly type: 'accept-estimates' }
  | { readonly type: 'reset' };

function normalizedEstimate(draft: CurrentRoundDraft, playerId: string): number {
  return draft.estimates[playerId] ?? 0;
}

function sumValues(values: Readonly<Record<string, number | undefined>>): number {
  return Object.values(values).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function withOverUnder(draft: Omit<CurrentRoundDraft, 'overUnder'>): CurrentRoundDraft {
  return { ...draft, overUnder: sumValues(draft.estimates) - 13 };
}

export function createCurrentRoundDraft(playerOrder: readonly string[]): CurrentRoundDraft {
  const estimates = Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined]));
  const actuals = Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined]));
  return {
    playerOrder: [...playerOrder],
    estimateEntryOrder: [],
    estimates,
    actuals,
    overUnder: -13,
    phase: 'estimating',
  };
}

function assertPlayer(draft: CurrentRoundDraft, playerId: string): void {
  if (!draft.playerOrder.includes(playerId)) throw new Error(`Unknown current-round player: ${playerId}.`);
}

export function resolveHighestEstimatePlayerId(draft: CurrentRoundDraft): string | undefined {
  const highest = Math.max(...draft.playerOrder.map((playerId) => normalizedEstimate(draft, playerId)));
  if (highest <= 0) return undefined;

  const isHighest = (playerId: string) => normalizedEstimate(draft, playerId) === highest;
  return draft.estimateEntryOrder.find(isHighest) ?? draft.playerOrder.find(isHighest);
}

export function resolveWithPlayerIds(draft: CurrentRoundDraft): readonly string[] {
  const ownerPlayerId = resolveHighestEstimatePlayerId(draft);
  if (ownerPlayerId === undefined) return [];
  const highest = normalizedEstimate(draft, ownerPlayerId);
  return draft.playerOrder.filter(
    (playerId) => playerId !== ownerPlayerId && normalizedEstimate(draft, playerId) === highest,
  );
}

export function resolveAutomaticRiskPlayerId(draft: CurrentRoundDraft): string | undefined {
  const ownerPlayerId = resolveHighestEstimatePlayerId(draft);
  if (ownerPlayerId === undefined || draft.playerOrder.length === 0) return undefined;

  const ownerIndex = draft.playerOrder.indexOf(ownerPlayerId);
  if (ownerIndex < 0) return undefined;

  // The trump caller starts the estimate sequence. The player immediately before
  // them in table order is therefore the final caller and potential Risk taker.
  const lastCallerIndex = (ownerIndex - 1 + draft.playerOrder.length) % draft.playerOrder.length;
  const lastCallerPlayerId = draft.playerOrder[lastCallerIndex];
  if (lastCallerPlayerId === undefined) return undefined;

  const totalEstimates = sumValues(draft.estimates);
  const lastEstimate = normalizedEstimate(draft, lastCallerPlayerId);
  const isUnderRisk = totalEstimates <= 11;
  const isOverRisk = totalEstimates >= 15 && lastEstimate >= 2;
  return isUnderRisk || isOverRisk ? lastCallerPlayerId : undefined;
}

export function validateAcceptedEstimates(draft: CurrentRoundDraft): readonly string[] {
  const errors: string[] = [];
  const estimates = draft.playerOrder.map((playerId) => draft.estimates[playerId]);

  if (estimates.some((value) => value !== undefined && (!Number.isInteger(value) || value < 0 || value > 12))) {
    errors.push('Each estimate must be between 0 and 12.');
  }
  if (sumValues(draft.estimates) === 13) errors.push('Total estimates cannot equal 13.');
  if (resolveHighestEstimatePlayerId(draft) === undefined) errors.push('At least one positive estimate is required.');
  if (draft.trumpSuit === undefined) errors.push('Trump suit is required.');

  return errors;
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
    case 'set-estimate': {
      assertPlayer(draft, action.playerId);
      if (draft.phase !== 'estimating') return draft;

      const previousOwner = resolveHighestEstimatePlayerId(draft);
      const wasEntered = draft.estimates[action.playerId] !== undefined;
      const estimateEntryOrder = action.value === undefined
        ? draft.estimateEntryOrder.filter((playerId) => playerId !== action.playerId)
        : wasEntered
          ? draft.estimateEntryOrder
          : [...draft.estimateEntryOrder, action.playerId];
      const next = withOverUnder({
        ...draft,
        estimateEntryOrder,
        estimates: { ...draft.estimates, [action.playerId]: action.value },
      });
      const nextOwner = resolveHighestEstimatePlayerId(next);
      return previousOwner !== nextOwner ? { ...next, trumpSuit: undefined } : next;
    }
    case 'set-actual': {
      assertPlayer(draft, action.playerId);
      if (draft.phase !== 'actuals') return draft;
      return { ...draft, actuals: { ...draft.actuals, [action.playerId]: action.value } };
    }
    case 'set-trump':
      return draft.phase === 'estimating' ? { ...draft, trumpSuit: action.suit } : draft;
    case 'accept-estimates': {
      if (draft.phase !== 'estimating' || validateAcceptedEstimates(draft).length > 0) return draft;
      const estimates = Object.fromEntries(
        draft.playerOrder.map((playerId) => [playerId, normalizedEstimate(draft, playerId)]),
      );
      return withOverUnder({ ...draft, estimates, phase: 'actuals' });
    }
    case 'reset':
      return createCurrentRoundDraft(draft.playerOrder);
  }
}

export function validateCurrentRoundDraft(draft: CurrentRoundDraft): readonly string[] {
  return draft.phase === 'estimating' ? validateAcceptedEstimates(draft) : validateActualTricks(draft);
}