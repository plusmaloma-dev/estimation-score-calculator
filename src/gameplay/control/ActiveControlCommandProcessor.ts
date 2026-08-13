import { ActiveGameControlEngine } from './ActiveGameControlEngineWithTurns.js';
import { ActiveGameDeadlineService } from './ActiveGameDeadlineService.js';
import type {
  ActiveControlCommandEnvelope,
  ActiveControlCommandProcessResult,
  ActiveControlCommandRecord,
  ActiveControlTransition,
  ActiveGameControlState,
  BotActionDirective,
} from './types.js';

interface AppliedControlCommand {
  readonly transition: ActiveControlTransition;
  readonly directives: readonly BotActionDirective[];
}

export class ActiveControlCommandProcessor {
  constructor(
    private readonly controlEngine = new ActiveGameControlEngine(),
    private readonly deadlineService = new ActiveGameDeadlineService(),
  ) {}

  process(
    state: ActiveGameControlState,
    version: number,
    records: readonly ActiveControlCommandRecord[],
    envelope: ActiveControlCommandEnvelope,
  ): ActiveControlCommandProcessResult {
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
            `Active control command id ${envelope.commandId} was already used with a different envelope.`,
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
        transition: {
          valid: false,
          errors: [
            `Expected active control version ${envelope.expectedVersion} does not match current version ${version}.`,
          ],
          state,
          events: [],
        },
        directives: [],
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
    state: ActiveGameControlState,
    envelope: ActiveControlCommandEnvelope,
  ): AppliedControlCommand {
    const { actorUserId, occurredAt, command } = envelope;

    switch (command.type) {
      case 'PAUSE':
        return this.fromTransition(
          this.controlEngine.pause(state, actorUserId, occurredAt),
        );
      case 'RESUME':
        return this.fromTransition(
          this.controlEngine.resume(state, actorUserId, occurredAt),
        );
      case 'TERMINATE':
        return this.fromTransition(
          this.controlEngine.terminate(
            state,
            actorUserId,
            command.confirmed,
            occurredAt,
          ),
        );
      case 'DISCONNECT':
        if (command.userId !== actorUserId) {
          return this.rejected(
            state,
            'A user may submit a disconnect command only for their own seat.',
          );
        }
        return this.fromTransition(
          this.controlEngine.disconnect(state, command.userId, occurredAt),
        );
      case 'RECONNECT':
        if (command.userId !== actorUserId) {
          return this.rejected(
            state,
            'A user may submit a reconnect command only for their own seat.',
          );
        }
        return this.fromTransition(
          this.controlEngine.reconnect(state, command.userId, occurredAt),
        );
      case 'EVALUATE_GRACE': {
        const transition = this.controlEngine.evaluateGrace(state, occurredAt);
        return transition.valid
          && transition.state === state
          && transition.events.length === 0
          ? this.rejected(state, 'No active grace transition was produced.')
          : this.fromTransition(transition);
      }
      case 'EVALUATE_DEADLINE': {
        const evaluation = this.deadlineService.evaluate(state, occurredAt);
        if (
          evaluation.state === state
          && evaluation.events.length === 0
          && evaluation.directives.length === 0
        ) {
          return this.rejected(state, 'No active deadline transition was produced.');
        }
        return {
          transition: {
            valid: true,
            errors: [],
            state: evaluation.state,
            events: evaluation.events,
          },
          directives: evaluation.directives,
        };
      }
      case 'START_TURN':
        return this.fromTransition(this.controlEngine.startTurn(state, {
          turnId: command.turnId,
          seat: command.seat,
          actionKind: command.actionKind,
          occurredAt,
        }));
      case 'BEGIN_BOT_ACTION':
        return this.fromTransition(this.controlEngine.beginBotAction(
          state,
          command.seat,
          command.turnId,
          occurredAt,
        ));
      case 'COMPLETE_ACTION_BOUNDARY':
        return this.fromTransition(this.controlEngine.completeActionBoundary(
          state,
          command.nextTurn === undefined
            ? undefined
            : { ...command.nextTurn, occurredAt },
          occurredAt,
        ));
    }
  }

  private recordResult(
    currentState: ActiveGameControlState,
    currentVersion: number,
    records: readonly ActiveControlCommandRecord[],
    envelope: ActiveControlCommandEnvelope,
    applied: AppliedControlCommand,
  ): ActiveControlCommandProcessResult {
    const resultingVersion = applied.transition.valid
      ? currentVersion + 1
      : currentVersion;
    const record: ActiveControlCommandRecord = {
      ...envelope,
      accepted: applied.transition.valid,
      resultingVersion,
      errors: applied.transition.errors,
      transition: applied.transition,
      events: applied.transition.events,
      directives: applied.directives,
    };

    return {
      valid: applied.transition.valid,
      errors: applied.transition.errors,
      duplicate: false,
      state: applied.transition.valid ? applied.transition.state : currentState,
      version: resultingVersion,
      records: [...records, record],
      record,
    };
  }

  private fromTransition(
    transition: ActiveControlTransition,
  ): AppliedControlCommand {
    return { transition, directives: [] };
  }

  private rejected(
    state: ActiveGameControlState,
    error: string,
  ): AppliedControlCommand {
    return {
      transition: {
        valid: false,
        errors: [error],
        state,
        events: [],
      },
      directives: [],
    };
  }

  private validateInput(
    version: number,
    envelope: ActiveControlCommandEnvelope,
  ): readonly string[] {
    const errors: string[] = [];
    if (!Number.isInteger(version) || version < 0) {
      errors.push('Current active control version must be a non-negative integer.');
    }
    if (!envelope.commandId.trim()) {
      errors.push('Active control command id is required.');
    }
    if (!Number.isInteger(envelope.expectedVersion) || envelope.expectedVersion < 0) {
      errors.push('Expected active control version must be a non-negative integer.');
    }
    if (!envelope.actorUserId.trim()) {
      errors.push('Active control command actor is required.');
    }
    if (!Number.isFinite(Date.parse(envelope.occurredAt))) {
      errors.push('Active control command occurrence time must be a valid ISO timestamp.');
    }
    return errors;
  }

  private sameEnvelope(
    existing: ActiveControlCommandRecord,
    incoming: ActiveControlCommandEnvelope,
  ): boolean {
    return existing.expectedVersion === incoming.expectedVersion
      && existing.actorUserId === incoming.actorUserId
      && existing.occurredAt === incoming.occurredAt
      && JSON.stringify(existing.command) === JSON.stringify(incoming.command);
  }
}
