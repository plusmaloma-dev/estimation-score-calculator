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
  from public.gameplay_active_controls
  where table_id = p_table_id
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
  from public.gameplay_round_states
  where table_id = p_table_id;

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
  from public.gameplay_round_states
  where table_id = p_table_id;

  if not found then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Gameplay round was not found.'));
  end if;

  select * into control_row
  from public.gameplay_active_controls
  where table_id = p_table_id;

  if not found then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Active gameplay control was not found.'));
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'commandId', command_id,
      'expectedVersion', expected_version,
      'command', payload,
      'accepted', accepted,
      'resultingVersion', resulting_version,
      'errors', errors,
      'transition', transition
    ) order by id
  ), '[]'::jsonb)
  into command_rows
  from public.gameplay_round_commands
  where table_id = p_table_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seat', seat_number - 1,
      'humanUserId', human_user_id,
      'botId', bot_id,
      'controlOwner', control_owner
    ) order by seat_number
  ), '[]'::jsonb)
  into seat_rows
  from public.gameplay_active_seat_controls
  where table_id = p_table_id;

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

create or replace function public.commit_gameplay_round_command(
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
  current_state public.gameplay_round_states%rowtype;
  existing_command public.gameplay_round_commands%rowtype;
begin
  if p_command_id is null or length(trim(p_command_id)) = 0 then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Gameplay command ID is required.'));
  end if;
  if p_actor_seat not between 1 and 4 then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Actor seat must be between 1 and 4.'));
  end if;
  if p_command_type not in ('SUBMIT_BID', 'PLAY_CARD') then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Unsupported gameplay command type.'));
  end if;

  select * into current_state
  from public.gameplay_round_states
  where table_id = p_table_id
  for update;

  if not found then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Gameplay round was not found.'));
  end if;

  select * into existing_command
  from public.gameplay_round_commands
  where table_id = p_table_id
    and command_id = p_command_id;

  if found then
    if existing_command.actor_user_id is distinct from p_actor_user_id
      or existing_command.actor_seat is distinct from p_actor_seat
      or existing_command.command_type is distinct from p_command_type
      or existing_command.expected_version is distinct from p_expected_version
      or existing_command.payload is distinct from p_payload then
      return jsonb_build_object(
        'valid', false,
        'errors', jsonb_build_array('Command id was already used with a different payload.'),
        'duplicate', false,
        'version', current_state.version
      );
    end if;

    return jsonb_build_object(
      'valid', existing_command.accepted,
      'errors', existing_command.errors,
      'duplicate', true,
      'version', existing_command.resulting_version,
      'accepted', existing_command.accepted
    );
  end if;

  if current_state.version is distinct from p_base_version then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(format(
        'Current gameplay round version %s does not match loaded base version %s.',
        current_state.version,
        p_base_version
      )),
      'duplicate', false,
      'version', current_state.version
    );
  end if;

  if p_accepted then
    if p_resulting_version <> p_base_version + 1 then
      return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Accepted command must increment the gameplay version exactly once.'));
    end if;
    if p_resulting_aggregate is null or jsonb_typeof(p_resulting_aggregate) <> 'object' then
      return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Accepted command requires a resulting aggregate.'));
    end if;
    if p_resulting_phase not in ('bidding', 'playing', 'scored') then
      return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Accepted command requires a valid resulting phase.'));
    end if;
  else
    if p_resulting_version <> p_base_version then
      return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Rejected command cannot change the gameplay version.'));
    end if;
  end if;

  insert into public.gameplay_round_commands (
    table_id,
    command_id,
    command_type,
    expected_version,
    resulting_version,
    actor_user_id,
    actor_seat,
    occurred_at,
    payload,
    accepted,
    errors,
    transition
  ) values (
    p_table_id,
    trim(p_command_id),
    p_command_type,
    p_expected_version,
    p_resulting_version,
    p_actor_user_id,
    p_actor_seat,
    p_occurred_at,
    p_payload,
    p_accepted,
    coalesce(p_errors, '[]'::jsonb),
    coalesce(p_transition, '{}'::jsonb)
  );

  if p_accepted then
    update public.gameplay_round_states
    set aggregate = p_resulting_aggregate,
        phase = p_resulting_phase,
        version = p_resulting_version,
        updated_by = p_actor_user_id
    where table_id = p_table_id;

    insert into public.gameplay_round_invalidations (
      table_id, version, phase, occurred_at
    ) values (
      p_table_id, p_resulting_version, p_resulting_phase, p_occurred_at
    );
  end if;

  return jsonb_build_object(
    'valid', p_accepted,
    'errors', coalesce(p_errors, '[]'::jsonb),
    'duplicate', false,
    'version', p_resulting_version,
    'accepted', p_accepted
  );
end;
$$;

revoke all on function public.commit_gameplay_round_command(uuid, uuid, smallint, text, text, integer, integer, integer, jsonb, boolean, jsonb, jsonb, jsonb, text, timestamptz) from public;
grant execute on function public.commit_gameplay_round_command(uuid, uuid, smallint, text, text, integer, integer, integer, jsonb, boolean, jsonb, jsonb, jsonb, text, timestamptz) to service_role;
