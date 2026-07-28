import type { OnlineGameplayRoundSnapshot } from './roundTypes.js';

export type HumanActionKind = 'bid' | 'card';

export interface HumanRoundActionResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicate: boolean;
  readonly value?: OnlineGameplayRoundSnapshot;
}

export interface AuthoritativeNextTurn {
  readonly turnId: string;
  readonly seat: number;
  readonly actionKind: HumanActionKind;
}

export type HumanBoundaryResolution =
  | {
      readonly valid: true;
      readonly completed: true;
    }
  | {
      readonly valid: true;
      readonly completed: false;
      readonly workspaceId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly valid: false;
      readonly errors: readonly string[];
    };

export interface HumanBoundaryCompletionInput {
  readonly tableId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly nextTurn: AuthoritativeNextTurn | null;
  readonly occurredAt: string;
}

export interface HumanActionBoundaryPort {
  resolve(input: {
    readonly tableId: string;
    readonly actorUserId: string;
    readonly roundCommandId: string;
    readonly actionKind: HumanActionKind;
  }): Promise<HumanBoundaryResolution>;

  complete(input: HumanBoundaryCompletionInput): Promise<{
    readonly valid: boolean;
    readonly errors: readonly string[];
  }>;
}

export function nextAuthoritativeTurn(
  snapshot: OnlineGameplayRoundSnapshot,
): AuthoritativeNextTurn | null {
  const seat = snapshot.phase === 'bidding'
    ? snapshot.nextBidSeat
    : snapshot.phase === 'playing'
      ? snapshot.currentTurnSeat
      : undefined;

  if (seat === undefined) return null;

  const actionKind: HumanActionKind =
    snapshot.phase === 'bidding' ? 'bid' : 'card';

  return {
    turnId:
      `round-${snapshot.roundNumber}:${actionKind}:${snapshot.version}:${seat}`,
    seat,
    actionKind,
  };
}

export async function coordinateHumanRoundAction(input: {
  readonly tableId: string;
  readonly actorUserId: string;
  readonly roundCommandId: string;
  readonly actionKind: HumanActionKind;
  readonly boundary: HumanActionBoundaryPort;
  readonly occurredAt: string;
  readonly executeRound: () => Promise<HumanRoundActionResult>;
}): Promise<HumanRoundActionResult> {
  const roundResult = await input.executeRound();

  if (!roundResult.valid || roundResult.value === undefined) {
    return roundResult;
  }

  const resolution = await input.boundary.resolve({
    tableId: input.tableId,
    actorUserId: input.actorUserId,
    roundCommandId: input.roundCommandId,
    actionKind: input.actionKind,
  });

  if (!resolution.valid) {
    return {
      valid: false,
      errors: resolution.errors,
      duplicate: roundResult.duplicate,
    };
  }

  if (resolution.completed) return roundResult;

  const completed = await input.boundary.complete({
    tableId: input.tableId,
    workspaceId: resolution.workspaceId,
    actorUserId: input.actorUserId,
    commandId: `human-complete:${input.roundCommandId}`,
    expectedVersion: resolution.expectedVersion,
    nextTurn: nextAuthoritativeTurn(roundResult.value),
    occurredAt: input.occurredAt,
  });

  if (completed.valid) return roundResult;

  return {
    valid: false,
    errors: completed.errors.length > 0
      ? completed.errors
      : ['Human action boundary could not complete.'],
    duplicate: roundResult.duplicate,
  };
}