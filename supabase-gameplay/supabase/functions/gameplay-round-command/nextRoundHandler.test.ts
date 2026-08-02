import {
  handleStartNextRound,
  type NextRoundCommandPorts,
} from './nextRoundHandler.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const request = {
  tableId: '10000000-0000-0000-0000-000000000701',
  commandId: 'next-round-command',
  expectedRoundNumber: 5,
  expectedRoundVersion: 19,
  expectedControlVersion: 23,
} as const;

const viewerSnapshot = {
  tableId: request.tableId,
  roundNumber: 6,
  viewerSeat: 0,
  ownHand: [{ rank: 'A', suit: 'spades' }],
} as const;

function currentRound(overrides: Partial<{
  lifecycle: string;
  hostUserId: string;
  phase: string;
  turnId: string | null;
}> = {}) {
  return {
    tableLifecycle: overrides.lifecycle ?? 'active',
    controlLifecycle: overrides.lifecycle ?? 'active',
    hostUserId: overrides.hostUserId ?? 'host-user',
    controlVersion: 23,
    turnId: overrides.turnId ?? null,
    roundNumber: 5,
    roundVersion: 19,
    phase: overrides.phase ?? 'scored',
    dealerSeat: 1,
    players: [
      { seat: 0, playerId: 'host-user' },
      { seat: 1, playerId: 'bot-1' },
      { seat: 2, playerId: 'bot-2' },
      { seat: 3, playerId: 'bot-3' },
    ],
    nextRoundMultiplier: 2,
  } as const;
}

function ports(overrides: Partial<NextRoundCommandPorts> = {}): NextRoundCommandPorts {
  return {
    resolveActor: async () => ({ userId: 'host-user' }),
    loadCommand: async () => undefined,
    loadCurrentRound: async () => currentRound(),
    randomBytes: () => new Uint8Array(32).fill(7),
    randomUuid: () => 'fresh-private-id',
    bootstrap: async (input) => ({
      aggregate: { generatedRound: input.roundNumber },
      firstBidSeat: input.initialization.dealerSeat,
    }),
    validateAggregate: () => [],
    startNextRound: async () => ({ valid: true, errors: [] }),
    projectViewer: async () => ({ valid: true, errors: [], value: viewerSnapshot }),
    ...overrides,
  };
}

Deno.test('rejects an unauthenticated next-round request before any private lookup', async () => {
  let loaded = false;
  const result = await handleStartNextRound(request, ports({
    resolveActor: async () => undefined,
    loadCommand: async () => {
      loaded = true;
      return undefined;
    },
  }));

  equal(result.valid, false, 'Unauthenticated result must be invalid');
  equal(result.errors[0], 'NEXT_ROUND_AUTH_REQUIRED', 'Unauthenticated error code');
  equal(loaded, false, 'Unauthenticated requests must not load command data');
});

Deno.test('rejects a non-host before bootstrap or transactional activation', async () => {
  let bootstrapped = false;
  let activated = false;
  const result = await handleStartNextRound(request, ports({
    resolveActor: async () => ({ userId: 'non-host-user' }),
    bootstrap: async () => {
      bootstrapped = true;
      throw new Error('must not bootstrap');
    },
    startNextRound: async () => {
      activated = true;
      return { valid: true, errors: [] };
    },
  }));

  equal(result.valid, false, 'Non-host result must be invalid');
  equal(result.errors[0], 'NEXT_ROUND_NOT_HOST', 'Non-host error code');
  equal(bootstrapped, false, 'Non-host must not generate a deal');
  equal(activated, false, 'Non-host must not activate a round');
});

Deno.test('rejects paused, terminated, non-scored, and pending-turn state before private bootstrap', async () => {
  const cases = [
    { current: currentRound({ lifecycle: 'paused' }), expected: 'NEXT_ROUND_UNAVAILABLE' },
    { current: currentRound({ lifecycle: 'terminated' }), expected: 'NEXT_ROUND_UNAVAILABLE' },
    { current: currentRound({ phase: 'playing' }), expected: 'NEXT_ROUND_NOT_SCORED' },
    { current: currentRound({ turnId: 'round-5:card:19:2' }), expected: 'NEXT_ROUND_TURN_PENDING' },
  ] as const;

  for (const item of cases) {
    let bootstrapped = false;
    const result = await handleStartNextRound(request, ports({
      loadCurrentRound: async () => item.current,
      bootstrap: async () => {
        bootstrapped = true;
        throw new Error('must not bootstrap');
      },
    }));

    equal(result.valid, false, `Rejected state ${item.expected} must be invalid`);
    equal(result.errors[0], item.expected, `Rejected state ${item.expected} error code`);
    equal(bootstrapped, false, `Rejected state ${item.expected} must not bootstrap`);
  }
});

Deno.test('uses the server-resolved actor instead of any caller-supplied identity field', async () => {
  const callerSupplied = {
    ...request,
    actorUserId: 'non-host-user',
    hostUserId: 'non-host-user',
  };
  const result = await handleStartNextRound(callerSupplied, ports());

  equal(result.valid, true, 'Server-resolved host must remain authorized');
});

Deno.test('derives a rotated subsequent bootstrap and carries the scored multiplier', async () => {
  let bootstrapInput: unknown;
  let activationInput: unknown;
  const result = await handleStartNextRound(request, ports({
    bootstrap: async (input) => {
      bootstrapInput = input;
      return { aggregate: { generatedRound: input.roundNumber }, firstBidSeat: input.initialization.dealerSeat };
    },
    startNextRound: async (input) => {
      activationInput = input;
      return { valid: true, errors: [] };
    },
  }));

  equal(result.valid, true, 'Host next-round result must be valid');
  const bootstrap = bootstrapInput as {
    readonly roundNumber: number;
    readonly initialization: { readonly kind: string; readonly dealerSeat: number; readonly roundMultiplier: number };
    readonly seedHex: string;
    readonly dealId: string;
    readonly nonce: string;
  };
  equal(bootstrap.roundNumber, 6, 'Bootstrap must increment round number');
  equal(bootstrap.initialization.kind, 'subsequent-round', 'Bootstrap kind');
  equal(bootstrap.initialization.dealerSeat, 2, 'Dealer must rotate one seat');
  equal(bootstrap.initialization.roundMultiplier, 2, 'Scored multiplier must carry forward');
  assert(/^[0-9a-f]{64}$/.test(bootstrap.seedHex), 'Seed must be server-generated hexadecimal');
  assert(bootstrap.dealId.length > 0 && bootstrap.nonce.length > 0, 'Private IDs must be server-generated');
  const activation = activationInput as { readonly firstBidSeat: number; readonly aggregate: unknown };
  equal(activation.firstBidSeat, 2, 'RPC must use the derived first bidder');
  equal('aggregate' in result, false, 'Response must not include a private aggregate');
});

Deno.test('returns a committed matching retry without consuming replacement private deal material', async () => {
  let loadedCurrent = false;
  let generated = false;
  let bootstrapped = false;
  let activated = false;
  const result = await handleStartNextRound(request, ports({
    loadCommand: async () => ({
      actorUserId: 'host-user',
      commandType: 'START_NEXT_ROUND',
      expectedRoundNumber: 5,
      expectedRoundVersion: 19,
      expectedControlVersion: 23,
      accepted: true,
    }),
    loadCurrentRound: async () => {
      loadedCurrent = true;
      return currentRound();
    },
    randomBytes: () => {
      generated = true;
      return new Uint8Array(32);
    },
    bootstrap: async () => {
      bootstrapped = true;
      throw new Error('must not bootstrap');
    },
    startNextRound: async () => {
      activated = true;
      return { valid: true, errors: [] };
    },
  }));

  equal(result.valid, true, 'Committed retry must return a valid projection');
  equal(result.duplicate, true, 'Committed retry must be marked duplicate');
  equal(loadedCurrent, false, 'Ledger retry must precede current round lookup');
  equal(generated, false, 'Ledger retry must not generate private inputs');
  equal(bootstrapped, false, 'Ledger retry must not bootstrap');
  equal(activated, false, 'Ledger retry must not invoke the RPC again');
  assert(result.value !== undefined, 'Committed retry must return the viewer projection');
  equal('aggregate' in result.value, false, 'Viewer response must not contain an aggregate');
});

Deno.test('rejects a changed payload under an existing command identity without exposing private state', async () => {
  const result = await handleStartNextRound({ ...request, expectedRoundVersion: 18 }, ports({
    loadCommand: async () => ({
      actorUserId: 'host-user',
      commandType: 'START_NEXT_ROUND',
      expectedRoundNumber: 5,
      expectedRoundVersion: 19,
      expectedControlVersion: 23,
      accepted: true,
    }),
  }));

  equal(result.valid, false, 'Changed command reuse must be invalid');
  equal(result.errors[0], 'NEXT_ROUND_COMMAND_CONFLICT', 'Changed command error code');
  equal('value' in result, false, 'Conflict response must not expose a projection or aggregate');
});

Deno.test('maps stale transactional failures to a stable privacy-safe error', async () => {
  const result = await handleStartNextRound(request, ports({
    startNextRound: async () => ({
      valid: false,
      errors: ['Expected active-control version is stale.'],
    }),
  }));

  equal(result.valid, false, 'Stale result must be invalid');
  equal(result.errors[0], 'NEXT_ROUND_STALE', 'Stale error code');
  equal('value' in result, false, 'Stale response must not include private state');
});
