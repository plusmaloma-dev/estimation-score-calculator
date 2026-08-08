-- Replace only the private round bootstrap/read RPCs after hosted UAT exposed
-- PL/pgSQL name collisions around `table_id`. Applied migrations stay immutable.
create or replace function public.initialize_gameplay_round_state(
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
  control_row public.gameplay_active_controls%rowtype;
  existing_state public.gameplay_round_states%rowtype;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Actor user ID is required.'));
  end if;
  if p_round_number < 1 then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Round number must be positive.'));
  end if;
  if p_phase not in ('bidding', 'playing', 'scored') then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Invalid gameplay round phase.'));
  end if;
  if p_aggregate is null or jsonb_typeof(p_aggregate) <> 'object' then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Gameplay round aggregate is required.'));
  end if;

  select * into control_row
  from public.gameplay_active_controls control_record
  where control_record.table_id = p_table_id
  for update;

  if not found then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Active gameplay table was not found.'));
  end if;
  if control_row.lifecycle <> 'active' then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Gameplay round can only be initialized for an active table.'));
  end if;
  if control_row.host_user_id is distinct from p_actor_user_id then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Only the active host can initialize the gameplay round.'));
  end if;

  select * into existing_state
  from public.gameplay_round_states state_record
  where state_record.table_id = p_table_id;

  if found then
    return jsonb_build_object(
      'valid', true,
      'errors', '[]'::jsonb,
      'duplicate', true,
      'version', existing_state.version,
      'phase', existing_state.phase
    );
  end if;

  insert into public.gameplay_round_states (
    table_id, round_number, phase, version, aggregate, updated_by
  ) values (
    p_table_id, p_round_number, p_phase, 0, p_aggregate, p_actor_user_id
  );

  insert into public.gameplay_round_invalidations (
    table_id, version, phase, occurred_at
  ) values (
    p_table_id, 0, p_phase, p_occurred_at
  );

  return jsonb_build_object(
    'valid', true,
    'errors', '[]'::jsonb,
    'duplicate', false,
    'version', 0,
    'phase', p_phase
  );
end;
$$;

revoke all on function public.initialize_gameplay_round_state(uuid, uuid, integer, text, jsonb, timestamptz) from public;
grant execute on function public.initialize_gameplay_round_state(uuid, uuid, integer, text, jsonb, timestamptz) to service_role;

create or replace function public.load_gameplay_round_for_engine(
  p_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  state_row public.gameplay_round_states%rowtype;
  control_row public.gameplay_active_controls%rowtype;
  command_rows jsonb;
  seat_rows jsonb;
begin
  select * into state_row
  from public.gameplay_round_states state_record
  where state_record.table_id = p_table_id;

  if not found then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Gameplay round was not found.'));
  end if;

  select * into control_row
  from public.gameplay_active_controls control_record
  where control_record.table_id = p_table_id;

  if not found then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Active gameplay control was not found.'));
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'commandId', command_record.command_id,
      'expectedVersion', command_record.expected_version,
      'command', command_record.payload,
      'accepted', command_record.accepted,
      'resultingVersion', command_record.resulting_version,
      'errors', command_record.errors,
      'transition', command_record.transition
    ) order by command_record.id
  ), '[]'::jsonb)
  into command_rows
  from public.gameplay_round_commands command_record
  where command_record.table_id = p_table_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seat', seat_record.seat_number - 1,
      'humanUserId', seat_record.human_user_id,
      'botId', seat_record.bot_id,
      'controlOwner', seat_record.control_owner
    ) order by seat_record.seat_number
  ), '[]'::jsonb)
  into seat_rows
  from public.gameplay_active_seat_controls seat_record
  where seat_record.table_id = p_table_id;

  return jsonb_build_object(
    'valid', true,
    'errors', '[]'::jsonb,
    'aggregate', jsonb_build_object(
      'tableId', state_row.table_id,
      'lifecycle', control_row.lifecycle,
      'state', state_row.aggregate,
      'version', state_row.version,
      'records', command_rows,
      'seatControls', seat_rows
    )
  );
end;
$$;

revoke all on function public.load_gameplay_round_for_engine(uuid) from public;
grant execute on function public.load_gameplay_round_for_engine(uuid) to service_role;
