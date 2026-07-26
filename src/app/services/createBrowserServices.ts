import { LifecycleBrowserUiShellService, LocalStorageScoreSheetRepository } from '../../index.js';
import { AuthService } from '../../online/auth/AuthService.js';
import { readOnlineConfig, type OnlineEnvironment } from '../../online/config.js';
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
  OnlineGameplayRoundService,
  type GameplayRoundFunctionClient,
} from '../../online/gameplay/OnlineGameplayRoundService.js';
import {
  OnlineGameplayTableService,
  type OnlineGameplayTableDatabase,
} from '../../online/gameplay/OnlineGameplayTableService.js';
import { OnlineBrowserShellService, type OnlineShellDatabase } from '../../online/games/OnlineBrowserShellService.js';
import { PlayerDirectoryService, type PlayerDirectoryDatabase } from '../../online/players/PlayerDirectoryService.js';
import { createSupabaseBrowserClient } from '../../online/supabaseClient.js';
import type { AppServices } from '../AppContext.js';
import { LocalPlayerDirectoryService } from './LocalPlayerDirectoryService.js';

export function createBrowserServices(
  storage: Storage = window.localStorage,
  env: OnlineEnvironment = import.meta.env,
): AppServices {
  const repository = new LocalStorageScoreSheetRepository(storage);
  const localServices = {
    shell: new LifecycleBrowserUiShellService(repository),
    playerDirectory: new LocalPlayerDirectoryService(storage),
  };
  const config = readOnlineConfig(env);
  if (config === undefined) return localServices;

  const client = createSupabaseBrowserClient(config);
  return {
    ...localServices,
    auth: new AuthService(client, config.workspaceSlug),
    onlineSessionFactory: (session) => {
      const activeGameControl = new ActiveGameControlService(
        client as unknown as ActiveGameControlDatabase,
        session,
      );
      const gameplayRound = new OnlineGameplayRoundService(
        client as unknown as GameplayRoundFunctionClient,
      );
      return {
        shell: new OnlineBrowserShellService(client as unknown as OnlineShellDatabase, session),
        playerDirectory: new PlayerDirectoryService(
          client as unknown as PlayerDirectoryDatabase,
          session.membership.workspaceId,
          session.user.id,
        ),
        gameplayTables: new OnlineGameplayTableService(
          client as unknown as OnlineGameplayTableDatabase,
          session,
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
