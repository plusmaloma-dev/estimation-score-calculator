import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type {
  UiCreateScoreSheetInput,
  UiCreateScoreSheetResult,
  UiGameLifecycleResult,
  UiOpenSessionResult,
  UiOverrideRoundScoresInput,
  UiOverrideRoundScoresResult,
  UiRoundEntryInput,
  UiSaveRoundResult,
  UiSessionHistoryItem,
  UiValidationResult,
} from '../index.js';
import type { AuthSessionState } from '../online/auth/types.js';
import type { PlayerDirectoryPort } from '../online/players/types.js';
import type { AppAction, AppRoute, AppState } from './appTypes.js';
import {
  GameplayContextProvider,
  type ActiveGameControlPort as GameplayActiveGameControlPort,
  type ActiveGameRealtimePort as GameplayActiveGameRealtimePort,
  type GameplayApplicationServices,
  type GameplayAuthPort,
  type GameplayNavigationController,
  type GameplayRoundPort as GameplayRoundServicePort,
  type GameplayRoundRealtimePort as GameplayRoundRealtimeServicePort,
  type GameplayTableRealtimePort as GameplayTableRealtimeServicePort,
  type GameplayRoute,
  type GameplaySessionServices,
  type GameplayTablePort as GameplayTableServicePort,
} from './gameplay/GameplayContext.js';
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
  createScoreSheet(input: UiCreateScoreSheetInput): Awaitable<UiCreateScoreSheetResult>;
  openSession(scoreSheetId: string): Awaitable<UiOpenSessionResult>;
  saveRound(scoreSheetId: string, input: UiRoundEntryInput, nowIso?: string): Awaitable<UiSaveRoundResult>;
  overrideRoundScores?(
    scoreSheetId: string,
    input: UiOverrideRoundScoresInput,
  ): Awaitable<UiOverrideRoundScoresResult>;
  finalizeGame?(scoreSheetId: string, actorId: string, nowIso?: string): Awaitable<UiGameLifecycleResult>;
  reopenGame?(scoreSheetId: string, actorId: string, nowIso?: string): Awaitable<UiGameLifecycleResult>;
  heartbeatGameLock?(scoreSheetId: string): Awaitable<UiValidationResult>;
  releaseGameLock?(scoreSheetId: string): Awaitable<UiValidationResult>;
  forceReleaseGameLock?(scoreSheetId: string): Awaitable<UiValidationResult>;
}

export type AuthPort = GameplayAuthPort;
export type GameplayTablePort = GameplayTableServicePort;
export type ActiveGameControlPort = GameplayActiveGameControlPort;
export type ActiveGameRealtimePort = GameplayActiveGameRealtimePort;
export type GameplayRoundPort = GameplayRoundServicePort;
export type GameplayRoundRealtimePort = GameplayRoundRealtimeServicePort;
export type GameplayTableRealtimePort = GameplayTableRealtimeServicePort;

export interface SessionApplicationServices extends GameplaySessionServices {
  readonly shell: BrowserShellPort;
  readonly playerDirectory: PlayerDirectoryPort;
}

export interface AppServices extends SessionApplicationServices {
  readonly auth?: AuthPort;
  readonly onlineSessionFactory?: (session: AuthSessionState) => SessionApplicationServices;
}

interface AppContextValue extends AppState {
  readonly services: AppServices;
  readonly navigate: (route: AppRoute) => void;
  readonly openScoreSheet: (scoreSheetId: string) => void;
  readonly openGameplayTable: (tableId: string) => void;
  readonly openActiveGame: (tableId: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'navigate':
      return { ...state, route: action.route };
    case 'open-score-sheet':
      return { route: 'score-sheet', activeScoreSheetId: action.scoreSheetId };
    case 'open-gameplay-table':
      return { route: 'gameplay-table', activeGameplayTableId: action.tableId };
    case 'open-active-game':
      return { route: 'active-game', activeGameplayTableId: action.tableId };
  }
}

function gameplayRoute(route: AppRoute): GameplayRoute {
  if (route === 'gameplay-lobby' || route === 'gameplay-table' || route === 'active-game') {
    return route;
  }
  return 'gameplay-home';
}

function selectGameplaySessionServices(
  services: GameplaySessionServices,
): GameplaySessionServices {
  return {
    gameplayTables: services.gameplayTables,
    gameplayTableRealtime: services.gameplayTableRealtime,
    activeGameControl: services.activeGameControl,
    activeGameRealtime: services.activeGameRealtime,
    gameplayRound: services.gameplayRound,
    gameplayRoundRealtime: services.gameplayRoundRealtime,
  };
}

function selectGameplayServices(services: AppServices): GameplayApplicationServices {
  return {
    auth: services.auth,
    ...selectGameplaySessionServices(services),
    onlineSessionFactory: services.onlineSessionFactory === undefined
      ? undefined
      : (session) => selectGameplaySessionServices(services.onlineSessionFactory!(session)),
  };
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
    openGameplayTable: (tableId) => dispatch({ type: 'open-gameplay-table', tableId }),
    openActiveGame: (tableId) => dispatch({ type: 'open-active-game', tableId }),
  }), [resolvedServices, state]);
  const gameplayServices = useMemo(
    () => selectGameplayServices(resolvedServices),
    [resolvedServices],
  );
  const gameplayNavigation = useMemo<GameplayNavigationController>(() => ({
    route: gameplayRoute(state.route),
    activeGameplayTableId: state.activeGameplayTableId,
    navigate: (route) => dispatch({
      type: 'navigate',
      route: route === 'gameplay-home' ? 'home' : route,
    }),
    openGameplayTable: (tableId) => dispatch({ type: 'open-gameplay-table', tableId }),
    openActiveGame: (tableId) => dispatch({ type: 'open-active-game', tableId }),
  }), [state]);

  return (
    <AppContext.Provider value={value}>
      <GameplayContextProvider services={gameplayServices} navigation={gameplayNavigation}>
        {children}
      </GameplayContextProvider>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === undefined) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
