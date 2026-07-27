import { createClient } from '@supabase/supabase-js';
import { GameplayRoundApplicationService } from '../../../src/gameplay/GameplayRoundApplicationService.ts';
import { GameplayBotDirectiveService } from '../../../src/gameplay/bot/GameplayBotDirectiveService.ts';
import type {
  GameplayRoundAggregate,
  GameplayRoundCommitInput,
  GameplayRoundCommitResult,
  GameplayRoundRepository,
} from '../../../src/gameplay/roundApplicationTypes.ts';
import type { BotActionDirective } from '../../../src/gameplay/control/types.ts';
import type { EstimationBid } from '../../../src/domain/bid.ts';
import type { Card } from '../../../src/domain/card.ts';
import type { OnlineGameplayRoundSnapshot } from '../../../src/online/gameplay/roundTypes.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface RequestBody {
  readonly action?: 'snapshot' | 'submit-bid' | 'play-card' | 'process-bot-directive';
  readonly tableId?: string;
  readonly commandId?: string;
  readonly expectedVersion?: number;
  readonly bid?: EstimationBid;
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

type ServiceClient = ReturnType<typeof createClient>;

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
    const { data, error } = await this.client.rpc('commit_gameplay_round_command', {
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
    .select('directives')
    .eq('table_id', tableId)
    .contains('directives', [{ directiveId }])
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (directiveError !== null) throw new Error(directiveError.message);
  const directiveRows = object(directiveData)?.directives;
  const directive = Array.isArray(directiveRows)
    ? directiveRows.map(parseDirective).find((item) => item?.directiveId === directiveId)
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

function nextTurn(snapshot: OnlineGameplayRoundSnapshot): Readonly<Record<string, unknown>> | null {
  const seat = snapshot.phase === 'bidding'
    ? snapshot.nextBidSeat
    : snapshot.phase === 'playing'
      ? snapshot.currentTurnSeat
      : undefined;
  if (seat === undefined) return null;
  const actionKind = snapshot.phase === 'bidding' ? 'bid' : 'card';
  return {
    turnId: `round-${snapshot.roundNumber}:${actionKind}:${snapshot.version}:${seat}`,
    seat,
    actionKind,
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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = new SupabaseGameplayRoundRepository(serviceClient);
  const service = new GameplayRoundApplicationService(repository);
  const botService = new GameplayBotDirectiveService(repository);
  const actor = { userId: authData.user.id };

  try {
    if (body.action === 'snapshot') {
      return json(await service.getSnapshot(body.tableId, actor));
    }
    if (body.action === 'submit-bid') {
      if (!validCommandInput(body) || body.bid === undefined) {
        return json({ valid: false, errors: ['Bid command is incomplete.'] }, 400);
      }
      return json(await service.submitBid(
        body.tableId,
        actor,
        body.commandId!,
        body.expectedVersion!,
        body.bid,
      ));
    }
    if (body.action === 'play-card') {
      if (!validCommandInput(body) || body.card === undefined) {
        return json({ valid: false, errors: ['Card command is incomplete.'] }, 400);
      }
      return json(await service.playCard(
        body.tableId,
        actor,
        body.commandId!,
        body.expectedVersion!,
        body.card,
      ));
    }
    if (body.action === 'process-bot-directive') {
      const directiveId = typeof body.directiveId === 'string' ? body.directiveId.trim() : '';
      if (directiveId.length === 0) {
        return json({ valid: false, errors: ['Bot directive ID is required.'], terminal: true }, 400);
      }
      const context = await loadIssuedDirective(serviceClient, body.tableId, directiveId);
      if (context === undefined) {
        return json({ valid: false, errors: ['Bot directive is stale.'], terminal: true });
      }
      if (context.completed) {
        const existing = await service.getSnapshot(body.tableId, actor);
        return json({ ...existing, terminal: true });
      }

      const beganAt = new Date().toISOString();
      const begin = await userRpc(authClient, 'begin_active_bot_action', {
        p_table_id: body.tableId,
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

      const botResult = await botService.process(body.tableId, actor, context.directive);
      if (!botResult.valid || botResult.value === undefined) {
        return json({ ...botResult, terminal: true });
      }

      const next = nextTurn(botResult.value);
      const completeExpectedVersion = context.completeExpectedVersion ?? begin.version;
      const completedAt = new Date().toISOString();
      const completed = await userRpc(authClient, 'complete_active_action_boundary', {
        p_table_id: body.tableId,
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
