import { createClient } from '@supabase/supabase-js';
import { GameplayRoundApplicationService } from '../../../src/gameplay/GameplayRoundApplicationService.ts';
import type {
  GameplayRoundActor,
  GameplayRoundAggregate,
  GameplayRoundCommitInput,
  GameplayRoundCommitResult,
  GameplayRoundRepository,
} from '../../../src/gameplay/roundApplicationTypes.ts';
import { GameplaySessionBootstrapService } from '../../../src/gameplay/session/GameplaySessionBootstrapService.ts';
import type { GameplaySeatPlayers, HouseRulesRoundState, SeatIndex } from '../../../src/gameplay/types.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface RequestBody {
  readonly tableId?: string;
  readonly expectedVersion?: number;
  readonly commandId?: string;
}

interface RpcEnvelope {
  readonly valid?: boolean;
  readonly errors?: readonly string[];
  readonly aggregate?: GameplayRoundAggregate;
  readonly version?: number;
  readonly turn?: Readonly<Record<string, unknown>> | null;
}

interface StartedSeatRow {
  readonly seat_number: number;
  readonly seat_kind: 'human' | 'bot';
  readonly user_id: string | null;
  readonly bot_id: string | null;
}

type ServiceClient = ReturnType<typeof createClient>;

class ReadOnlyGameplayRoundRepository implements GameplayRoundRepository {
  constructor(private readonly client: ServiceClient) {}

  async load(tableId: string): Promise<GameplayRoundAggregate | undefined> {
    const { data, error } = await this.client.rpc('load_gameplay_round_for_engine', {
      p_table_id: tableId,
    });
    if (error !== null) throw new Error(error.message);
    const payload = object(Array.isArray(data) ? data[0] : data) as RpcEnvelope | undefined;
    return payload?.valid === true ? payload.aggregate : undefined;
  }

  async commit(_input: GameplayRoundCommitInput): Promise<GameplayRoundCommitResult> {
    return {
      valid: false,
      errors: ['Start bootstrap repository is read-only after initialization.'],
    };
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

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function rpc(
  client: ServiceClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<RpcEnvelope> {
  const { data, error } = await client.rpc(name, args);
  if (error !== null) throw new Error(error.message);
  const result = object(Array.isArray(data) ? data[0] : data) as RpcEnvelope | undefined;
  if (result === undefined) throw new Error(`${name} returned an incomplete response.`);
  return result;
}

async function existingCommandExpectedVersion(
  client: ServiceClient,
  tableId: string,
  commandId: string,
): Promise<number | undefined> {
  const { data, error } = await client
    .from('gameplay_active_control_commands')
    .select('expected_version')
    .eq('table_id', tableId)
    .eq('command_id', commandId)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  const expectedVersion = object(data)?.expected_version;
  return typeof expectedVersion === 'number' && Number.isInteger(expectedVersion)
    ? expectedVersion
    : undefined;
}

async function loadStartedPlayers(
  client: ServiceClient,
  tableId: string,
): Promise<GameplaySeatPlayers> {
  const { data, error } = await client
    .from('gameplay_table_seats')
    .select('seat_number,seat_kind,user_id,bot_id')
    .eq('table_id', tableId)
    .order('seat_number', { ascending: true });
  if (error !== null) throw new Error(error.message);
  if (!Array.isArray(data) || data.length !== 4) {
    throw new Error('Started gameplay table must contain exactly four seats.');
  }

  const players = data.map((value) => {
    const row = object(value) as unknown as StartedSeatRow | undefined;
    if (
      row === undefined
      || !Number.isInteger(row.seat_number)
      || row.seat_number < 1
      || row.seat_number > 4
    ) throw new Error('Started gameplay seat is invalid.');
    const playerId = row.seat_kind === 'human' ? row.user_id : row.bot_id;
    if (typeof playerId !== 'string' || playerId.trim().length === 0) {
      throw new Error(`Started gameplay seat ${row.seat_number} has no player identity.`);
    }
    return {
      seat: (row.seat_number - 1) as SeatIndex,
      playerId: playerId.trim(),
    };
  });

  if (new Set(players.map((player) => player.seat)).size !== 4) {
    throw new Error('Started gameplay seats must cover seats 0, 1, 2, and 3.');
  }
  return players as unknown as GameplaySeatPlayers;
}

async function initializeRound(
  client: ServiceClient,
  tableId: string,
  actorUserId: string,
): Promise<HouseRulesRoundState> {
  const repository = new ReadOnlyGameplayRoundRepository(client);
  const existing = await repository.load(tableId);
  if (existing !== undefined) return existing.state;

  const players = await loadStartedPlayers(client, tableId);
  const seedHex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const bootstrap = await new GameplaySessionBootstrapService().bootstrap({
    tableId,
    roundNumber: 1,
    seats: players,
    seedHex,
    dealId: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
  });
  const occurredAt = new Date().toISOString();
  const initialized = await rpc(client, 'initialize_gameplay_round_state', {
    p_table_id: tableId,
    p_actor_user_id: actorUserId,
    p_round_number: bootstrap.state.roundNumber,
    p_phase: bootstrap.state.phase,
    p_aggregate: bootstrap.state,
    p_occurred_at: occurredAt,
  });
  if (initialized.valid !== true) {
    const errors = stringArray(initialized.errors);
    throw new Error(errors[0] ?? 'Gameplay round state could not be initialized.');
  }
  return bootstrap.state;
}

function firstTurnFromState(state: HouseRulesRoundState): {
  readonly turnId: string;
  readonly seat: SeatIndex;
  readonly actionKind: 'bid';
} | undefined {
  if (state.phase !== 'bidding' || state.currentBidIndex !== 0) return undefined;
  const seat = state.bidOrder[0];
  return {
    turnId: `round-${state.roundNumber}:bid:0:${seat}`,
    seat,
    actionKind: 'bid',
  };
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
    return json({ valid: false, errors: ['Gameplay Start configuration is incomplete.'] }, 500);
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
  const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : '';
  if (
    !validTableId(body.tableId)
    || !Number.isInteger(body.expectedVersion)
    || (body.expectedVersion ?? -1) < 0
    || commandId.length === 0
  ) {
    return json({ valid: false, errors: ['Start Game command is incomplete.'] }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actor: GameplayRoundActor = { userId: authData.user.id };

  try {
    const { data: tableData, error: tableError } = await serviceClient
      .from('gameplay_tables')
      .select('workspace_id')
      .eq('id', body.tableId)
      .single();
    if (tableError !== null) throw new Error(tableError.message);
    const workspaceId = object(tableData)?.workspace_id;
    if (typeof workspaceId !== 'string') throw new Error('Gameplay workspace could not be resolved.');

    const started = await rpc(authClient, 'start_gameplay_table', {
      p_table_id: body.tableId,
      p_workspace_id: workspaceId,
      p_actor_user_id: actor.userId,
      p_command_id: `table-start:${commandId}`,
      p_expected_version: body.expectedVersion,
    });
    if (started.valid === false) {
      return json({
        valid: false,
        errors: stringArray(started.errors).length > 0
          ? stringArray(started.errors)
          : ['Gameplay table could not start.'],
      });
    }

    const occurredAt = new Date().toISOString();
    const control = await rpc(authClient, 'initialize_active_game_control', {
      p_table_id: body.tableId,
      p_workspace_id: workspaceId,
      p_actor_user_id: actor.userId,
      p_command_id: `control-init:${commandId}`,
      p_occurred_at: occurredAt,
    });
    if (control.valid !== true || typeof control.version !== 'number') {
      return json({
        valid: false,
        errors: stringArray(control.errors).length > 0
          ? stringArray(control.errors)
          : ['Active game control could not be initialized.'],
      });
    }

    const roundState = await initializeRound(serviceClient, body.tableId, actor.userId);
    const firstTurn = firstTurnFromState(roundState);
    if (firstTurn !== undefined && (control.turn === null || control.turn === undefined)) {
      const turnCommandId = `turn-start:${commandId}`;
      const existingExpectedVersion = await existingCommandExpectedVersion(
        serviceClient,
        body.tableId,
        turnCommandId,
      );
      const turnResult = await rpc(authClient, 'start_active_game_turn', {
        p_table_id: body.tableId,
        p_workspace_id: workspaceId,
        p_actor_user_id: actor.userId,
        p_command_id: turnCommandId,
        p_expected_version: existingExpectedVersion ?? control.version,
        p_turn_id: firstTurn.turnId,
        p_seat: firstTurn.seat,
        p_action_kind: firstTurn.actionKind,
        p_occurred_at: new Date().toISOString(),
      });
      if (turnResult.valid !== true) {
        return json({
          valid: false,
          errors: stringArray(turnResult.errors).length > 0
            ? stringArray(turnResult.errors)
            : ['First bidding turn could not be started.'],
        });
      }
    }

    const roundService = new GameplayRoundApplicationService(
      new ReadOnlyGameplayRoundRepository(serviceClient),
    );
    return json(await roundService.getSnapshot(body.tableId, actor));
  } catch (error) {
    return json({
      valid: false,
      errors: [error instanceof Error ? error.message : 'Gameplay Start failed.'],
    }, 500);
  }
});
