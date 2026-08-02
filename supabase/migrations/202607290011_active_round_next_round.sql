create or replace function public.start_next_gameplay_round(
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
  control_row public.gameplay_active_controls%rowtype;
  state_row public.gameplay_round_states%rowtype;
  table_row public.gameplay_tables%rowtype;
  existing_command public.gameplay_active_control_commands%rowtype;
  command_payload jsonb;
  command_errors jsonb;
  transition jsonb;
  events jsonb := '[]'::jsonb;
  next_round_number integer;
  next_round_version integer;
  next_control_version integer;
  next_turn_id text;
begin
  if p_command_id is null or length(trim(p_command_id)) = 0 then
    raise exception 'Next-round command ID is required.';
  end if;

  -- Lock order is always active control, then private round state. The active
  -- control row serializes concurrent host attempts before a replacement
  -- aggregate can be considered.
  select * into control_row
  from public.gameplay_active_controls
  where table_id = p_table_id
  for update;

  if not found then
    raise exception 'Active gameplay control was not found.';
  end if;

  command_payload := jsonb_build_object(
    'expectedRoundNumber', p_expected_round_number,
    'expectedRoundVersion', p_expected_round_version,
    'expectedControlVersion', p_expected_control_version,
    'firstBidSeat', p_first_bid_seat
  );

  select * into existing_command
  from public.gameplay_active_control_commands command_row
  where command_row.table_id = p_table_id
    and command_row.command_id = trim(p_command_id);

  if found then
    if existing_command.actor_user_id is distinct from p_actor_user_id
      or existing_command.command_type <> 'START_NEXT_ROUND'
      or existing_command.expected_version is distinct from p_expected_control_version
      or existing_command.payload is distinct from command_payload then
      raise exception 'Next-round command id was already used with a different payload.';
    end if;

    return existing_command.transition || jsonb_build_object('duplicate', true);
  end if;

  select * into state_row
  from public.gameplay_round_states
  where table_id = p_table_id
  for update;

  if not found then
    raise exception 'Gameplay round was not found.';
  end if;

  select * into table_row
  from public.gameplay_tables
  where id = p_table_id;

  if not found or table_row.lifecycle <> 'active' then
    command_errors := jsonb_build_array('Gameplay table is not active.');
  elsif control_row.lifecycle <> 'active' then
    command_errors := jsonb_build_array('Gameplay control is not active.');
  elsif control_row.host_user_id is distinct from p_actor_user_id then
    command_errors := jsonb_build_array('Only the active host can start the next round.');
  elsif state_row.phase <> 'scored' then
    command_errors := jsonb_build_array('Only a scored gameplay round can start the next round.');
  elsif control_row.turn_id is not null then
    command_errors := jsonb_build_array('The current active turn must complete before starting the next round.');
  elsif state_row.round_number is distinct from p_expected_round_number then
    command_errors := jsonb_build_array('Expected gameplay round number is stale.');
  elsif state_row.version is distinct from p_expected_round_version then
    command_errors := jsonb_build_array('Expected gameplay round version is stale.');
  elsif control_row.version is distinct from p_expected_control_version then
    command_errors := jsonb_build_array('Expected active-control version is stale.');
  elsif p_first_bid_seat not between 0 and 3 then
    command_errors := jsonb_build_array('First bid seat must be between 0 and 3.');
  elsif p_next_round_aggregate is null or jsonb_typeof(p_next_round_aggregate) <> 'object' then
    command_errors := jsonb_build_array('Next-round aggregate is required.');
  end if;

  if command_errors is not null then
    transition := jsonb_build_object(
      'valid', false,
      'errors', command_errors,
      'duplicate', false,
      'tableId', p_table_id,
      'roundNumber', state_row.round_number,
      'roundVersion', state_row.version,
      'controlVersion', control_row.version
    );
    return public.record_active_control_command(
      p_table_id,
      trim(p_command_id),
      'START_NEXT_ROUND',
      p_expected_control_version,
      control_row.version,
      p_actor_user_id,
      p_occurred_at,
      command_payload,
      false,
      command_errors,
      transition,
      '[]'::jsonb,
      '[]'::jsonb
    );
  end if;

  next_round_number := state_row.round_number + 1;
  next_round_version := state_row.version + 1;
  next_control_version := control_row.version + 1;
  next_turn_id := format(
    'round-%s:bid:%s:%s',
    next_round_number,
    next_round_version,
    p_first_bid_seat
  );

  update public.gameplay_round_states
  set round_number = next_round_number,
      phase = 'bidding',
      version = next_round_version,
      aggregate = p_next_round_aggregate,
      updated_by = p_actor_user_id
  where table_id = p_table_id;

  insert into public.gameplay_round_invalidations (
    table_id, version, phase, occurred_at
  ) values (
    p_table_id, next_round_version, 'bidding', p_occurred_at
  );

  update public.gameplay_active_controls
  set turn_id = next_turn_id,
      turn_seat = p_first_bid_seat + 1,
      turn_action_kind = 'bid',
      turn_started_at = p_occurred_at,
      turn_deadline_at = p_occurred_at + make_interval(secs => turn_timer_seconds),
      turn_remaining_ms = null,
      turn_status = 'running',
      version = next_control_version,
      updated_by = p_actor_user_id
  where table_id = p_table_id;

  events := jsonb_build_array(jsonb_build_object(
    'type', 'round.started',
    'occurredAt', p_occurred_at,
    'actorUserId', p_actor_user_id,
    'seat', p_first_bid_seat,
    'details', jsonb_build_object(
      'roundNumber', next_round_number,
      'roundVersion', next_round_version,
      'controlVersion', next_control_version,
      'turnId', next_turn_id,
      'actionKind', 'bid'
    )
  ));

  transition := jsonb_build_object(
    'valid', true,
    'errors', '[]'::jsonb,
    'duplicate', false,
    'tableId', p_table_id,
    'roundNumber', next_round_number,
    'roundVersion', next_round_version,
    'controlVersion', next_control_version,
    'phase', 'bidding',
    'firstTurn', jsonb_build_object(
      'turnId', next_turn_id,
      'seat', p_first_bid_seat,
      'actionKind', 'bid'
    )
  );

  return public.record_active_control_command(
    p_table_id,
    trim(p_command_id),
    'START_NEXT_ROUND',
    p_expected_control_version,
    next_control_version,
    p_actor_user_id,
    p_occurred_at,
    command_payload,
    true,
    '[]'::jsonb,
    transition,
    events,
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.start_next_gameplay_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) from public;
revoke all on function public.start_next_gameplay_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) from anon;
revoke all on function public.start_next_gameplay_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) from authenticated;
grant execute on function public.start_next_gameplay_round(uuid, uuid, text, integer, integer, integer, integer, jsonb, timestamptz) to service_role;
