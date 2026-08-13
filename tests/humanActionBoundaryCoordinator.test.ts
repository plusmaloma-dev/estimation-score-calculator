import assert from 'node:assert/strict';
import test from 'node:test';

import type { OnlineGameplayRoundSnapshot } from '../src/online/gameplay/roundTypes.js';

type HumanActionKind = 'bid' | 'card';

interface AuthoritativeNextTurn {
  readonly turnId: string;
  readonly seat: number;
  readonly actionKind: HumanActionKind;
}

interface HumanRoundActionResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicate: boolean;
  readonly value?: OnlineGameplayRoundSnapshot;
}

type BoundaryResolution =
  | { readonly valid: true; readonly completed: true }
  | {
      readonly valid: true;
      readonly completed: false;
      readonly workspaceId: string;
      readonly expectedVersion: number;
    }
  | { readonly valid: false; readonly errors: readonly string[] };

interface HumanBoundaryCompletionInput {
  readonly tableId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly nextTurn: AuthoritativeNextTurn | null;
  readonly occurredAt: string;
}

interface TestBoundaryPort {
  resolve(input: {
    readonly tableId: string;
    readonly actorUserId: string;
    readonly roundCommandId: string;
    readonly actionKind: HumanActionKind;
  }): Promise<BoundaryResolution>;

  complete(input: HumanBoundaryCompletionInput): Promise<{
    readonly valid: boolean;
    readonly errors: readonly string[];
  }>;
}

interface CoordinatorModule {
  coordinateHumanRoundAction(input: {
    readonly tableId: string;
    readonly actorUserId: string;
    readonly roundCommandId: string;
    readonly actionKind: HumanActionKind;
    readonly boundary: TestBoundaryPort;
    readonly occurredAt: string;
    readonly executeRound: () => Promise<HumanRoundActionResult>;
  }): Promise<HumanRoundActionResult>;

  nextAuthoritativeTurn(
    snapshot: OnlineGameplayRoundSnapshot,
  ): AuthoritativeNextTurn | null;
}

async function loadCoordinator(): Promise<CoordinatorModule> {
  const modulePath =
    '../src/online/gameplay/HumanActionBoundaryCoordinator.js';

  const loaded = await import(modulePath).catch(() => undefined);

  assert.ok(
    loaded !== undefined,
    'HumanActionBoundaryCoordinator must exist before the GREEN implementation.',
  );

  const candidate = loaded as Partial<CoordinatorModule>;

  assert.equal(
    typeof candidate.coordinateHumanRoundAction,
    'function',
    'coordinateHumanRoundAction must be exported.',
  );

  assert.equal(
    typeof candidate.nextAuthoritativeTurn,
    'function',
    'nextAuthoritativeTurn must be exported.',
  );

  return candidate as CoordinatorModule;
}

function snapshot(
  overrides: Partial<OnlineGameplayRoundSnapshot> = {},
): OnlineGameplayRoundSnapshot {
  return {
    tableId: 'table-1',
    roundNumber: 1,
    phase: 'auction',
    version: 3,
    viewerSeat: 0,
    bidOwnerSeat: 2,
    nextBidSeat: 1,
    players: [
      { seat: 0, playerId: 'human-0', cardCount: 13, actualTricks: 0 },
      { seat: 1, playerId: 'bot-1', cardCount: 13, actualTricks: 0 },
      { seat: 2, playerId: 'bot-2', cardCount: 13, actualTricks: 0 },
      { seat: 3, playerId: 'bot-3', cardCount: 13, actualTricks: 0 },
    ],
    ownHand: [],
    legalNormalEstimates: [],
    legalCards: [],
    currentTrick: [],
    completedTricks: [],
    ...overrides,
  };
}

function boundaryPort(input: {
  readonly completed?: boolean;
  readonly completionValid?: boolean;
} = {}): TestBoundaryPort & {
  readonly resolved: string[];
  readonly completedInputs: HumanBoundaryCompletionInput[];
} {
  const resolved: string[] = [];
  const completedInputs: HumanBoundaryCompletionInput[] = [];

  return {
    resolved,
    completedInputs,

    async resolve(value) {
      resolved.push(value.roundCommandId);

      return input.completed === true
        ? { valid: true, completed: true }
        : {
            valid: true,
            completed: false,
            workspaceId: 'workspace-1',
            expectedVersion: 7,
          };
    },

    async complete(value) {
      completedInputs.push(value);

      return input.completionValid === false
        ? { valid: false, errors: ['Boundary unavailable.'] }
        : { valid: true, errors: [] };
    },
  };
}

test('accepted human bid completes the next authoritative bid turn', async () => {
  const { coordinateHumanRoundAction } = await loadCoordinator();
  const boundary = boundaryPort();

  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:1',
    actionKind: 'bid',
    boundary,
    occurredAt: '2026-07-28T12:00:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot(),
    }),
  });

  assert.equal(result.valid, true);
  assert.deepEqual(boundary.completedInputs, [{
    tableId: 'table-1',
    workspaceId: 'workspace-1',
    actorUserId: 'human-0',
    commandId: 'human-complete:submit-bid:1',
    expectedVersion: 7,
    nextTurn: {
      turnId: 'round-1:bid:3:1',
      seat: 1,
      actionKind: 'bid',
    },
    occurredAt: '2026-07-28T12:00:00.000Z',
  }]);
});

test('accepted human card completes the next authoritative card turn', async () => {
  const { coordinateHumanRoundAction } = await loadCoordinator();
  const boundary = boundaryPort();

  await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'play-card:1',
    actionKind: 'card',
    boundary,
    occurredAt: '2026-07-28T12:01:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot({
        phase: 'playing',
        version: 8,
        nextBidSeat: undefined,
        currentTurnSeat: 2,
      }),
    }),
  });

  assert.deepEqual(boundary.completedInputs[0]?.nextTurn, {
    turnId: 'round-1:card:8:2',
    seat: 2,
    actionKind: 'card',
  });
});

test('scored round completes the boundary without a next turn', async () => {
  const { coordinateHumanRoundAction } = await loadCoordinator();
  const boundary = boundaryPort();

  await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'play-card:13',
    actionKind: 'card',
    boundary,
    occurredAt: '2026-07-28T12:02:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot({
        phase: 'scored',
        version: 56,
        nextBidSeat: undefined,
        currentTurnSeat: undefined,
      }),
    }),
  });

  assert.equal(boundary.completedInputs[0]?.nextTurn, null);
});

test('rejected round action never touches active control', async () => {
  const { coordinateHumanRoundAction } = await loadCoordinator();
  const boundary = boundaryPort();

  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:rejected',
    actionKind: 'bid',
    boundary,
    occurredAt: '2026-07-28T12:03:00.000Z',
    executeRound: async () => ({
      valid: false,
      errors: ['Estimate is not legal.'],
      duplicate: false,
    }),
  });

  assert.equal(result.valid, false);
  assert.deepEqual(boundary.resolved, []);
  assert.deepEqual(boundary.completedInputs, []);
});

test('accepted duplicate skips an already-completed boundary', async () => {
  const { coordinateHumanRoundAction } = await loadCoordinator();
  const boundary = boundaryPort({ completed: true });

  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'submit-bid:duplicate',
    actionKind: 'bid',
    boundary,
    occurredAt: '2026-07-28T12:04:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: true,
      value: snapshot(),
    }),
  });

  assert.equal(result.valid, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(boundary.completedInputs, []);
});

test('boundary failure returns a retryable synchronization error', async () => {
  const { coordinateHumanRoundAction } = await loadCoordinator();
  const boundary = boundaryPort({ completionValid: false });

  const result = await coordinateHumanRoundAction({
    tableId: 'table-1',
    actorUserId: 'human-0',
    roundCommandId: 'play-card:failure',
    actionKind: 'card',
    boundary,
    occurredAt: '2026-07-28T12:05:00.000Z',
    executeRound: async () => ({
      valid: true,
      errors: [],
      duplicate: false,
      value: snapshot({
        phase: 'playing',
        currentTurnSeat: 1,
      }),
    }),
  });

  assert.deepEqual(result, {
    valid: false,
    errors: ['Boundary unavailable.'],
    duplicate: false,
  });
});

test('next-turn projection is deterministic for bid, card, and scored phases', async () => {
  const { nextAuthoritativeTurn } = await loadCoordinator();

  assert.deepEqual(nextAuthoritativeTurn(snapshot()), {
    turnId: 'round-1:bid:3:1',
    seat: 1,
    actionKind: 'bid',
  });

  assert.deepEqual(nextAuthoritativeTurn(snapshot({
    phase: 'playing',
    version: 4,
    nextBidSeat: undefined,
    currentTurnSeat: 3,
  })), {
    turnId: 'round-1:card:4:3',
    seat: 3,
    actionKind: 'card',
  });

  assert.equal(nextAuthoritativeTurn(snapshot({
    phase: 'scored',
    nextBidSeat: undefined,
    currentTurnSeat: undefined,
  })), null);
});
