export interface NextRoundRequest {
  readonly tableId?: string;
  readonly commandId?: string;
  readonly expectedRoundNumber?: number;
  readonly expectedRoundVersion?: number;
  readonly expectedControlVersion?: number;
}

export interface NextRoundActor {
  readonly userId: string;
}

export interface NextRoundCommandLedger {
  readonly actorUserId: string;
  readonly commandType: string;
  readonly expectedRoundNumber: number;
  readonly expectedRoundVersion: number;
  readonly expectedControlVersion: number;
  readonly accepted: boolean;
}

export interface AuthoritativeNextRound {
  readonly tableLifecycle: string;
  readonly controlLifecycle: string;
  readonly hostUserId: string;
  readonly controlVersion: number;
  readonly turnId: string | null;
  readonly roundNumber: number;
  readonly roundVersion: number;
  readonly phase: string;
  readonly dealerSeat: number;
  readonly players: readonly { readonly seat: number; readonly playerId: string }[];
  readonly nextRoundMultiplier?: number;
}

export interface NextRoundBootstrapInput {
  readonly tableId: string;
  readonly roundNumber: number;
  readonly seats: readonly { readonly seat: number; readonly playerId: string }[];
  readonly seedHex: string;
  readonly dealId: string;
  readonly nonce: string;
  readonly initialization: {
    readonly kind: 'subsequent-round';
    readonly dealerSeat: number;
    readonly roundMultiplier: number;
  };
}

export interface NextRoundBootstrapResult {
  readonly aggregate: unknown;
  readonly firstBidSeat: number;
}

export interface NextRoundRpcInput {
  readonly tableId: string;
  readonly actorUserId: string;
  readonly commandId: string;
  readonly expectedRoundNumber: number;
  readonly expectedRoundVersion: number;
  readonly expectedControlVersion: number;
  readonly firstBidSeat: number;
  readonly aggregate: unknown;
}

export interface NextRoundProjectionResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly value?: Readonly<Record<string, unknown>>;
}

export interface NextRoundCommandPorts {
  readonly resolveActor: () => Promise<NextRoundActor | undefined>;
  readonly loadCommand: (
    tableId: string,
    commandId: string,
  ) => Promise<NextRoundCommandLedger | undefined>;
  readonly loadCurrentRound: (tableId: string) => Promise<AuthoritativeNextRound | undefined>;
  readonly randomBytes: (length: number) => Uint8Array;
  readonly randomUuid: () => string;
  readonly bootstrap: (input: NextRoundBootstrapInput) => Promise<NextRoundBootstrapResult>;
  readonly validateAggregate: (aggregate: unknown) => readonly string[];
  readonly startNextRound: (input: NextRoundRpcInput) => Promise<{
    readonly valid: boolean;
    readonly errors: readonly string[];
  }>;
  readonly projectViewer: (
    tableId: string,
    actor: NextRoundActor,
  ) => Promise<NextRoundProjectionResult>;
}

export interface NextRoundCommandResult extends NextRoundProjectionResult {
  readonly duplicate: boolean;
}

interface ValidRequest {
  readonly tableId: string;
  readonly commandId: string;
  readonly expectedRoundNumber: number;
  readonly expectedRoundVersion: number;
  readonly expectedControlVersion: number;
}

export async function handleStartNextRound(
  request: NextRoundRequest,
  ports: NextRoundCommandPorts,
): Promise<NextRoundCommandResult> {
  try {
    const actor = await ports.resolveActor();
    if (actor === undefined || actor.userId.trim().length === 0) {
      return failure('NEXT_ROUND_AUTH_REQUIRED');
    }

    const input = validRequest(request);
    if (input === undefined) return failure('NEXT_ROUND_COMMAND_INCOMPLETE');

    const existing = await ports.loadCommand(input.tableId, input.commandId);
    if (existing !== undefined) {
      if (!sameCommand(existing, actor, input)) {
        return failure('NEXT_ROUND_COMMAND_CONFLICT');
      }
      if (!existing.accepted) return failure('NEXT_ROUND_REJECTED', true);
      return projected(input.tableId, actor, ports, true);
    }

    const current = await ports.loadCurrentRound(input.tableId);
    if (current === undefined || current.tableLifecycle !== 'active' || current.controlLifecycle !== 'active') {
      return failure('NEXT_ROUND_UNAVAILABLE');
    }
    if (current.hostUserId !== actor.userId) return failure('NEXT_ROUND_NOT_HOST');
    if (current.phase !== 'scored') return failure('NEXT_ROUND_NOT_SCORED');
    if (current.turnId !== null) return failure('NEXT_ROUND_TURN_PENDING');
    if (
      current.roundNumber !== input.expectedRoundNumber
      || current.roundVersion !== input.expectedRoundVersion
      || current.controlVersion !== input.expectedControlVersion
    ) return failure('NEXT_ROUND_STALE');

    const dealerSeat = nextSeat(current.dealerSeat);
    const roundMultiplier = current.nextRoundMultiplier ?? 1;
    if (!validMultiplier(roundMultiplier) || !validSeats(current.players)) {
      return failure('NEXT_ROUND_UNAVAILABLE');
    }

    const seedBytes = ports.randomBytes(32);
    if (seedBytes.length !== 32) return failure('NEXT_ROUND_UNAVAILABLE');
    const bootstrap = await ports.bootstrap({
      tableId: input.tableId,
      roundNumber: current.roundNumber + 1,
      seats: current.players,
      seedHex: bytesToHex(seedBytes),
      dealId: ports.randomUuid(),
      nonce: ports.randomUuid(),
      initialization: {
        kind: 'subsequent-round',
        dealerSeat,
        roundMultiplier,
      },
    });
    if (!validSeat(bootstrap.firstBidSeat) || ports.validateAggregate(bootstrap.aggregate).length > 0) {
      return failure('NEXT_ROUND_BOOTSTRAP_FAILED');
    }

    const activated = await ports.startNextRound({
      tableId: input.tableId,
      actorUserId: actor.userId,
      commandId: input.commandId,
      expectedRoundNumber: input.expectedRoundNumber,
      expectedRoundVersion: input.expectedRoundVersion,
      expectedControlVersion: input.expectedControlVersion,
      firstBidSeat: bootstrap.firstBidSeat,
      aggregate: bootstrap.aggregate,
    });
    if (!activated.valid) {
      return failure(isStale(activated.errors) ? 'NEXT_ROUND_STALE' : 'NEXT_ROUND_REJECTED');
    }

    return projected(input.tableId, actor, ports, false);
  } catch {
    return failure('NEXT_ROUND_UNAVAILABLE');
  }
}

function validRequest(request: NextRoundRequest): ValidRequest | undefined {
  const tableId = typeof request.tableId === 'string' ? request.tableId.trim() : '';
  const commandId = typeof request.commandId === 'string' ? request.commandId.trim() : '';
  if (
    tableId.length === 0
    || commandId.length === 0
    || !validVersion(request.expectedRoundNumber)
    || !validVersion(request.expectedRoundVersion)
    || !validVersion(request.expectedControlVersion)
  ) return undefined;
  return {
    tableId,
    commandId,
    expectedRoundNumber: request.expectedRoundNumber,
    expectedRoundVersion: request.expectedRoundVersion,
    expectedControlVersion: request.expectedControlVersion,
  };
}

function sameCommand(
  existing: NextRoundCommandLedger,
  actor: NextRoundActor,
  input: ValidRequest,
): boolean {
  return existing.actorUserId === actor.userId
    && existing.commandType === 'START_NEXT_ROUND'
    && existing.expectedRoundNumber === input.expectedRoundNumber
    && existing.expectedRoundVersion === input.expectedRoundVersion
    && existing.expectedControlVersion === input.expectedControlVersion;
}

async function projected(
  tableId: string,
  actor: NextRoundActor,
  ports: NextRoundCommandPorts,
  duplicate: boolean,
): Promise<NextRoundCommandResult> {
  const projection = await ports.projectViewer(tableId, actor);
  if (!projection.valid || projection.value === undefined) {
    return failure('NEXT_ROUND_PROJECTION_UNAVAILABLE', duplicate);
  }
  return {
    valid: true,
    errors: [],
    duplicate,
    value: projection.value,
  };
}

function failure(error: string, duplicate = false): NextRoundCommandResult {
  return { valid: false, errors: [error], duplicate };
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validMultiplier(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function validSeat(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function validSeats(value: readonly { readonly seat: number; readonly playerId: string }[]): boolean {
  return value.length === 4
    && new Set(value.map((player) => player.seat)).size === 4
    && value.every((player) => validSeat(player.seat) && player.playerId.trim().length > 0);
}

function nextSeat(seat: number): number {
  // Keep dealer rotation aligned with the explicit canonical table order used
  // by the round bootstrap; the next seat is immediately to the dealer's right.
  const canonicalTableOrder = [0, 1, 2, 3];
  const index = canonicalTableOrder.indexOf(seat);
  return index === -1 ? -1 : canonicalTableOrder[(index + 1) % canonicalTableOrder.length]!;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isStale(errors: readonly string[]): boolean {
  return errors.some((error) => /stale|concurrent|version|turn/i.test(error));
}
