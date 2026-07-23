import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type {
  UiCreateScoreSheetInput,
  UiCreateScoreSheetResult,
  UiGameLifecycleResult,
  UiOpenSessionResult,
  UiRoundEntryInput,
  UiSaveRoundResult,
  UiSessionHistoryItem,
} from '../index.js';
import type { AuthResult, AuthSessionState } from '../online/auth/types.js';
import type { PlayerDirectoryPort } from '../online/players/types.js';
import type { AppAction, AppRoute, AppState } from './appTypes.js';
import { createBrowserServices } from './services/createBrowserServices.js';

export type Awaitable<T> = T | Promise<T>;

export interface AppSessionHistoryItem extends UiSessionHistoryItem {
  readonly createdAtIso: string;
  readonly createdAtLabel: string;
}

export interface AppSessionHistoryResult {
  readonly sessions: readonly AppSessionHistoryItem[];
}

export interface BrowserShellPort {
  getSessionHistory(): Awaitable<AppSessionHistoryResult>;
  createScoreSheet(input: UiCreateScoreSheetInput): UiCreateScoreSheetResult;
  openSession(scoreSheetId: string): UiOpenSessionResult;
  saveRound(scoreSheetId: string, input: UiRoundEntryInput, nowIso?: string): UiSaveRoundResult;
  finalizeGame?(scoreSheetId: string, actorId: string, nowIso?: string): UiGameLifecycleResult;
  reopenGame?(scoreSheetId: string, actorId: string, nowIso?: string): UiGameLifecycleResult;
}

export interface AuthPort {
  getSession(): Promise<AuthResult<AuthSessionState | undefined>>;
  signIn(email: string, password: string): Promise<AuthResult<AuthSessionState>>;
  signOut(): Promise<AuthResult<void>>;
}

export interface AppServices {
  readonly shell: BrowserShellPort;
  readonly playerDirectory: PlayerDirectoryPort;
  readonly auth?: AuthPort;
}

interface AppContextValue extends AppState {
  readonly services: AppServices;
  readonly navigate: (route: AppRoute) => void;
  readonly openScoreSheet: (scoreSheetId: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'navigate':
      return { ...state, route: action.route };
    case 'open-score-sheet':
      return { route: 'score-sheet', activeScoreSheetId: action.scoreSheetId };
  }
}

export function AppProvider({
  children,
  services,
  initialRoute = 'home',
}: {
  readonly children: ReactNode;
  readonly services?: AppServices;
  readonly initialRoute?: AppRoute;
}) {
  const resolvedServices = useMemo(() => services ?? createBrowserServices(), [services]);
  const [state, dispatch] = useReducer(reducer, { route: initialRoute });
  const value = useMemo<AppContextValue>(() => ({
    ...state,
    services: resolvedServices,
    navigate: (route) => dispatch({ type: 'navigate', route }),
    openScoreSheet: (scoreSheetId) => dispatch({ type: 'open-score-sheet', scoreSheetId }),
  }), [resolvedServices, state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === undefined) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
