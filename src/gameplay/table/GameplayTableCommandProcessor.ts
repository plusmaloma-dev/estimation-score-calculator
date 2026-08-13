import { GameplayTableEngine } from './GameplayTableEngine.js';
import type {
  GameplayTableCommandEnvelope,
  GameplayTableCommandProcessResult,
  GameplayTableCommandRecord,
  GameplayTableState,
  GameplayTableTransition,
} from './types.js';

export class GameplayTableCommandProcessor {
  constructor(private readonly tableEngine = new GameplayTableEngine()) {}

  process(
    state: GameplayTableState,
    version: number,
    records: readonly GameplayTableCommandRecord[],
    envelope: GameplayTableCommandEnvelope,
  ): GameplayTableCommandProcessResult {
    const inputErrors = this.validateInput(version, envelope);
    if (inputErrors.length > 0) {
      return {
        valid: false,
        errors: inputErrors,
        duplicate: false,
        state,
        version,
        records,
      };
    }

    const existing = records.find((record) => record.commandId === envelope.commandId);
    if (existing !== undefined) {
      if (!this.sameEnvelope(existing, envelope)) {
        return {
          valid: false,
          errors: [
            `Table command id ${envelope.commandId} was already used with a different envelope.`,
          ],
          duplicate: false,
          state,
          version,
          records,
        };
      }

      return {
        valid: existing.accepted,
        errors: existing.errors,
        duplicate: true,
        state,
        version,
        records,
        record: existing,
      };
    }

    if (envelope.expectedVersion !== version) {
      return this.recordResult(state, version, records, envelope, {
        valid: false,
        errors: [
          `Expected table version ${envelope.expectedVersion} does not match current version ${version}.`,
        ],
        state,
      });
    }

    return this.recordResult(
      state,
      version,
      records,
      envelope,
      this.apply(state, envelope),
    );
  }

  private apply(
    state: GameplayTableState,
    envelope: GameplayTableCommandEnvelope,
  ): GameplayTableTransition {
    const { actorUserId, occurredAt, command } = envelope;

    switch (command.type) {
      case 'UPDATE_SETTINGS':
        return this.tableEngine.updateSettings(state, actorUserId, command.patch);
      case 'JOIN_OPEN':
        return this.tableEngine.joinOpenTable(state, {
          userId: actorUserId,
          displayName: command.input.displayName,
          joinedAt: occurredAt,
          ...(command.input.requestedSeat === undefined
            ? {}
            : { requestedSeat: command.input.requestedSeat }),
          ...(command.input.privateAccessGranted === undefined
            ? {}
            : { privateAccessGranted: command.input.privateAccessGranted }),
        });
      case 'REQUEST_JOIN':
        return this.tableEngine.requestJoin(state, {
          requestId: command.input.requestId,
          userId: actorUserId,
          displayName: command.input.displayName,
          requestedAt: occurredAt,
          ...(command.input.requestedSeat === undefined
            ? {}
            : { requestedSeat: command.input.requestedSeat }),
        });
      case 'RESPOND_JOIN_REQUEST':
        return this.tableEngine.respondToJoinRequest(
          state,
          actorUserId,
          command.requestId,
          command.decision,
          occurredAt,
        );
      case 'LEAVE_LOBBY':
        return this.tableEngine.leaveLobby(state, actorUserId, occurredAt);
      case 'START':
        return this.tableEngine.start(state, actorUserId, occurredAt);
    }
  }

  private recordResult(
    currentState: GameplayTableState,
    currentVersion: number,
    records: readonly GameplayTableCommandRecord[],
    envelope: GameplayTableCommandEnvelope,
    transition: GameplayTableTransition,
  ): GameplayTableCommandProcessResult {
    const resultingVersion = transition.valid ? currentVersion + 1 : currentVersion;
    const record: GameplayTableCommandRecord = {
      ...envelope,
      accepted: transition.valid,
      resultingVersion,
      errors: transition.errors,
      transition,
    };

    return {
      valid: transition.valid,
      errors: transition.errors,
      duplicate: false,
      state: transition.valid ? transition.state : currentState,
      version: resultingVersion,
      records: [...records, record],
      record,
    };
  }

  private validateInput(
    version: number,
    envelope: GameplayTableCommandEnvelope,
  ): readonly string[] {
    const errors: string[] = [];
    if (!Number.isInteger(version) || version < 0) {
      errors.push('Current table version must be a non-negative integer.');
    }
    if (!envelope.commandId.trim()) {
      errors.push('Table command id is required.');
    }
    if (!Number.isInteger(envelope.expectedVersion) || envelope.expectedVersion < 0) {
      errors.push('Expected table version must be a non-negative integer.');
    }
    if (!envelope.actorUserId.trim()) {
      errors.push('Table command actor is required.');
    }
    if (!envelope.occurredAt.trim()) {
      errors.push('Table command occurrence time is required.');
    }
    return errors;
  }

  private sameEnvelope(
    existing: GameplayTableCommandRecord,
    incoming: GameplayTableCommandEnvelope,
  ): boolean {
    return existing.expectedVersion === incoming.expectedVersion
      && existing.actorUserId === incoming.actorUserId
      && existing.occurredAt === incoming.occurredAt
      && JSON.stringify(existing.command) === JSON.stringify(incoming.command);
  }
}
