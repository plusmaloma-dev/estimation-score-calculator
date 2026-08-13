-- Adds explicit auction/estimate lifecycle phases without rewriting retained
-- round aggregates. Existing private RPCs remain the ledger implementation;
-- these service-role wrappers atomically restore the richer persisted phase.

alter table public.gameplay_round_states
  drop constraint if exists gameplay_round_states_phase_check;
alter table public.gameplay_round_states
  add constraint gameplay_round_states_phase_check
  check (phase in ('auction', 'estimate', 'bidding', 'playing', 'scored'));

alter table public.gameplay_round_invalidations
  drop constraint if exists gameplay_round_invalidations_phase_check;
alter table public.gameplay_round_invalidations
  add constraint gameplay_round_invalidations_phase_check
  check (phase in ('auction', 'estimate', 'bidding', 'playing', 'scored'));

create or replace function public.initialize_gameplay_auction_round_state(
  p_table_id uuid,
  p_actor_user_id uuid,
  p_round_number integer,
  p_phase text,
  p_aggregate jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_phase not in ('auction', 'estimate', 'playing', 'scored') then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Invalid gameplay round phase.'));
  end if;
  result := public.initialize_gameplay_round_state(
    p_table_id, p_actor_user_id, p_round_number,
    case when p_phase in ('auction', 'estimate') then 'bidding' else p_phase end,
    p_aggregate, p_occurred_at
  );
  if result->>'valid' = 'true' then
    update public.gameplay_round_states
    set phase = p_phase
    where table_id = p_table_id;
    update public.gameplay_round_invalidations
    set phase = p_phase
    where table_id = p_table_id and version = coalesce((result->>'version')::integer, 0);
  end if;
  return result || jsonb_build_object('phase', p_phase);
end;
$$;

revoke all on function public.initialize_gameplay_auction_round_state(uuid, uuid, integer, text, jsonb, timestamptz) from public;
revoke all on function public.initialize_gameplay_auction_round_state(uuid, uuid, integer, text, jsonb, timestamptz) from anon;
revoke all on function public.initialize_gameplay_auction_round_state(uuid, uuid, integer, text, jsonb, timestamptz) from authenticated;
grant execute on function public.initialize_gameplay_auction_round_state(uuid, uuid, integer, text, jsonb, timestamptz) to service_role;

create or replace function public.commit_gameplay_round_auction_command(
  p_table_id uuid,
  p_actor_user_id uuid,
  p_actor_seat smallint,
  p_command_id text,
  p_command_type text,
  p_expected_version integer,
  p_base_version integer,
  p_resulting_version integer,
  p_payload jsonb,
  p_accepted boolean,
  p_errors jsonb,
  p_transition jsonb,
  p_resulting_aggregate jsonb,
  p_resulting_phase text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  stored_command_type text;
  stored_phase text;
begin
  if p_command_type not in ('SUBMIT_AUCTION_ACTION', 'SUBMIT_BID', 'PLAY_CARD') then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Unsupported gameplay command type.'));
  end if;
  if p_resulting_phase not in ('auction', 'estimate', 'playing', 'scored') then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Accepted command requires a valid resulting phase.'));
  end if;
  stored_command_type := case when p_command_type = 'SUBMIT_AUCTION_ACTION' then 'SUBMIT_BID' else p_command_type end;
  stored_phase := case when p_resulting_phase in ('auction', 'estimate') then 'bidding' else p_resulting_phase end;
  result := public.commit_gameplay_round_command(
    p_table_id, p_actor_user_id, p_actor_seat, p_command_id, stored_command_type,
    p_expected_version, p_base_version, p_resulting_version, p_payload,
    p_accepted, p_errors, p_transition, p_resulting_aggregate, stored_phase, p_occurred_at
  );
  if p_accepted and result->>'accepted' = 'true' then
    update public.gameplay_round_states
    set phase = p_resulting_phase
    where table_id = p_table_id and version = p_resulting_version;
    update public.gameplay_round_invalidations
    set phase = p_resulting_phase
    where table_id = p_table_id and version = p_resulting_version;
  end if;
  return result;
end;
$$;

revoke all on function public.commit_gameplay_round_auction_command(uuid, uuid, smallint, text, text, integer, integer, integer, jsonb, boolean, jsonb, jsonb, jsonb, text, timestamptz) from public;
revoke all on function public.commit_gameplay_round_auction_command(uuid, uuid, smallint, text, text, integer, integer, integer, jsonb, boolean, jsonb, jsonb, jsonb, text, timestamptz) from anon;
revoke all on function public.commit_gameplay_round_auction_command(uuid, uuid, smallint, text, text, integer, integer, integer, jsonb, boolean, jsonb, jsonb, jsonb, text, timestamptz) from authenticated;
grant execute on function public.commit_gameplay_round_auction_command(uuid, uuid, smallint, text, text, integer, integer, integer, jsonb, boolean, jsonb, jsonb, jsonb, text, timestamptz) to service_role;

create or replace function public.start_next_gameplay_auction_round(
  p_table_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_round_number integer,
  p_expected_round_version integer,
  p_expected_control_version integer,
  p_first_bid_seat integer,
  p_next_round_aggregate jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  next_version integer;
begin
  result := public.start_next_gameplay_round(
    p_table_id, p_actor_user_id, p_command_id, p_expected_round_number,
    p_expected_round_version, p_expected_control_version, p_first_bid_seat,
    p_next_round_aggregate, p_occurred_at
  );
  if result->>'valid' = 'true' then
    next_version := (result->>'roundVersion')::integer;
    update public.gameplay_round_states set phase = 'auction'
      where table_id = p_table_id and version = next_version;
    update public.gameplay_round_invalidations set phase = 'auction'
      where table_id = p_table_id and version = next_version;
    update public.gameplay_active_control_commands
    set transition = transition || jsonb_build_object('phase', 'auction')
    where table_id = p_table_id and command_id = trim(p_command_id);
  end if;
  return result || jsonb_build_object('phase', case when result->>'valid' = 'true' then 'auction' else coalesce(result->>'phase', '') end);
end;
$$;

revoke all on function public.start_next_gameplay_auction_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) from public;
revoke all on function public.start_next_gameplay_auction_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) from anon;
revoke all on function public.start_next_gameplay_auction_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) from authenticated;
grant execute on function public.start_next_gameplay_auction_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) to service_role;
