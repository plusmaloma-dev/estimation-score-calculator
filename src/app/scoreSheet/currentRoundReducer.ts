import type { ContractSuit } from '../../index.js';

export interface CurrentRoundDraft {
  readonly playerOrder: readonly string[];
  readonly estimates: Readonly<Record<string, number | undefined>>;
  readonly actuals: Readonly<Record<string, number | undefined>>;
  readonly trumpSuit?: ContractSuit;
  readonly overUnder: number;
}

export type CurrentRoundAction =
  | { readonly type: 'set-estimate'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-actual'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-trump'; readonly suit: ContractSuit }
  | { readonly type: 'reset' };

function sumValues(values: Readonly<Record<string, number | undefined>>): number {
  return Object.values(values).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function withOverUnder(draft: Omit<CurrentRoundDraft, 'overUnder'>): CurrentRoundDraft {
  return { ...draft, overUnder: sumValues(draft.estimates) - 13 };
}

export function createCurrentRoundDraft(playerOrder: readonly string[]): CurrentRoundDraft {
  const estimates = Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined]));
  const actuals = Object.fromEntries(playerOrder.map((playerId) => [playerId, undefined]));
  return { playerOrder: [...playerOrder], estimates, actuals, overUnder: -13 };
}

function assertPlayer(draft: CurrentRoundDraft, playerId: string): void {
  if (!draft.playerOrder.includes(playerId)) throw new Error(`Unknown current-round player: ${playerId}.`);
}

export function resolveHighestEstimatePlayerId(draft: CurrentRoundDraft): string | undefined {
  const entries = draft.playerOrder.map((playerId) => [playerId, draft.estimates[playerId]] as const);
  if (entries.some(([, estimate]) => estimate === undefined)) return undefined;

  const highest = Math.max(...entries.map(([, estimate]) => estimate ?? Number.NEGATIVE_INFINITY));
  const leaders = entries.filter(([, estimate]) => estimate === highest);
  return leaders.length === 1 ? leaders[0]?.[0] : undefined;
}

export function currentRoundReducer(draft: CurrentRoundDraft, action: CurrentRoundAction): CurrentRoundDraft {
  switch (action.type) {
    case 'set-estimate': {
      assertPlayer(draft, action.playerId);
      const previousWinner = resolveHighestEstimatePlayerId(draft);
      const next = withOverUnder({ ...draft, estimates: { ...draft.estimates, [action.playerId]: action.value } });
      const nextWinner = resolveHighestEstimatePlayerId(next);
      return previousWinner !== nextWinner ? { ...next, trumpSuit: undefined } : next;
    }
    case 'set-actual': {
      assertPlayer(draft, action.playerId);
      return { ...draft, actuals: { ...draft.actuals, [action.playerId]: action.value } };
    }
    case 'set-trump':
      return { ...draft, trumpSuit: action.suit };
    case 'reset':
      return createCurrentRoundDraft(draft.playerOrder);
  }
}

export function validateCurrentRoundDraft(draft: CurrentRoundDraft): readonly string[] {
  const errors: string[] = [];
  const estimates = draft.playerOrder.map((playerId) => draft.estimates[playerId]);
  const actuals = draft.playerOrder.map((playerId) => draft.actuals[playerId]);
  const allEstimatesEntered = estimates.every((value) => value !== undefined);

  if (!allEstimatesEntered) errors.push('All four estimates are required.');
  if (allEstimatesEntered && sumValues(draft.estimates) === 13) {
    errors.push('Total estimates cannot equal 13.');
  }
  if (allEstimatesEntered && resolveHighestEstimatePlayerId(draft) === undefined) {
    errors.push('A unique highest estimate is required.');
  }
  if (actuals.some((value) => value === undefined) || sumValues(draft.actuals) !== 13) {
    errors.push('Actual tricks must total 13.');
  }
  if (draft.trumpSuit === undefined) errors.push('Trump suit is required.');

  return errors;
}