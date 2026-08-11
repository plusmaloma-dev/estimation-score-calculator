import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GameplayRoundApplicationService } from '../../../../src/gameplay/GameplayRoundApplicationService.ts';
import { GameplayBotDirectiveService } from '../../../../src/gameplay/bot/GameplayBotDirectiveService.ts';
import { GameplaySessionBootstrapService } from '../../../../src/gameplay/session/GameplaySessionBootstrapService.ts';
import type {
  GameplayRoundAggregate,
  GameplayRoundCommitInput,
  GameplayRoundCommitResult,
  GameplayRoundRepository,
} from '../../../../src/gameplay/roundApplicationTypes.ts';
import type { BotActionDirective } from '../../../../src/gameplay/control/types.ts';
import type { EstimationBid } from '../../../../src/domain/bid.ts';
import type { Card } from '../../../../src/domain/card.ts';
import type { GameplayAuctionAction, GameplaySeatPlayers, SeatIndex } from '../../../../src/gameplay/types.ts';
import {
  coordinateHumanRoundAction,
  nextAuthoritativeTurn,
  type HumanActionBoundaryPort,
  type HumanActionKind,
  type HumanBoundaryCompletionInput,
  type HumanBoundaryResolution,
} from '../../../../src/online/gameplay/HumanActionBoundaryCoordinator.ts';
import {
  handleStartNextRound,
  type AuthoritativeNextRound,
  type NextRoundCommandLedger,
  type NextRoundCommandPorts,
} from './nextRoundHandler.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface RequestBody {
  readonly action?: 'snapshot' | 'submit-auction-action' | 'submit-bid' | 'play-card' | 'process-bot-directive' | 'start-next-round';
  readonly tableId?: string;
  readonly commandId?: string;
  readonly expectedVersion?: number;
  readonly expectedRoundNumber?: number;
  readonly expectedRoundVersion?: number;
  readonly expectedControlVersion?: number;
  readonly bid?: EstimationBid;
  readonly auctionAction?: GameplayAuctionAction;
  readonly card?: Card;
  readonly directiveId?: string;
}

interface RpcResult {
  readonly valid?: boolean;
  readonly errors?: readonly string[];
  readonly accepted?: boolean;
  readonly duplicate?: boolean;
  readonly aggregate?: GameplayRoundAggregate;
  readonly version?: number;
}

interface ActiveControlRow {
  readonly version: number;
  readonly lifecycle: string;
  readonly host_user_id: string | null;
  readonly turn_id: string | null;
  readonly turn_seat: number | null;
  readonly turn_action_kind: string | null;
  readonly turn_status: string | null;
}

interface IssuedDirectiveContext {
  readonly directive: BotActionDirective;
  readonly workspaceId: string;
  readonly controlVersion: number;
  readonly beginExpectedVersion: number;
  readonly completeExpectedVersion?: number;
  readonly completed: boolean;
}

type ServiceClient = SupabaseClient<any>;

class SupabaseGameplayRoundRepository implements GameplayRoundRepository {
  constructor(private readonly client: ServiceClient) {}

  async load(tableId: string): Promise<GameplayRoundAggregate | undefined> {
    const { data, error } = await this.client.rpc('load_gameplay_round_for_engine', {
      p_table_id: tableId,
    });
    if (error !== null) throw new Error(error.message);
    const payload = object(Array.isArray(data) ? data[0] : data) as RpcResult | undefined;
    if (payload?.valid !== true || payload.aggregate === undefined) return undefined;
    return payload.aggregate;
  }

  async commit(input: GameplayRoundCommitInput): Promise<GameplayRoundCommitResult> {
    const command = input.record.command;
    const { data, error } = await this.client.rpc('commit_gameplay_round_auction_command', {
      p_table_id: input.tableId,
      p_actor_user_id: input.actorUserId,
      p_actor_seat: command.seat + 1,
      p_command_id: input.record.commandId,
      p_command_type: command.type,
      p_expected_version: input.record.expectedVersion,
      p_base_version: input.baseVersion,
      p_resulting_version: input.resultingVersion,
      p_payload: command,
      p_accepted: input.record.accepted,
      p_errors: input.record.errors,
      p_transition: input.record.transition,
      p_resulting_aggregate: input.resultingState,
      p_resulting_phase: input.resultingState.phase,
      p_occurred_at: new Date().toISOString(),
    });
    if (error !== null) return { valid: false, errors: [error.message] };

    const payload = object(Array.isArray(data) ? data[0] : data) as RpcResult | undefined;
    const persistedOutcome = payload?.valid === true || typeof payload?.accepted === 'boolean';
    if (!persistedOutcome) {
      return {
        valid: false,
        errors: stringArray(payload?.errors).length > 0
          ? stringArray(payload?.errors)
          : ['Gameplay round command could not be committed.'],
      };
    }

    const aggregate = await this.load(input.tableId);
    return aggregate === undefined
      ? { valid: false, errors: ['Committed gameplay round could not be reloaded.'] }
      : { valid: true, errors: [], aggregate };
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function validTableId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validCommandInput(body: RequestBody): boolean {
  return typeof body.commandId === 'string'
    && body.commandId.trim().length > 0
    && Number.isInteger(body.expectedVersion)
    && (body.expectedVersion ?? -1) >= 0;
}

function validNextRoundInput(body: RequestBody): boolean {
  return typeof body.commandId === 'string'
    && body.commandId.trim().length > 0
    && Number.isInteger(body.expectedRoundNumber)
    && (body.expectedRoundNumber ?? -1) >= 0
    && Number.isInteger(body.expectedRoundVersion)
    && (body.expectedRoundVersion ?? -1) >= 0
    && Number.isInteger(body.expectedControlVersion)
    && (body.expectedControlVersion ?? -1) >= 0;
}

function parseDirective(value: unknown): BotActionDirective | undefined {
  const row = object(value);
  if (
    row === undefined
    || typeof row.directiveId !== 'string'
    || typeof row.tableId !== 'string'
    || typeof row.turnId !== 'string'
    || typeof row.seat !== 'number'
    || !Number.isInteger(row.seat)
    || row.seat < 0
    || row.seat > 3
    || row.actionKind !== 'bid' && row.actionKind !== 'card'
    || row.source !== 'permanent-bot'
      && row.source !== 'disconnect-substitute'
      && row.source !== 'timeout-assistant'
    || typeof row.issuedAt !== 'string'
  ) return undefined;
  return row as unknown as BotActionDirective;
}

async function commandRecord(
  client: ServiceClient,
  tableId: string,
  commandId: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const { data, error } = await client
    .from('gameplay_active_control_commands')
    .select('command_id,expected_version,accepted,transition')
    .eq('table_id', tableId)
    .eq('command_id', commandId)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  return object(data);
}

async function nextRoundCommandRecord(
  client: ServiceClient,
  tableId: string,
  commandId: string,
): Promise<NextRoundCommandLedger | undefined> {
  const { data, error } = await client
    .from('gameplay_active_control_commands')
    .select('actor_user_id,command_type,expected_version,accepted,payload')
    .eq('table_id', tableId)
    .eq('command_id', commandId)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  const row = object(data);
  if (row === undefined) return undefined;
  const payload = object(row.payload);
  return {
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : '',
    commandType: typeof row.command_type === 'string' ? row.command_type : '',
    expectedRoundNumber: typeof payload?.expectedRoundNumber === 'number'
      ? payload.expectedRoundNumber
      : -1,
    expectedRoundVersion: typeof payload?.expectedRoundVersion === 'number'
      ? payload.expectedRoundVersion
      : -1,
    expectedControlVersion: typeof row.expected_version === 'number'
      ? row.expected_version
      : -1,
    accepted: row.accepted === true,
  };
}

async function loadAuthoritativeNextRound(
  client: ServiceClient,
  repository: GameplayRoundRepository,
  tableId: string,
): Promise<AuthoritativeNextRound | undefined> {
  const { data: tableData, error: tableError } = await client
    .from('gameplay_tables')
    .select('lifecycle')
    .eq('id', tableId)
    .maybeSingle();
  if (tableError !== null) throw new Error(tableError.message);
  const table = object(tableData);

  const { data: controlData, error: controlError } = await client
    .from('gameplay_active_controls')
    .select('version,lifecycle,host_user_id,turn_id')
    .eq('table_id', tableId)
    .maybeSingle();
  if (controlError !== null) throw new Error(controlError.message);
  const control = object(controlData);
  const aggregate = await repository.load(tableId);
  if (
    aggregate === undefined
    || typeof table?.lifecycle !== 'string'
    || typeof control?.lifecycle !== 'string'
    || typeof control?.host_user_id !== 'string'
    || typeof control?.version !== 'number'
    || control.turn_id !== null && typeof control.turn_id !== 'string'
  ) return undefined;

  const nextRoundMultiplier = aggregate.state.scoreResult?.scoreResult?.nextRoundMultiplier;
  return {
    tableLifecycle: table.lifecycle,
    controlLifecycle: control.lifecycle,
    hostUserId: control.host_user_id,
    controlVersion: control.version,
    turnId: control.turn_id,
    roundNumber: aggregate.state.roundNumber,
    roundVersion: aggregate.version,
    phase: aggregate.state.phase,
    dealerSeat: aggregate.state.dealerSeat,
    players: aggregate.state.players,
    ...(nextRoundMultiplier === undefined ? {} : { nextRoundMultiplier }),
  };
}

function validateNextRoundAggregate(aggregate: unknown): readonly string[] {
  const state = object(aggregate);
  return state?.phase === 'auction'
    && typeof state.auctionActiveSeat === 'number'
    && Array.isArray(state.players)
    && Array.isArray(state.hands)
    && state.hands.length === 4
    ? []
    : ['Generated round is incomplete.'];
}

function nextRoundPorts(
  serviceClient: ServiceClient,
  repository: GameplayRoundRepository,
  service: GameplayRoundApplicationService,
  actorUserId: string,
): NextRoundCommandPorts {
  return {
    resolveActor: async () => ({ userId: actorUserId }),
    loadCommand: (tableId, commandId) => nextRoundCommandRecord(serviceClient, tableId, commandId),
    loadCurrentRound: (tableId) => loadAuthoritativeNextRound(serviceClient, repository, tableId),
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    randomUuid: () => crypto.randomUUID(),
    bootstrap: async (input) => {
      const bootstrap = await new GameplaySessionBootstrapService().bootstrap({
        tableId: input.tableId,
        roundNumber: input.roundNumber,
        seats: input.seats as unknown as GameplaySeatPlayers,
        seedHex: input.seedHex,
        dealId: input.dealId,
        nonce: input.nonce,
        initialization: {
          kind: 'subsequent-round',
          dealerSeat: input.initialization.dealerSeat as SeatIndex,
          roundMultiplier: input.initialization.roundMultiplier,
        },
      });
      return {
        aggregate: bootstrap.state,
        firstBidSeat: bootstrap.firstTurn.seat,
      };
    },
    validateAggregate: validateNextRoundAggregate,
    startNextRound: async (input) => {
      const result = await userRpc(serviceClient, 'start_next_gameplay_auction_round', {
        p_table_id: input.tableId,
        p_actor_user_id: input.actorUserId,
        p_command_id: input.commandId,
        p_expected_round_number: input.expectedRoundNumber,
        p_expected_round_version: input.expectedRoundVersion,
        p_expected_control_version: input.expectedControlVersion,
        p_first_bid_seat: input.firstBidSeat,
        p_next_round_aggregate: input.aggregate,
        p_occurred_at: new Date().toISOString(),
      });
      return {
        valid: result.valid === true,
        errors: stringArray(result.errors),
      };
    },
    projectViewer: async (tableId, actor) => {
      const snapshot = await service.getSnapshot(tableId, { userId: actor.userId });
      return {
        valid: snapshot.valid,
        errors: snapshot.errors,
        ...(snapshot.value === undefined
          ? {}
          : { value: snapshot.value as unknown as Readonly<Record<string, unknown>> }),
      };
    },
  };
}

async function loadIssuedDirective(
  client: ServiceClient,
  tableId: string,
  directiveId: string,
): Promise<IssuedDirectiveContext | undefined> {
  const completeId = `bot-complete:${directiveId}`;
  const completedCommand = await commandRecord(client, tableId, completeId);

  const { data: tableData, error: tableError } = await client
    .from('gameplay_tables')
    .select('workspace_id')
    .eq('id', tableId)
    .single();
  if (tableError !== null) throw new Error(tableError.message);
  const workspaceId = object(tableData)?.workspace_id;
  if (typeof workspaceId !== 'string') throw new Error('Gameplay workspace could not be resolved.');

  const { data: directiveData, error: directiveError } = await client
    .from('gameplay_active_control_commands')
    .select('id,directives')
    .eq('table_id', tableId)
    .order('id', { ascending: false })
    .limit(64);
  if (directiveError !== null) throw new Error(directiveError.message);
  const directive = Array.isArray(directiveData)
    ? directiveData
      .flatMap((value) => {
        const rows = object(value)?.directives;
        return Array.isArray(rows) ? rows : [];
      })
      .map(parseDirective)
      .find((item) => item?.directiveId === directiveId)
    : undefined;
  if (directive === undefined || directive.tableId !== tableId) return undefined;

  const { data: controlData, error: controlError } = await client
    .from('gameplay_active_controls')
    .select('version,lifecycle,turn_id,turn_seat,turn_action_kind,turn_status')
    .eq('table_id', tableId)
    .single();
  if (controlError !== null) throw new Error(controlError.message);
  const control = object(controlData) as unknown as ActiveControlRow | undefined;
  if (
    control === undefined
    || typeof control.version !== 'number'
    || typeof control.lifecycle !== 'string'
  ) throw new Error('Active control state is incomplete.');

  const beginId = `bot-begin:${directiveId}`;
  const beginCommand = await commandRecord(client, tableId, beginId);
  const beginExpectedVersion = typeof beginCommand?.expected_version === 'number'
    ? beginCommand.expected_version
    : control.version;
  const completeExpectedVersion = typeof completedCommand?.expected_version === 'number'
    ? completedCommand.expected_version
    : undefined;

  if (completedCommand?.accepted === true) {
    return {
      directive,
      workspaceId,
      controlVersion: control.version,
      beginExpectedVersion,
      ...(completeExpectedVersion === undefined ? {} : { completeExpectedVersion }),
      completed: true,
    };
  }

  if (
    control.lifecycle !== 'active'
    || directive.turnId !== control.turn_id
    || directive.seat + 1 !== control.turn_seat
    || directive.actionKind !== control.turn_action_kind
    || control.turn_status !== 'assistant-pending' && control.turn_status !== 'bot-processing'
  ) return undefined;

  const { data: seatData, error: seatError } = await client
    .from('gameplay_active_seat_controls')
    .select('control_owner')
    .eq('table_id', tableId)
    .eq('seat_number', directive.seat + 1)
    .single();
  if (seatError !== null) throw new Error(seatError.message);
  const controlOwner = object(seatData)?.control_owner;
  const sourceMatches = directive.source === 'permanent-bot'
    ? controlOwner === 'permanent-bot'
    : directive.source === 'disconnect-substitute'
      ? controlOwner === 'temporary-bot'
      : controlOwner === 'human';
  if (!sourceMatches) return undefined;

  return {
    directive,
    workspaceId,
    controlVersion: control.version,
    beginExpectedVersion,
    ...(completeExpectedVersion === undefined ? {} : { completeExpectedVersion }),
    completed: false,
  };
}

async function userRpc(
  client: ServiceClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const { data, error } = await client.rpc(name, args);
  if (error !== null) throw new Error(error.message);
  const result = object(Array.isArray(data) ? data[0] : data);
  if (result === undefined) throw new Error(`${name} returned an incomplete response.`);
  return result;
}

class SupabaseHumanActionBoundaryPort
  implements HumanActionBoundaryPort {
  constructor(
    private readonly serviceClient: ServiceClient,
    private readonly authClient: ServiceClient,
  ) {}

  async resolve(input: {
    readonly tableId: string;
    readonly actorUserId: string;
    readonly roundCommandId: string;
    readonly actionKind: HumanActionKind;
  }): Promise<HumanBoundaryResolution> {
    const completionId = `human-complete:${input.roundCommandId}`;

    const completedCommand = await commandRecord(
      this.serviceClient,
      input.tableId,
      completionId,
    );

    if (completedCommand?.accepted === true) {
      return { valid: true, completed: true };
    }

    const { data: tableData, error: tableError } =
      await this.serviceClient
        .from('gameplay_tables')
        .select('workspace_id')
        .eq('id', input.tableId)
        .single();

    if (tableError !== null) {
      return { valid: false, errors: [tableError.message] };
    }

    const workspaceId = object(tableData)?.workspace_id;

    if (typeof workspaceId !== 'string') {
      return {
        valid: false,
        errors: ['Gameplay workspace could not be resolved.'],
      };
    }

    const { data: controlData, error: controlError } =
      await this.serviceClient
        .from('gameplay_active_controls')
        .select(
          'version,lifecycle,turn_seat,turn_action_kind,turn_status',
        )
        .eq('table_id', input.tableId)
        .single();

    if (controlError !== null) {
      return { valid: false, errors: [controlError.message] };
    }

    const control = object(controlData);

    const controlVersion =
      typeof control?.version === 'number'
        ? control.version
        : undefined;

    const lifecycle =
      typeof control?.lifecycle === 'string'
        ? control.lifecycle
        : undefined;

    const turnSeat =
      typeof control?.turn_seat === 'number'
        ? control.turn_seat
        : undefined;

    const turnActionKind =
      typeof control?.turn_action_kind === 'string'
        ? control.turn_action_kind
        : undefined;

    const turnStatus =
      typeof control?.turn_status === 'string'
        ? control.turn_status
        : undefined;

    const { data: seatData, error: seatError } =
      await this.serviceClient
        .from('gameplay_active_seat_controls')
        .select('seat_number,control_owner')
        .eq('table_id', input.tableId)
        .eq('human_user_id', input.actorUserId)
        .single();

    if (seatError !== null) {
      return { valid: false, errors: [seatError.message] };
    }

    const seat = object(seatData);

    const seatNumber =
      typeof seat?.seat_number === 'number'
        ? seat.seat_number
        : undefined;

    const controlOwner =
      typeof seat?.control_owner === 'string'
        ? seat.control_owner
        : undefined;

    const recoverableStatuses = ['running', 'assistant-pending', 'bot-processing'];

    if (
      controlVersion === undefined
      || lifecycle !== 'active'
      || seatNumber === undefined
      || controlOwner !== 'human'
      || turnSeat !== seatNumber
      || turnActionKind !== input.actionKind
      || turnStatus === undefined
      || !recoverableStatuses.includes(turnStatus)
    ) {
      return {
        valid: false,
        errors: [
          'Human action does not match the authoritative active-control turn.',
        ],
      };
    }

    return {
      valid: true,
      completed: false,
      workspaceId,
      expectedVersion: controlVersion,
    };
  }

  async complete(
    input: HumanBoundaryCompletionInput,
  ): Promise<{
    readonly valid: boolean;
    readonly errors: readonly string[];
  }> {
    const completed = await userRpc(
      this.authClient,
      'complete_active_action_boundary',
      {
        p_table_id: input.tableId,
        p_workspace_id: input.workspaceId,
        p_actor_user_id: input.actorUserId,
        p_command_id: input.commandId,
        p_expected_version: input.expectedVersion,
        p_next_turn: input.nextTurn,
        p_occurred_at: input.occurredAt,
      },
    );

    if (completed.valid === true) {
      return { valid: true, errors: [] };
    }

    const errors = stringArray(completed.errors);

    return {
      valid: false,
      errors: errors.length > 0
        ? errors
        : ['Human action boundary could not complete.'],
    };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ valid: false, errors: ['POST is required.'] }, 405);

  const authorization = request.headers.get('authorization');
  if (authorization === null || authorization.trim().length === 0) {
    return json({ valid: false, errors: ['Authorization header is required.'] }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl === undefined || anonKey === undefined || serviceRoleKey === undefined) {
    return json({ valid: false, errors: ['Gameplay service configuration is incomplete.'] }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError !== null || authData.user === null) {
    return json({ valid: false, errors: ['Authenticated user could not be resolved.'] }, 401);
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return json({ valid: false, errors: ['Request body must be valid JSON.'] }, 400);
  }

  if (!validTableId(body.tableId)) {
    return json({ valid: false, errors: ['A valid gameplay table ID is required.'] }, 400);
  }
  const tableId = body.tableId;

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = new SupabaseGameplayRoundRepository(serviceClient);
  const service = new GameplayRoundApplicationService(repository);
  const botService = new GameplayBotDirectiveService(repository);
  const humanBoundary = new SupabaseHumanActionBoundaryPort(
    serviceClient,
    authClient,
  );
  const actor = { userId: authData.user.id };

  try {
    if (body.action === 'snapshot') {
      return json(await service.getSnapshot(tableId, actor));
    }
    if (body.action === 'start-next-round') {
      if (!validNextRoundInput(body)) {
        return json({ valid: false, errors: ['NEXT_ROUND_COMMAND_INCOMPLETE'], duplicate: false }, 400);
      }
      return json(await handleStartNextRound({
        tableId,
        commandId: body.commandId,
        expectedRoundNumber: body.expectedRoundNumber,
        expectedRoundVersion: body.expectedRoundVersion,
        expectedControlVersion: body.expectedControlVersion,
      }, nextRoundPorts(serviceClient, repository, service, actor.userId)));
    }
    if (body.action === 'submit-bid') {
      if (!validCommandInput(body) || body.bid === undefined) {
        return json({ valid: false, errors: ['Bid command is incomplete.'] }, 400);
      }
      return json(await coordinateHumanRoundAction({
        tableId,
        actorUserId: actor.userId,
        roundCommandId: body.commandId!,
        actionKind: 'bid',
        boundary: humanBoundary,
        occurredAt: new Date().toISOString(),
        executeRound: () => service.submitBid(
          tableId,
          actor,
          body.commandId!,
          body.expectedVersion!,
          body.bid!,
        ),
      }));
    }
    if (body.action === 'submit-auction-action') {
      if (!validCommandInput(body) || body.auctionAction === undefined) {
        return json({ valid: false, errors: ['Auction command is incomplete.'] }, 400);
      }
      return json(await coordinateHumanRoundAction({
        tableId,
        actorUserId: actor.userId,
        roundCommandId: body.commandId!,
        actionKind: 'bid',
        boundary: humanBoundary,
        occurredAt: new Date().toISOString(),
        executeRound: () => service.submitAuctionAction(
          tableId,
          actor,
          body.commandId!,
          body.expectedVersion!,
          body.auctionAction!,
        ),
      }));
    }
    if (body.action === 'play-card') {
      if (!validCommandInput(body) || body.card === undefined) {
        return json({ valid: false, errors: ['Card command is incomplete.'] }, 400);
      }
      return json(await coordinateHumanRoundAction({
        tableId,
        actorUserId: actor.userId,
        roundCommandId: body.commandId!,
        actionKind: 'card',
        boundary: humanBoundary,
        occurredAt: new Date().toISOString(),
        executeRound: () => service.playCard(
          tableId,
          actor,
          body.commandId!,
          body.expectedVersion!,
          body.card!,
        ),
      }));
    }
    if (body.action === 'process-bot-directive') {
      const directiveId = typeof body.directiveId === 'string' ? body.directiveId.trim() : '';
      if (directiveId.length === 0) {
        return json({ valid: false, errors: ['Bot directive ID is required.'], terminal: true }, 400);
      }
      const context = await loadIssuedDirective(serviceClient, tableId, directiveId);
      if (context === undefined) {
        return json({ valid: false, errors: ['Bot directive is stale.'], terminal: true });
      }
      if (context.completed) {
        const existing = await service.getSnapshot(tableId, actor);
        return json({ ...existing, terminal: true });
      }

      const beganAt = new Date().toISOString();
      const begin = await userRpc(authClient, 'begin_active_bot_action', {
        p_table_id: tableId,
        p_workspace_id: context.workspaceId,
        p_actor_user_id: authData.user.id,
        p_command_id: `bot-begin:${directiveId}`,
        p_expected_version: context.beginExpectedVersion,
        p_turn_id: context.directive.turnId,
        p_seat: context.directive.seat,
        p_occurred_at: beganAt,
      });
      if (begin.valid !== true || typeof begin.version !== 'number') {
        return json({
          valid: false,
          errors: stringArray(begin.errors).length > 0
            ? stringArray(begin.errors)
            : ['Bot action could not begin.'],
          terminal: true,
        });
      }

      const botResult = await botService.process(tableId, actor, context.directive);
      if (!botResult.valid || botResult.value === undefined) {
        return json({ ...botResult, terminal: true });
      }

      const next = nextAuthoritativeTurn(botResult.value);
      const completeExpectedVersion = context.completeExpectedVersion ?? begin.version;
      const completedAt = new Date().toISOString();
      const completed = await userRpc(authClient, 'complete_active_action_boundary', {
        p_table_id: tableId,
        p_workspace_id: context.workspaceId,
        p_actor_user_id: authData.user.id,
        p_command_id: `bot-complete:${directiveId}`,
        p_expected_version: completeExpectedVersion,
        p_next_turn: next,
        p_occurred_at: completedAt,
      });
      if (completed.valid !== true) {
        return json({
          valid: false,
          errors: stringArray(completed.errors).length > 0
            ? stringArray(completed.errors)
            : ['Bot action boundary could not complete.'],
          terminal: false,
        });
      }
      return json({ ...botResult, terminal: true });
    }
    return json({ valid: false, errors: ['Unsupported gameplay round action.'] }, 400);
  } catch (error) {
    return json({
      valid: false,
      errors: [error instanceof Error ? error.message : 'Gameplay round command failed.'],
      terminal: false,
    }, 500);
  }
});
