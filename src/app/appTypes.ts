export type AppRoute = 'home' | 'new-game' | 'score-sheet';

export interface AppState {
  readonly route: AppRoute;
  readonly activeScoreSheetId?: string;
}

export type AppAction =
  | { readonly type: 'navigate'; readonly route: AppRoute }
  | { readonly type: 'open-score-sheet'; readonly scoreSheetId: string };
