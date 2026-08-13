import { ActiveControlCommandProcessor } from './ActiveControlCommandProcessor.js';
import type {
  ActiveControlCommandRecord,
  ActiveControlReplayResult,
  ActiveGameControlState,
} from './types.js';

export class ActiveControlReplayService {
  constructor(
    private readonly processor = new ActiveControlCommandProcessor(),
  ) {}

  replay(
    initialState: ActiveGameControlState,
    records: readonly ActiveControlCommandRecord[],
  ): ActiveControlReplayResult {
    let state = initialState;
    let version = 0;
    let replayedRecords: readonly ActiveControlCommandRecord[] = [];

    for (const record of records) {
      if (record.accepted && record.expectedVersion !== version) {
        return this.failure(
          state,
          version,
          replayedRecords.length,
          `Control replay expected version ${record.expectedVersion} does not match replay version ${version} for command ${record.commandId}.`,
        );
      }

      const expectedResultingVersion = record.accepted ? version + 1 : version;
      if (record.resultingVersion !== expectedResultingVersion) {
        return this.failure(
          state,
          version,
          replayedRecords.length,
          record.accepted
            ? `Accepted control command ${record.commandId} must advance replay version to ${expectedResultingVersion}.`
            : `Rejected control command ${record.commandId} must retain replay version ${expectedResultingVersion}.`,
        );
      }

      const result = this.processor.process(
        state,
        version,
        replayedRecords,
        {
          commandId: record.commandId,
          expectedVersion: record.expectedVersion,
          actorUserId: record.actorUserId,
          occurredAt: record.occurredAt,
          command: record.command,
        },
      );

      if (result.record === undefined) {
        return this.failure(
          state,
          version,
          replayedRecords.length,
          `Control replay produced no record for command ${record.commandId}.`,
        );
      }

      if (!this.sameRecord(result.record, record)) {
        return this.failure(
          state,
          version,
          replayedRecords.length,
          `Control command ${record.commandId} does not match the deterministic replay outcome.`,
        );
      }

      state = result.state;
      version = result.version;
      replayedRecords = result.records;
    }

    return {
      valid: true,
      errors: [],
      state,
      version,
      recordsReplayed: replayedRecords.length,
    };
  }

  private sameRecord(
    actual: ActiveControlCommandRecord,
    expected: ActiveControlCommandRecord,
  ): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  private failure(
    state: ActiveGameControlState,
    version: number,
    recordsReplayed: number,
    error: string,
  ): ActiveControlReplayResult {
    return {
      valid: false,
      errors: [error],
      state,
      version,
      recordsReplayed,
    };
  }
}
