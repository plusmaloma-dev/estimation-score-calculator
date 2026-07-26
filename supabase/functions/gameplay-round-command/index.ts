import { createClient } from '@supabase/supabase-js';
import { GameplayRoundApplicationService } from '../../../src/gameplay/GameplayRoundApplicationService.ts';
import type {
  GameplayRoundAggregate,
  GameplayRoundCommitInput,
  GameplayRoundCommitResult,
  GameplayRoundRepository,
} from '../../../src/gameplay/roundApplicationTypes.ts';
import type { EstimationBid } from '../../../src/domain/bid.ts';
import type { Card } from '../../../src/domain/card.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface RequestBody {
  readonly action?: 'snapshot' | 'submit-bid' | 'play-card';
  readonly tableId?: string;
  readonly commandId?: string;
  readonly expectedVersion?: number;
  readonly bid?: EstimationBid;
  readonly card?: Card;
}

interface RpcResult {
  readonly valid?: boolean;
  readonly errors?: readonly string[];
  readonly accepted?: boolean;
  readonly duplicate?: boolean;
  readonly aggregate?: GameplayRoundAggregate;
}

type ServiceClient = ReturnType<typeof createClient>;

class SupabaseGameplayRoundRepository implements GameplayRoundRepository {
  constructor(private readonly client: ServiceClient) {}

  async load(tableId: string): Promise<GameplayRoundAggregate | undefined> {
    const { data, error } = await this.client.rpc('load_gameplay_round_for_engine', {
      p_table_id: tableId,
    });
    if (error !== null) throw new Error(error.message);
    const payload = this.object(Array.isArray(data) ? data[0] : data) as RpcResult | undefined;
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

    const payload = this.object(Array.isArray(data) ? data[0] : data) as RpcResult | undefined;
    const persistedOutcome = payload?.valid === true || typeof payload?.accepted === 'boolean';
    if (!persistedOutcome) {
      return {
        valid: false,
        errors: this.stringArray(payload?.errors).length > 0
          ? this.stringArray(payload?.errors)
          : ['Gameplay round command could not be committed.'],
      };
    }

    const aggregate = await this.load(input.tableId);
    return aggregate === undefined
      ? { valid: false, errors: ['Committed gameplay round could not be reloaded.'] }
      : { valid: true, errors: [], aggregate };
  }

  private object(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>>
      : undefined;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
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
  const service = new GameplayRoundApplicationService(
    new SupabaseGameplayRoundRepository(serviceClient),
  );
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
    return json({ valid: false, errors: ['Unsupported gameplay round action.'] }, 400);
  } catch (error) {
    return json({
      valid: false,
      errors: [error instanceof Error ? error.message : 'Gameplay round command failed.'],
    }, 500);
  }
});
