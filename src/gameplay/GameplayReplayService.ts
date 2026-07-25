import { GameplayCommandProcessor } from './GameplayCommandProcessor.js';
import type {
  GameplayCommandRecord,
  GameplayReplayResult,
  HouseRulesRoundState,
} from './types.js';

export class GameplayReplayService {
  constructor(private readonly commandProcessor = new GameplayCommandProcessor()) {}

  replay(
    initialState: HouseRulesRoundState,
    records: readonly GameplayCommandRecord[],
  ): GameplayReplayResult {
    let state = initialState;
    let version = 0;
    let replayedRecords: readonly GameplayCommandRecord[] = [];
    const commandIds = new Set<string>();

    for (const record of records) {
      if (commandIds.has(record.commandId)) {
        return this.reject(state, version, `Command history contains duplicate command id ${record.commandId}.`);
      }
      commandIds.add(record.commandId);

      const expectedResultingVersion = record.accepted ? version + 1 : version;
      if (record.resultingVersion !== expectedResultingVersion) {
        return this.reject(
          state,
          version,
          `${record.accepted ? 'Accepted' : 'Rejected'} command ${record.commandId} must result in version ${expectedResultingVersion}, not ${record.resultingVersion}.`,
        );
      }

      const replayed = this.commandProcessor.process(
        state,
        version,
        replayedRecords,
        {
          commandId: record.commandId,
          expectedVersion: record.expectedVersion,
          command: record.command,
        },
      );

      const transitionMatches = replayed.valid === record.accepted
        && replayed.version === record.resultingVersion
        && this.sameValue(replayed.errors, record.errors)
        && replayed.record !== undefined
        && this.sameValue(replayed.record.transition, record.transition);

      if (!transitionMatches) {
        return this.reject(
          state,
          version,
          `Command ${record.commandId} does not reproduce its recorded transition.`,
        );
      }

      state = replayed.state;
      version = replayed.version;
      replayedRecords = replayed.records;
    }

    return {
      valid: true,
      errors: [],
      state,
      version,
    };
  }

  private sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private reject(
    state: HouseRulesRoundState,
    version: number,
    error: string,
  ): GameplayReplayResult {
    return {
      valid: false,
      errors: [error],
      state,
      version,
    };
  }
}
