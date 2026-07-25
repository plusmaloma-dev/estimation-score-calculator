import type { BotActionSource } from '../bot/types.js';
import type {
  ActiveControlEvent,
  ActiveDeadlineEvaluation,
  ActiveGameControlState,
  BotActionDirective,
} from './types.js';

export class ActiveGameDeadlineService {
  evaluate(
    state: ActiveGameControlState,
    occurredAt: string,
  ): ActiveDeadlineEvaluation {
    if (
      state.lifecycle !== 'active'
      || state.turn === undefined
      || state.turn.status !== 'running'
    ) {
      return { state, directives: [], events: [] };
    }

    const now = this.timestamp(occurredAt);
    const seat = state.seats[state.turn.seat];
    const source = this.directiveSource(state, now);
    if (source === undefined) {
      return { state, directives: [], events: [] };
    }

    const directive: BotActionDirective = {
      directiveId: `bot-action:${state.tableId}:${state.turn.turnId}:${state.turn.seat}`,
      tableId: state.tableId,
      turnId: state.turn.turnId,
      seat: state.turn.seat,
      actionKind: state.turn.actionKind,
      source,
      issuedAt: occurredAt,
    };
    const event: ActiveControlEvent = {
      type: source === 'timeout-assistant'
        ? 'turn.timeout-assistance'
        : 'turn.bot-directed',
      occurredAt,
      seat: seat.seat,
      details: {
        turnId: state.turn.turnId,
        actionKind: state.turn.actionKind,
        source,
        directiveId: directive.directiveId,
      },
    };

    return {
      state: {
        ...state,
        turn: { ...state.turn, status: 'assistant-pending' },
      },
      directives: [directive],
      events: [event],
    };
  }

  private directiveSource(
    state: ActiveGameControlState,
    now: number,
  ): BotActionSource | undefined {
    const turn = state.turn!;
    const seat = state.seats[turn.seat];
    if (seat.controlOwner === 'permanent-bot') return 'permanent-bot';
    if (seat.controlOwner === 'temporary-bot') return 'disconnect-substitute';
    if (
      turn.deadlineAt !== undefined
      && this.timestamp(turn.deadlineAt) <= now
    ) return 'timeout-assistant';
    return undefined;
  }

  private timestamp(value: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('Deadline evaluation requires a valid ISO timestamp.');
    }
    return parsed;
  }
}
