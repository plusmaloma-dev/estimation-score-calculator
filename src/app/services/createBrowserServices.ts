import { LifecycleBrowserUiShellService, LocalStorageScoreSheetRepository } from '../../index.js';
import type { AppServices } from '../AppContext.js';
import { LocalPlayerDirectoryService } from './LocalPlayerDirectoryService.js';

export function createBrowserServices(storage: Storage = window.localStorage): AppServices {
  const repository = new LocalStorageScoreSheetRepository(storage);
  return {
    shell: new LifecycleBrowserUiShellService(repository),
    playerDirectory: new LocalPlayerDirectoryService(storage),
  };
}
