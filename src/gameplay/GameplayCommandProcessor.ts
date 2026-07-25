import { HouseRulesRoundEngine } from './HouseRulesRoundEngine.js';
import type {
  GameplayCommandEnvelope,
  GameplayCommandProcessResult,
  GameplayCommandRecord,
  GameplayStateTransition,
  HouseRulesRoundState,
} from './types.js';

export class GameplayCommandProcessor {
  constructor(private readonly roundEngine = new HouseRulesRoundEngine()) {}

  process(
    state: HouseRulesRoundState,
    version: number,
    records: readonly GameplayCommandRecord[],
    envelope: GameplayCommandEnvelope,
  ): GameplayCommandProcessResult {
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
          errors: [`Command id ${envelope.commandId} was already used with a different payload.`],
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
      const transition: GameplayStateTransition = {
        valid: false,
        errors: [`Expected game version ${envelope.expectedVersion} does not match current version ${version}.`],
        state,
      };
      return this.recordResult(state, version, records, envelope, transition);
    }

    const transition = envelope.command.type === 'SUBMIT_BID'
      ? this.roundEngine.submitBid(state, envelope.command.seat, envelope.command.bid)
      : this.roundEngine.playCard(state, envelope.command.seat, envelope.command.card);

    return this.recordResult(state, version, records, envelope, transition);
  }

  private recordResult(
    currentState: HouseRulesRoundState,
    currentVersion: number,
    records: readonly GameplayCommandRecord[],
    envelope: GameplayCommandEnvelope,
    transition: GameplayStateTransition,
  ): GameplayCommandProcessResult {
    const resultingVersion = transition.valid ? currentVersion + 1 : currentVersion;
    const record: GameplayCommandRecord = {
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

  private validateInput(version: number, envelope: GameplayCommandEnvelope): readonly string[] {
    const errors: string[] = [];

    if (!Number.isInteger(version) || version < 0) {
      errors.push('Current game version must be a non-negative integer.');
    }
    if (!envelope.commandId.trim()) {
      errors.push('Command id is required.');
    }
    if (!Number.isInteger(envelope.expectedVersion) || envelope.expectedVersion < 0) {
      errors.push('Expected game version must be a non-negative integer.');
    }

    return errors;
  }

  private sameEnvelope(
    existing: GameplayCommandRecord,
    incoming: GameplayCommandEnvelope,
  ): boolean {
    return existing.expectedVersion === incoming.expectedVersion
      && JSON.stringify(existing.command) === JSON.stringify(incoming.command);
  }
}
