import { BrowserUiShellService, LocalStorageScoreSheetRepository } from '../../index.js';
import type { AppServices } from '../AppContext.js';

export function createBrowserServices(storage: Storage = window.localStorage): AppServices {
  const repository = new LocalStorageScoreSheetRepository(storage);
  return { shell: new BrowserUiShellService(repository) };
}
