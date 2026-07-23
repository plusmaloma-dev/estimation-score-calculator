import { LifecycleBrowserUiShellService, LocalStorageScoreSheetRepository } from '../../index.js';
import { AuthService } from '../../online/auth/AuthService.js';
import { readOnlineConfig, type OnlineEnvironment } from '../../online/config.js';
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
  };
}
