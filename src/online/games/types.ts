import type { ScoringRuleSetId } from '../../scoring/ruleSets.js';

export interface OnlineGameResult<T> {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly value?: T;
}

export interface OnlineGamePlayerInput {
  readonly id: string;
  readonly name: string;
}

export interface OnlineCreateGameInput {
  readonly name: string;
  readonly ruleSet: ScoringRuleSetId;
  readonly players: readonly OnlineGamePlayerInput[];
}

export interface OnlineCreatedGame {
  readonly gameId: string;
}

export interface OnlineLifecycleState {
  readonly gameId: string;
  readonly status: 'draft' | 'finalized';
  readonly version?: number;
}

export interface OnlineSaveRoundPayload {
  readonly roundNumber: number;
  readonly roundInput: unknown;
  readonly roundResult: unknown;
  readonly expectedVersion: number;
}

export interface OnlineSavedRound {
  readonly gameId: string;
  readonly roundNumber: number;
  readonly version: number;
}
