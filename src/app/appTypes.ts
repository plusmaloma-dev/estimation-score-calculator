export type AppRoute =
  | 'home'
  | 'new-game'
  | 'score-sheet'
  | 'gameplay-lobby'
  | 'gameplay-table'
  | 'active-game';

export interface AppState {
  readonly route: AppRoute;
  readonly activeScoreSheetId?: string;
  readonly activeGameplayTableId?: string;
}

export type AppAction =
  | { readonly type: 'navigate'; readonly route: AppRoute }
  | { readonly type: 'open-score-sheet'; readonly scoreSheetId: string }
  | { readonly type: 'open-gameplay-table'; readonly tableId: string }
  | { readonly type: 'open-active-game'; readonly tableId: string };
