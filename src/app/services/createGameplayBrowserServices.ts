import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../online/auth/AuthService.js';
import {
  readOnlineConfig,
  type OnlineConfig,
  type OnlineEnvironment,
} from '../../online/config.js';
import {
  ActiveGameControlService,
  type ActiveGameControlDatabase,
} from '../../online/gameplay/ActiveGameControlService.js';
import {
  ActiveGameRealtimeSynchronizer,
  type GameplayRealtimeClient,
} from '../../online/gameplay/ActiveGameRealtimeSynchronizer.js';
import {
  GameplayRoundRealtimeSynchronizer,
  type GameplayRoundRealtimeClient,
} from '../../online/gameplay/GameplayRoundRealtimeSynchronizer.js';
import {
  GameplayTableRealtimeSynchronizer,
  type GameplayTableRealtimeClient,
} from '../../online/gameplay/GameplayTableRealtimeSynchronizer.js';
import {
  OnlineGameplayRoundService,
  type GameplayRoundFunctionClient,
} from '../../online/gameplay/OnlineGameplayRoundService.js';
import {
  OnlineGameplayTableService,
  type OnlineGameplayTableDatabase,
} from '../../online/gameplay/OnlineGameplayTableService.js';
import { createSupabaseBrowserClient } from '../../online/supabaseClient.js';
import type {
  GameplayApplicationServices,
  GameplayRoundPort,
  GameplaySessionServices,
} from '../gameplay/GameplayContext.js';

export function createGameplayServicesForClient(
  client: SupabaseClient,
  config: OnlineConfig,
): GameplayApplicationServices {
  return {
    auth: new AuthService(client, config.workspaceSlug),
    onlineSessionFactory: (session): GameplaySessionServices => {
      const gameplayTables = new OnlineGameplayTableService(
        client as unknown as OnlineGameplayTableDatabase,
        session,
      );
      const activeGameControl = new ActiveGameControlService(
        client as unknown as ActiveGameControlDatabase,
        session,
      );
      const gameplayRound: GameplayRoundPort = new OnlineGameplayRoundService(
        client as unknown as GameplayRoundFunctionClient,
      );

      return {
        gameplayTables,
        gameplayTableRealtime: new GameplayTableRealtimeSynchronizer(
          client as unknown as GameplayTableRealtimeClient,
          gameplayTables,
        ),
        activeGameControl,
        activeGameRealtime: new ActiveGameRealtimeSynchronizer(
          client as unknown as GameplayRealtimeClient,
          activeGameControl,
        ),
        gameplayRound,
        gameplayRoundRealtime: new GameplayRoundRealtimeSynchronizer(
          client as unknown as GameplayRoundRealtimeClient,
          gameplayRound,
        ),
      };
    },
  };
}

export function createGameplayBrowserServices(
  env: OnlineEnvironment = import.meta.env,
): GameplayApplicationServices {
  const config = readOnlineConfig(env);
  if (config === undefined) return {};
  return createGameplayServicesForClient(createSupabaseBrowserClient(config), config);
}
