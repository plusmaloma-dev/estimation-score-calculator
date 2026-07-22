import type { ContractSuit } from '../../index.js';

export interface CurrentRoundDraft {
  readonly playerOrder: readonly string[];
  readonly estimates: Readonly<Record<string, number | undefined>>;
  readonly actuals: Readonly<Record<string, number | undefined>>;
  readonly bidOwnerPlayerId?: string;
  readonly trumpSuit?: ContractSuit;
  readonly overUnder: number;
}

export type CurrentRoundAction =
  | { readonly type: 'set-estimate'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-actual'; readonly playerId: string; readonly value: number | undefined }
  | { readonly type: 'set-bid-owner'; readonly playerId: string }
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

export function currentRoundReducer(draft: CurrentRoundDraft, action: CurrentRoundAction): CurrentRoundDraft {
  switch (action.type) {
    case 'set-estimate': {
      assertPlayer(draft, action.playerId);
      return withOverUnder({ ...draft, estimates: { ...draft.estimates, [action.playerId]: action.value } });
    }
    case 'set-actual': {
      assertPlayer(draft, action.playerId);
      return { ...draft, actuals: { ...draft.actuals, [action.playerId]: action.value } };
    }
    case 'set-bid-owner':
      assertPlayer(draft, action.playerId);
      return { ...draft, bidOwnerPlayerId: action.playerId };
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

  if (estimates.some((value) => value === undefined)) errors.push('All four estimates are required.');
  if (estimates.every((value) => value !== undefined) && sumValues(draft.estimates) === 13) {
    errors.push('Total estimates cannot equal 13.');
  }
  if (actuals.some((value) => value === undefined) || sumValues(draft.actuals) !== 13) {
    errors.push('Actual tricks must total 13.');
  }
  if (draft.bidOwnerPlayerId === undefined) errors.push('Bid winner is required.');
  if (draft.trumpSuit === undefined) errors.push('Trump suit is required.');

  return errors;
}
