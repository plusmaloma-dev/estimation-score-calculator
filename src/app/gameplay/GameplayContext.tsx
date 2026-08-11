import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { AuthResult, AuthSessionState } from '../../online/auth/types.js';
import type { ActiveGameControlService } from '../../online/gameplay/ActiveGameControlService.js';
import type { ActiveGameRealtimeSynchronizer } from '../../online/gameplay/ActiveGameRealtimeSynchronizer.js';
import type { GameplayRoundRealtimeSynchronizer } from '../../online/gameplay/GameplayRoundRealtimeSynchronizer.js';
import type { GameplayTableRealtimeSynchronizer } from '../../online/gameplay/GameplayTableRealtimeSynchronizer.js';
import type { OnlineGameplayRoundService } from '../../online/gameplay/OnlineGameplayRoundService.js';
import type { OnlineGameplayTableService } from '../../online/gameplay/OnlineGameplayTableService.js';

export type Awaitable<T> = T | Promise<T>;

export interface GameplayAuthPort {
  getSession(): Promise<AuthResult<AuthSessionState | undefined>>;
  signIn(email: string, password: string): Promise<AuthResult<AuthSessionState>>;
  signOut(): Promise<AuthResult<void>>;
}

export type GameplayTablePort = Pick<OnlineGameplayTableService,
  | 'createTable'
  | 'listLobby'
  | 'openTable'
  | 'updateSettings'
  | 'joinTable'
  | 'requestJoin'
  | 'respondJoinRequest'
  | 'leaveTable'
  | 'startTable'
>;

export type ActiveGameControlPort = Pick<ActiveGameControlService,
  | 'initialize'
  | 'getSnapshot'
  | 'pause'
  | 'resume'
  | 'terminate'
  | 'disconnect'
  | 'reconnect'
  | 'evaluateGrace'
  | 'evaluateDeadlines'
  | 'startTurn'
  | 'beginBotAction'
  | 'completeActionBoundary'
>;

export type ActiveGameRealtimePort = Pick<ActiveGameRealtimeSynchronizer,
  | 'connect'
  | 'disconnect'
  | 'refresh'
  | 'runMutation'
>;

export type GameplayRoundPort = Pick<OnlineGameplayRoundService,
  | 'getSnapshot'
  | 'submitBid'
  | 'playCard'
> & Partial<Pick<OnlineGameplayRoundService,
  | 'submitAuctionAction'
  | 'startGame'
  | 'processBotDirective'
  | 'startNextRound'
>>;

export type GameplayRoundRealtimePort = Pick<GameplayRoundRealtimeSynchronizer,
  | 'connect'
  | 'disconnect'
  | 'refresh'
  | 'runMutation'
>;

export type GameplayTableRealtimePort = Pick<GameplayTableRealtimeSynchronizer,
  | 'connect'
  | 'disconnect'
  | 'refresh'
>;

export interface GameplaySessionServices {
  readonly gameplayTables?: GameplayTablePort;
  readonly gameplayTableRealtime?: GameplayTableRealtimePort;
  readonly activeGameControl?: ActiveGameControlPort;
  readonly activeGameRealtime?: ActiveGameRealtimePort;
  readonly gameplayRound?: GameplayRoundPort;
  readonly gameplayRoundRealtime?: GameplayRoundRealtimePort;
}

export interface GameplayApplicationServices extends GameplaySessionServices {
  readonly auth?: GameplayAuthPort;
  readonly onlineSessionFactory?: (session: AuthSessionState) => GameplaySessionServices;
}

export type GameplayRoute =
  | 'gameplay-home'
  | 'gameplay-lobby'
  | 'gameplay-table'
  | 'active-game';

interface GameplayState {
  readonly route: GameplayRoute;
  readonly activeGameplayTableId?: string;
}

type GameplayAction =
  | { readonly type: 'navigate'; readonly route: GameplayRoute }
  | { readonly type: 'open-table'; readonly tableId: string }
  | { readonly type: 'open-active-game'; readonly tableId: string };

export interface GameplayNavigationController extends GameplayState {
  readonly navigate: (route: GameplayRoute) => void;
  readonly openGameplayTable: (tableId: string) => void;
  readonly openActiveGame: (tableId: string) => void;
}

interface GameplayContextValue extends GameplayNavigationController {
  readonly services: GameplayApplicationServices;
}

const GameplayContext = createContext<GameplayContextValue | undefined>(undefined);

function reducer(state: GameplayState, action: GameplayAction): GameplayState {
  switch (action.type) {
    case 'navigate':
      return { ...state, route: action.route };
    case 'open-table':
      return { route: 'gameplay-table', activeGameplayTableId: action.tableId };
    case 'open-active-game':
      return { route: 'active-game', activeGameplayTableId: action.tableId };
  }
}

export function GameplayContextProvider({
  children,
  services,
  initialRoute = 'gameplay-home',
  navigation,
}: {
  readonly children: ReactNode;
  readonly services: GameplayApplicationServices;
  readonly initialRoute?: GameplayRoute;
  readonly navigation?: GameplayNavigationController;
}) {
  const [internalState, dispatch] = useReducer(reducer, { route: initialRoute });
  const internalNavigation = useMemo<GameplayNavigationController>(() => ({
    ...internalState,
    navigate: (route) => dispatch({ type: 'navigate', route }),
    openGameplayTable: (tableId) => dispatch({ type: 'open-table', tableId }),
    openActiveGame: (tableId) => dispatch({ type: 'open-active-game', tableId }),
  }), [internalState]);
  const resolvedNavigation = navigation ?? internalNavigation;
  const value = useMemo<GameplayContextValue>(() => ({
    ...resolvedNavigation,
    services,
  }), [resolvedNavigation, services]);

  return <GameplayContext.Provider value={value}>{children}</GameplayContext.Provider>;
}

export function useGameplayApp(): GameplayContextValue {
  const value = useContext(GameplayContext);
  if (value === undefined) {
    throw new Error('useGameplayApp must be used inside GameplayContextProvider.');
  }
  return value;
}
