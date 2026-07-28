-- Replace only the public START entry point after hosted UAT exposed a
-- PL/pgSQL name collision between the local loop variable `seat_number` and
-- public.gameplay_table_seats.seat_number. Applied migrations remain immutable.
create or replace function public.start_gameplay_table(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  table_row public.gameplay_tables%rowtype;
  existing_command public.gameplay_table_commands%rowtype;
  command_errors jsonb;
  transition jsonb;
  error_message text;
  target_seat_number smallint;
  occurred_at timestamptz := now();
begin
  perform public.assert_gameplay_actor(p_workspace_id, p_actor_user_id);

  select * into table_row
  from public.gameplay_tables table_record
  where table_record.id = p_table_id
  for update;

  if not found or table_row.workspace_id <> p_workspace_id then
    raise exception 'Gameplay table was not found in the requested workspace.';
  end if;

  select * into existing_command
  from public.gameplay_table_commands command_row
  where command_row.table_id = p_table_id
    and command_row.command_id = p_command_id;

  if found then
    if existing_command.expected_version <> p_expected_version
      or existing_command.actor_user_id <> p_actor_user_id
      or existing_command.command_type <> 'START'
      or existing_command.payload <> '{}'::jsonb then
      raise exception 'Table command id % was already used with a different payload.', p_command_id;
    end if;
    return existing_command.transition;
  end if;

  if table_row.version <> p_expected_version then
    error_message := format(
      'expected_version %s does not match current version %s',
      p_expected_version,
      table_row.version
    );
    command_errors := jsonb_build_array(error_message);
    transition := jsonb_build_object(
      'valid', false,
      'errors', command_errors,
      'tableId', p_table_id,
      'version', table_row.version
    );
    return public.record_gameplay_table_command(
      p_table_id,
      p_command_id,
      'START',
      p_expected_version,
      table_row.version,
      p_actor_user_id,
      occurred_at,
      '{}'::jsonb,
      false,
      command_errors,
      transition
    );
  end if;

  if table_row.lifecycle <> 'lobby' or table_row.settings_locked then
    command_errors := jsonb_build_array('This table has already started.');
  elsif table_row.host_user_id is distinct from p_actor_user_id then
    command_errors := jsonb_build_array('Only the current host can start the table.');
  elsif exists (
    select 1
    from public.gameplay_join_requests request_row
    where request_row.table_id = p_table_id
      and request_row.status = 'pending'
  ) then
    command_errors := jsonb_build_array('All pending join requests must be resolved before Start.');
  elsif not exists (
    select 1
    from public.gameplay_table_seats seat
    where seat.table_id = p_table_id
      and seat.seat_kind = 'human'
  ) then
    command_errors := jsonb_build_array('At least one connected human is required to start.');
  end if;

  if command_errors is not null then
    transition := jsonb_build_object(
      'valid', false,
      'errors', command_errors,
      'tableId', p_table_id,
      'version', table_row.version
    );
    return public.record_gameplay_table_command(
      p_table_id,
      p_command_id,
      'START',
      p_expected_version,
      table_row.version,
      p_actor_user_id,
      occurred_at,
      '{}'::jsonb,
      false,
      command_errors,
      transition
    );
  end if;

  -- Permanent bot id format: standard-bot:table-id:zero-based-seat.
  for target_seat_number in 1..4 loop
    if not exists (
      select 1
      from public.gameplay_table_seats seat
      where seat.table_id = p_table_id
        and seat.seat_number = target_seat_number
    ) then
      insert into public.gameplay_table_seats (
        table_id,
        seat_number,
        seat_kind,
        bot_id,
        display_name_snapshot,
        joined_at
      ) values (
        p_table_id,
        target_seat_number,
        'bot',
        format('standard-bot:%s:%s', p_table_id, target_seat_number - 1),
        format('Standard Bot %s', target_seat_number),
        occurred_at
      );
    end if;
  end loop;

  update public.gameplay_tables table_record
  set lifecycle = 'active',
      settings_locked = true,
      version = table_record.version + 1,
      updated_by = p_actor_user_id
  where table_record.id = p_table_id
  returning * into table_row;

  transition := public.gameplay_table_snapshot_json(p_table_id, p_actor_user_id)
    || jsonb_build_object('valid', true, 'errors', '[]'::jsonb);

  return public.record_gameplay_table_command(
    p_table_id,
    p_command_id,
    'START',
    p_expected_version,
    table_row.version,
    p_actor_user_id,
    occurred_at,
    '{}'::jsonb,
    true,
    '[]'::jsonb,
    transition,
    'table.started',
    '{}'::jsonb
  );
end;
$$;
