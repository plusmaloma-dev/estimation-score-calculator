create or replace function public.assert_active_game_actor(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is distinct from p_actor_user_id then
    raise exception 'Authenticated user does not match active-game actor.';
  end if;

  if public.gameplay_table_workspace_id(p_table_id) is distinct from p_workspace_id then
    raise exception 'Gameplay table was not found in the requested workspace.';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Actor is not a member of the requested workspace.';
  end if;
end;
$$;

create or replace function public.active_game_control_snapshot_json(
  p_table_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  control_row public.gameplay_active_controls%rowtype;
  turn_json jsonb;
begin
  select * into control_row
  from public.gameplay_active_controls
  where table_id = p_table_id;

  if not found then
    raise exception 'Active-game control was not found.';
  end if;

  if not public.can_view_gameplay_table(p_table_id) then
    raise exception 'Active-game control is not visible to this user.';
  end if;

  turn_json := case
    when control_row.turn_id is null then null
    else jsonb_build_object(
      'turnId', control_row.turn_id,
      'seat', control_row.turn_seat - 1,
      'actionKind', control_row.turn_action_kind,
      'startedAt', control_row.turn_started_at,
      'deadlineAt', control_row.turn_deadline_at,
      'remainingMs', control_row.turn_remaining_ms,
      'status', control_row.turn_status
    )
  end;

  return jsonb_build_object(
    'tableId', control_row.table_id,
    'lifecycle', control_row.lifecycle,
    'hostUserId', control_row.host_user_id,
    'turnTimerSeconds', control_row.turn_timer_seconds,
    'disconnectGraceSeconds', control_row.disconnect_grace_seconds,
    'version', control_row.version,
    'turn', turn_json,
    'pausedAt', control_row.paused_at,
    'terminatedAt', control_row.terminated_at,
    'terminatedBy', control_row.terminated_by,
    'seats', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'seat', seat.seat_number - 1,
          'seatKind', seat.seat_kind,
          'humanUserId', seat.human_user_id,
          'botId', seat.bot_id,
          'joinedAt', seat.joined_at,
          'connectedAt', seat.connected_at,
          'connection', seat.connection,
          'controlOwner', seat.control_owner,
          'disconnectedAt', seat.disconnected_at,
          'graceDeadlineAt', seat.grace_deadline_at,
          'graceRemainingMs', seat.grace_remaining_ms,
          'reclaimPending', seat.reclaim_pending
        )
        order by seat.seat_number
      )
      from public.gameplay_active_seat_controls seat
      where seat.table_id = p_table_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_active_control_command(
  p_table_id uuid,
  p_command_id text,
  p_command_type text,
  p_expected_version integer,
  p_resulting_version integer,
  p_actor_user_id uuid,
  p_occurred_at timestamptz,
  p_payload jsonb,
  p_accepted boolean,
  p_errors jsonb,
  p_transition jsonb,
  p_events jsonb,
  p_directives jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_item jsonb;
begin
  insert into public.gameplay_active_control_commands (
    table_id,
    command_id,
    command_type,
    expected_version,
    resulting_version,
    actor_user_id,
    occurred_at,
    payload,
    accepted,
    errors,
    transition,
    events,
    directives
  ) values (
    p_table_id,
    p_command_id,
    p_command_type,
    p_expected_version,
    p_resulting_version,
    p_actor_user_id,
    p_occurred_at,
    p_payload,
    p_accepted,
    p_errors,
    p_transition,
    p_events,
    p_directives
  );

  if p_accepted then
    for event_item in select value from jsonb_array_elements(p_events)
    loop
      insert into public.gameplay_table_events (
        table_id,
        table_version,
        event_type,
        actor_user_id,
        details,
        occurred_at
      ) values (
        p_table_id,
        p_resulting_version,
        event_item->>'type',
        nullif(event_item->>'actorUserId', '')::uuid,
        coalesce(event_item->'details', '{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
            'userId', event_item->>'userId',
            'seat', (event_item->>'seat')::integer
          )),
        coalesce((event_item->>'occurredAt')::timestamptz, p_occurred_at)
      );
    end loop;
  end if;

  return p_transition;
end;
$$;

create or replace function public.process_active_control_command(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer,
  p_occurred_at timestamptz,
  p_command_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  control_row public.gameplay_active_controls%rowtype;
  existing_command public.gameplay_active_control_commands%rowtype;
  seat_row public.gameplay_active_seat_controls%rowtype;
  next_host_user_id uuid;
  next_seat_number smallint;
  source text;
  directive_id text;
  command_errors jsonb;
  transition jsonb;
  events jsonb := '[]'::jsonb;
  directives jsonb := '[]'::jsonb;
  changed_count integer := 0;
  event_type text;
  now_ms bigint;
  deadline_ms bigint;
begin
  perform public.assert_active_game_actor(p_table_id, p_workspace_id, p_actor_user_id);

  select * into control_row
  from public.gameplay_active_controls
  where table_id = p_table_id
  for update;

  if not found then
    raise exception 'Active-game control was not initialized.';
  end if;

  select * into existing_command
  from public.gameplay_active_control_commands command_row
  where command_row.table_id = p_table_id
    and command_row.command_id = p_command_id;

  if found then
    if existing_command.expected_version <> p_expected_version
      or existing_command.actor_user_id <> p_actor_user_id
      or existing_command.command_type <> p_command_type
      or existing_command.payload <> p_payload then
      raise exception 'Active control command id % was already used with a different payload.', p_command_id;
    end if;
    return existing_command.transition;
  end if;

  if control_row.version <> p_expected_version then
    command_errors := jsonb_build_array(format(
      'expected active control version %s does not match current version %s',
      p_expected_version,
      control_row.version
    ));
    transition := jsonb_build_object(
      'valid', false,
      'errors', command_errors,
      'tableId', p_table_id,
      'version', control_row.version
    );
    return public.record_active_control_command(
      p_table_id, p_command_id, p_command_type, p_expected_version,
      control_row.version, p_actor_user_id, p_occurred_at, p_payload,
      false, command_errors, transition, '[]'::jsonb, '[]'::jsonb
    );
  end if;

  if control_row.lifecycle = 'terminated' then
    command_errors := jsonb_build_array('Terminated games are read-only.');

  elsif p_command_type = 'PAUSE' then
    if control_row.host_user_id is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('Only the current host can perform this action.');
    elsif control_row.lifecycle <> 'active' then
      command_errors := jsonb_build_array('Game must be active before it can be paused.');
    else
      now_ms := extract(epoch from p_occurred_at) * 1000;
      update public.gameplay_active_controls
      set lifecycle = 'paused',
          paused_at = p_occurred_at,
          turn_remaining_ms = case
            when turn_deadline_at is null then turn_remaining_ms
            else greatest(0, (extract(epoch from turn_deadline_at) * 1000)::bigint - now_ms)::integer
          end,
          turn_deadline_at = null,
          updated_by = p_actor_user_id
      where table_id = p_table_id;

      update public.gameplay_active_seat_controls seat
      set grace_remaining_ms = greatest(
            0,
            (extract(epoch from seat.grace_deadline_at) * 1000)::bigint - now_ms
          )::integer,
          grace_deadline_at = null
      where seat.table_id = p_table_id
        and seat.grace_deadline_at is not null;

      event_type := 'game.paused';
      events := jsonb_build_array(jsonb_build_object(
        'type', event_type,
        'occurredAt', p_occurred_at,
        'actorUserId', p_actor_user_id
      ));
    end if;

  elsif p_command_type = 'RESUME' then
    if control_row.host_user_id is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('Only the current host can perform this action.');
    elsif control_row.lifecycle <> 'paused' then
      command_errors := jsonb_build_array('Game must be paused before it can be resumed.');
    else
      update public.gameplay_active_controls
      set lifecycle = 'active',
          paused_at = null,
          turn_deadline_at = case
            when turn_remaining_ms is null then turn_deadline_at
            else p_occurred_at + make_interval(secs => turn_remaining_ms / 1000.0)
          end,
          turn_remaining_ms = null,
          updated_by = p_actor_user_id
      where table_id = p_table_id;

      update public.gameplay_active_seat_controls seat
      set grace_deadline_at = case
            when seat.grace_remaining_ms is null then seat.grace_deadline_at
            else p_occurred_at + make_interval(secs => seat.grace_remaining_ms / 1000.0)
          end,
          grace_remaining_ms = null
      where seat.table_id = p_table_id
        and seat.grace_remaining_ms is not null;

      event_type := 'game.resumed';
      events := jsonb_build_array(jsonb_build_object(
        'type', event_type,
        'occurredAt', p_occurred_at,
        'actorUserId', p_actor_user_id
      ));
    end if;

  elsif p_command_type = 'TERMINATE' then
    if control_row.host_user_id is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('Only the current host can perform this action.');
    elsif coalesce((p_payload->>'confirmed')::boolean, false) is not true then
      command_errors := jsonb_build_array('Active-game termination requires explicit confirmation.');
    else
      update public.gameplay_active_controls
      set lifecycle = 'terminated',
          paused_at = null,
          terminated_at = p_occurred_at,
          terminated_by = p_actor_user_id,
          turn_id = null,
          turn_seat = null,
          turn_action_kind = null,
          turn_started_at = null,
          turn_deadline_at = null,
          turn_remaining_ms = null,
          turn_status = null,
          updated_by = p_actor_user_id
      where table_id = p_table_id;

      update public.gameplay_active_seat_controls
      set grace_deadline_at = null,
          grace_remaining_ms = null
      where table_id = p_table_id;

      event_type := 'game.terminated';
      events := jsonb_build_array(jsonb_build_object(
        'type', event_type,
        'occurredAt', p_occurred_at,
        'actorUserId', p_actor_user_id
      ));
    end if;

  elsif p_command_type = 'DISCONNECT' then
    if nullif(p_payload->>'userId', '')::uuid is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('A user may disconnect only their own seat.');
    else
      select * into seat_row
      from public.gameplay_active_seat_controls seat
      where seat.table_id = p_table_id
        and seat.human_user_id = p_actor_user_id
      for update;

      if not found then
        command_errors := jsonb_build_array('Human user is not seated.');
      elsif seat_row.connection = 'disconnected' then
        command_errors := jsonb_build_array('User is already disconnected.');
      else
        update public.gameplay_active_seat_controls
        set connection = 'disconnected',
            connected_at = null,
            disconnected_at = p_occurred_at,
            grace_deadline_at = case
              when control_row.lifecycle = 'active'
                then p_occurred_at + make_interval(secs => control_row.disconnect_grace_seconds)
              else null
            end,
            grace_remaining_ms = case
              when control_row.lifecycle = 'paused'
                then control_row.disconnect_grace_seconds * 1000
              else null
            end,
            reclaim_pending = false
        where table_id = p_table_id
          and seat_number = seat_row.seat_number;

        events := jsonb_build_array(jsonb_build_object(
          'type', 'seat.disconnected',
          'occurredAt', p_occurred_at,
          'userId', p_actor_user_id,
          'seat', seat_row.seat_number - 1
        ));

        if control_row.host_user_id = p_actor_user_id then
          select seat.human_user_id into next_host_user_id
          from public.gameplay_active_seat_controls seat
          where seat.table_id = p_table_id
            and seat.seat_kind = 'human'
            and seat.connection = 'connected'
          order by seat.connected_at, seat.joined_at, seat.seat_number
          limit 1;

          if next_host_user_id is not null then
            update public.gameplay_active_controls
            set host_user_id = next_host_user_id,
                updated_by = p_actor_user_id
            where table_id = p_table_id;
            event_type := 'host.transferred';
            events := events || jsonb_build_array(jsonb_build_object(
              'type', event_type,
              'occurredAt', p_occurred_at,
              'userId', next_host_user_id,
              'details', jsonb_build_object(
                'previousHostUserId', p_actor_user_id,
                'hostUserId', next_host_user_id
              )
            ));
          end if;
        end if;
      end if;
    end if;

  elsif p_command_type = 'RECONNECT' then
    if nullif(p_payload->>'userId', '')::uuid is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('A user may reconnect only their own seat.');
    else
      select * into seat_row
      from public.gameplay_active_seat_controls seat
      where seat.table_id = p_table_id
        and seat.human_user_id = p_actor_user_id
      for update;

      if not found then
        command_errors := jsonb_build_array('Human user is not seated.');
      elsif seat_row.connection = 'connected' then
        command_errors := jsonb_build_array('User is already connected.');
      else
        update public.gameplay_active_seat_controls
        set connection = 'connected',
            connected_at = p_occurred_at,
            disconnected_at = null,
            grace_deadline_at = null,
            grace_remaining_ms = null,
            reclaim_pending = (control_owner = 'temporary-bot')
        where table_id = p_table_id
          and seat_number = seat_row.seat_number;

        events := jsonb_build_array(jsonb_build_object(
          'type', 'seat.reconnected',
          'occurredAt', p_occurred_at,
          'userId', p_actor_user_id,
          'seat', seat_row.seat_number - 1
        ));
      end if;
    end if;

  elsif p_command_type = 'EVALUATE_GRACE' then
    if control_row.lifecycle <> 'active' then
      command_errors := jsonb_build_array('Grace evaluation is available only while active.');
    else
      with expired as (
        update public.gameplay_active_seat_controls seat
        set control_owner = 'temporary-bot',
            grace_deadline_at = null,
            grace_remaining_ms = null,
            reclaim_pending = false
        where seat.table_id = p_table_id
          and seat.seat_kind = 'human'
          and seat.connection = 'disconnected'
          and seat.control_owner = 'human'
          and seat.grace_deadline_at <= p_occurred_at
        returning seat.seat_number, seat.human_user_id
      )
      select count(*), coalesce(jsonb_agg(jsonb_build_object(
        'type', 'seat.takeover',
        'occurredAt', p_occurred_at,
        'userId', human_user_id,
        'seat', seat_number - 1
      )), '[]'::jsonb)
      into changed_count, events
      from expired;

      if changed_count = 0 then
        command_errors := jsonb_build_array('No active grace transition was produced.');
      else
        event_type := 'seat.takeover';
      end if;
    end if;

  elsif p_command_type = 'START_TURN' then
    if control_row.lifecycle <> 'active' then
      command_errors := jsonb_build_array('Turns can start only while the game is active.');
    elsif control_row.turn_id is not null then
      command_errors := jsonb_build_array('The current turn must complete before another turn starts.');
    else
      update public.gameplay_active_controls
      set turn_id = p_payload->>'turnId',
          turn_seat = (p_payload->>'seat')::smallint + 1,
          turn_action_kind = p_payload->>'actionKind',
          turn_started_at = p_occurred_at,
          turn_deadline_at = p_occurred_at + make_interval(secs => turn_timer_seconds),
          turn_remaining_ms = null,
          turn_status = 'running',
          updated_by = p_actor_user_id
      where table_id = p_table_id;

      events := jsonb_build_array(jsonb_build_object(
        'type', 'turn.started',
        'occurredAt', p_occurred_at,
        'seat', (p_payload->>'seat')::integer,
        'details', jsonb_build_object(
          'turnId', p_payload->>'turnId',
          'actionKind', p_payload->>'actionKind'
        )
      ));
    end if;

  elsif p_command_type = 'EVALUATE_DEADLINE' then
    if control_row.lifecycle <> 'active'
      or control_row.turn_id is null
      or control_row.turn_status <> 'running' then
      command_errors := jsonb_build_array('No active deadline transition was produced.');
    else
      select * into seat_row
      from public.gameplay_active_seat_controls seat
      where seat.table_id = p_table_id
        and seat.seat_number = control_row.turn_seat;

      source := case
        when seat_row.control_owner = 'permanent-bot' then 'permanent-bot'
        when seat_row.control_owner = 'temporary-bot' then 'disconnect-substitute'
        when control_row.turn_deadline_at <= p_occurred_at then 'timeout-assistant'
        else null
      end;

      if source is null then
        command_errors := jsonb_build_array('No active deadline transition was produced.');
      else
        directive_id := format(
          'bot-action:%s:%s:%s',
          p_table_id,
          control_row.turn_id,
          control_row.turn_seat - 1
        );
        update public.gameplay_active_controls
        set turn_status = 'assistant-pending',
            updated_by = p_actor_user_id
        where table_id = p_table_id;

        directives := jsonb_build_array(jsonb_build_object(
          'directiveId', directive_id,
          'tableId', p_table_id,
          'turnId', control_row.turn_id,
          'seat', control_row.turn_seat - 1,
          'actionKind', control_row.turn_action_kind,
          'source', source,
          'issuedAt', p_occurred_at
        ));
        events := jsonb_build_array(jsonb_build_object(
          'type', case when source = 'timeout-assistant'
            then 'turn.timeout-assistance' else 'turn.bot-directed' end,
          'occurredAt', p_occurred_at,
          'seat', control_row.turn_seat - 1,
          'details', jsonb_build_object(
            'directiveId', directive_id,
            'turnId', control_row.turn_id,
            'actionKind', control_row.turn_action_kind,
            'source', source
          )
        ));
      end if;
    end if;

  elsif p_command_type = 'BEGIN_BOT_ACTION' then
    if control_row.lifecycle <> 'active'
      or control_row.turn_id is distinct from p_payload->>'turnId'
      or control_row.turn_seat is distinct from (p_payload->>'seat')::smallint + 1 then
      command_errors := jsonb_build_array('Bot action does not match the authoritative turn.');
    elsif control_row.turn_status = 'bot-processing' then
      command_errors := jsonb_build_array('The bot action is already processing.');
    elsif control_row.turn_status <> 'assistant-pending' then
      command_errors := jsonb_build_array('The active seat is currently controlled by its human.');
    else
      update public.gameplay_active_controls
      set turn_status = 'bot-processing',
          updated_by = p_actor_user_id
      where table_id = p_table_id;

      events := jsonb_build_array(jsonb_build_object(
        'type', 'turn.bot-processing',
        'occurredAt', p_occurred_at,
        'seat', (p_payload->>'seat')::integer,
        'details', jsonb_build_object('turnId', p_payload->>'turnId')
      ));
    end if;

  elsif p_command_type = 'COMPLETE_ACTION_BOUNDARY' then
    if control_row.lifecycle <> 'active' then
      command_errors := jsonb_build_array('Action boundaries can advance only while active.');
    else
      if control_row.turn_id is not null then
        events := jsonb_build_array(jsonb_build_object(
          'type', 'turn.completed',
          'occurredAt', p_occurred_at,
          'seat', control_row.turn_seat - 1,
          'details', jsonb_build_object('turnId', control_row.turn_id)
        ));
      end if;

      update public.gameplay_active_controls
      set turn_id = null,
          turn_seat = null,
          turn_action_kind = null,
          turn_started_at = null,
          turn_deadline_at = null,
          turn_remaining_ms = null,
          turn_status = null,
          updated_by = p_actor_user_id
      where table_id = p_table_id;

      if p_payload ? 'nextTurn' then
        next_seat_number := (p_payload#>>'{nextTurn,seat}')::smallint + 1;
        update public.gameplay_active_seat_controls seat
        set control_owner = 'human',
            reclaim_pending = false
        where seat.table_id = p_table_id
          and seat.seat_number = next_seat_number
          and seat.seat_kind = 'human'
          and seat.connection = 'connected'
          and seat.control_owner = 'temporary-bot'
          and seat.reclaim_pending = true;
        get diagnostics changed_count = row_count;

        if changed_count > 0 then
          event_type := 'seat.reclaimed';
          events := events || jsonb_build_array(jsonb_build_object(
            'type', event_type,
            'occurredAt', p_occurred_at,
            'seat', next_seat_number - 1
          ));
        end if;

        update public.gameplay_active_controls
        set turn_id = p_payload#>>'{nextTurn,turnId}',
            turn_seat = next_seat_number,
            turn_action_kind = p_payload#>>'{nextTurn,actionKind}',
            turn_started_at = p_occurred_at,
            turn_deadline_at = p_occurred_at + make_interval(secs => turn_timer_seconds),
            turn_status = 'running',
            updated_by = p_actor_user_id
        where table_id = p_table_id;

        events := events || jsonb_build_array(jsonb_build_object(
          'type', 'turn.started',
          'occurredAt', p_occurred_at,
          'seat', next_seat_number - 1,
          'details', jsonb_build_object(
            'turnId', p_payload#>>'{nextTurn,turnId}',
            'actionKind', p_payload#>>'{nextTurn,actionKind}'
          )
        ));
      end if;
    end if;

  else
    command_errors := jsonb_build_array('Unsupported active-control command.');
  end if;

  if command_errors is not null then
    transition := jsonb_build_object(
      'valid', false,
      'errors', command_errors,
      'tableId', p_table_id,
      'version', control_row.version,
      'events', '[]'::jsonb,
      'directives', '[]'::jsonb
    );
    return public.record_active_control_command(
      p_table_id, p_command_id, p_command_type, p_expected_version,
      control_row.version, p_actor_user_id, p_occurred_at, p_payload,
      false, command_errors, transition, '[]'::jsonb, '[]'::jsonb
    );
  end if;

  update public.gameplay_active_controls
  set version = version + 1,
      updated_by = p_actor_user_id
  where table_id = p_table_id
  returning * into control_row;

  transition := public.active_game_control_snapshot_json(p_table_id, p_actor_user_id)
    || jsonb_build_object(
      'valid', true,
      'errors', '[]'::jsonb,
      'events', events,
      'directives', directives
    );

  return public.record_active_control_command(
    p_table_id, p_command_id, p_command_type, p_expected_version,
    control_row.version, p_actor_user_id, p_occurred_at, p_payload,
    true, '[]'::jsonb, transition, events, directives
  );
end;
$$;

create or replace function public.initialize_active_game_control(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  table_row public.gameplay_tables%rowtype;
  existing_command public.gameplay_active_control_commands%rowtype;
  transition jsonb;
begin
  perform public.assert_active_game_actor(p_table_id, p_workspace_id, p_actor_user_id);

  select * into table_row
  from public.gameplay_tables
  where id = p_table_id
  for update;

  if table_row.lifecycle <> 'active'
    or table_row.settings_locked is not true
    or table_row.host_user_id is null
    or (select count(*) from public.gameplay_table_seats where table_id = p_table_id) <> 4 then
    raise exception 'Active control requires a started and settings-locked four-seat table.';
  end if;

  select * into existing_command
  from public.gameplay_active_control_commands command_row
  where command_row.table_id = p_table_id
    and command_row.command_id = p_command_id;
  if found then return existing_command.transition; end if;

  if exists (select 1 from public.gameplay_active_controls where table_id = p_table_id) then
    raise exception 'Active-game control was already initialized.';
  end if;

  insert into public.gameplay_active_controls (
    table_id,
    lifecycle,
    host_user_id,
    turn_timer_seconds,
    disconnect_grace_seconds,
    version,
    updated_by
  ) values (
    p_table_id,
    'active',
    table_row.host_user_id,
    table_row.turn_timer_seconds,
    table_row.disconnect_grace_seconds,
    0,
    p_actor_user_id
  );

  insert into public.gameplay_active_seat_controls (
    table_id,
    seat_number,
    seat_kind,
    human_user_id,
    bot_id,
    joined_at,
    connected_at,
    connection,
    control_owner,
    reclaim_pending
  )
  select
    p_table_id,
    seat.seat_number,
    seat.seat_kind,
    seat.user_id,
    seat.bot_id,
    seat.joined_at,
    case when seat.seat_kind = 'human' then p_occurred_at else null end,
    case when seat.seat_kind = 'human' then 'connected' else 'disconnected' end,
    case when seat.seat_kind = 'human' then 'human' else 'permanent-bot' end,
    false
  from public.gameplay_table_seats seat
  where seat.table_id = p_table_id;

  transition := public.active_game_control_snapshot_json(p_table_id, p_actor_user_id)
    || jsonb_build_object(
      'valid', true,
      'errors', '[]'::jsonb,
      'events', jsonb_build_array(jsonb_build_object(
        'type', 'control.initialized',
        'occurredAt', p_occurred_at,
        'actorUserId', p_actor_user_id
      )),
      'directives', '[]'::jsonb
    );

  return public.record_active_control_command(
    p_table_id, p_command_id, 'INITIALIZE', 0, 0,
    p_actor_user_id, p_occurred_at, '{}'::jsonb,
    true, '[]'::jsonb, transition,
    transition->'events', '[]'::jsonb
  );
end;
$$;

create or replace function public.pause_active_game(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'PAUSE', '{}'::jsonb
  );
$$;

create or replace function public.resume_active_game(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'RESUME', '{}'::jsonb
  );
$$;

create or replace function public.terminate_active_game(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_confirmed boolean,
  p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'TERMINATE',
    jsonb_build_object('confirmed', p_confirmed)
  );
$$;

create or replace function public.disconnect_active_game_user(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_user_id uuid,
  p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'DISCONNECT',
    jsonb_build_object('userId', p_user_id)
  );
$$;

create or replace function public.reconnect_active_game_user(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_user_id uuid,
  p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'RECONNECT',
    jsonb_build_object('userId', p_user_id)
  );
$$;

create or replace function public.evaluate_active_game_grace(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'EVALUATE_GRACE', '{}'::jsonb
  );
$$;

create or replace function public.evaluate_active_game_deadlines(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'EVALUATE_DEADLINE', '{}'::jsonb
  );
$$;

create or replace function public.start_active_game_turn(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_turn_id text,
  p_seat integer, p_action_kind text, p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'START_TURN',
    jsonb_build_object('turnId', p_turn_id, 'seat', p_seat, 'actionKind', p_action_kind)
  );
$$;

create or replace function public.begin_active_bot_action(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_turn_id text,
  p_seat integer, p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'BEGIN_BOT_ACTION',
    jsonb_build_object('turnId', p_turn_id, 'seat', p_seat)
  );
$$;

create or replace function public.complete_active_action_boundary(
  p_table_id uuid, p_workspace_id uuid, p_actor_user_id uuid,
  p_command_id text, p_expected_version integer, p_next_turn jsonb,
  p_occurred_at timestamptz
)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select public.process_active_control_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id,
    p_expected_version, p_occurred_at, 'COMPLETE_ACTION_BOUNDARY',
    case when p_next_turn is null then '{}'::jsonb
      else jsonb_build_object('nextTurn', p_next_turn) end
  );
$$;

create or replace function public.get_active_game_control_snapshot(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_active_game_actor(p_table_id, p_workspace_id, p_actor_user_id);
  return public.active_game_control_snapshot_json(p_table_id, p_actor_user_id);
end;
$$;

revoke all on function public.assert_active_game_actor(uuid, uuid, uuid) from public;
revoke all on function public.active_game_control_snapshot_json(uuid, uuid) from public;
revoke all on function public.record_active_control_command(uuid, text, text, integer, integer, uuid, timestamptz, jsonb, boolean, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.process_active_control_command(uuid, uuid, uuid, text, integer, timestamptz, text, jsonb) from public;
revoke all on function public.initialize_active_game_control(uuid, uuid, uuid, text, timestamptz) from public;
revoke all on function public.pause_active_game(uuid, uuid, uuid, text, integer, timestamptz) from public;
revoke all on function public.resume_active_game(uuid, uuid, uuid, text, integer, timestamptz) from public;
revoke all on function public.terminate_active_game(uuid, uuid, uuid, text, integer, boolean, timestamptz) from public;
revoke all on function public.disconnect_active_game_user(uuid, uuid, uuid, text, integer, uuid, timestamptz) from public;
revoke all on function public.reconnect_active_game_user(uuid, uuid, uuid, text, integer, uuid, timestamptz) from public;
revoke all on function public.evaluate_active_game_grace(uuid, uuid, uuid, text, integer, timestamptz) from public;
revoke all on function public.evaluate_active_game_deadlines(uuid, uuid, uuid, text, integer, timestamptz) from public;
revoke all on function public.start_active_game_turn(uuid, uuid, uuid, text, integer, text, integer, text, timestamptz) from public;
revoke all on function public.begin_active_bot_action(uuid, uuid, uuid, text, integer, text, integer, timestamptz) from public;
revoke all on function public.complete_active_action_boundary(uuid, uuid, uuid, text, integer, jsonb, timestamptz) from public;
revoke all on function public.get_active_game_control_snapshot(uuid, uuid, uuid) from public;

grant execute on function public.initialize_active_game_control(uuid, uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.pause_active_game(uuid, uuid, uuid, text, integer, timestamptz) to authenticated;
grant execute on function public.resume_active_game(uuid, uuid, uuid, text, integer, timestamptz) to authenticated;
grant execute on function public.terminate_active_game(uuid, uuid, uuid, text, integer, boolean, timestamptz) to authenticated;
grant execute on function public.disconnect_active_game_user(uuid, uuid, uuid, text, integer, uuid, timestamptz) to authenticated;
grant execute on function public.reconnect_active_game_user(uuid, uuid, uuid, text, integer, uuid, timestamptz) to authenticated;
grant execute on function public.evaluate_active_game_grace(uuid, uuid, uuid, text, integer, timestamptz) to authenticated;
grant execute on function public.evaluate_active_game_deadlines(uuid, uuid, uuid, text, integer, timestamptz) to authenticated;
grant execute on function public.start_active_game_turn(uuid, uuid, uuid, text, integer, text, integer, text, timestamptz) to authenticated;
grant execute on function public.begin_active_bot_action(uuid, uuid, uuid, text, integer, text, integer, timestamptz) to authenticated;
grant execute on function public.complete_active_action_boundary(uuid, uuid, uuid, text, integer, jsonb, timestamptz) to authenticated;
grant execute on function public.get_active_game_control_snapshot(uuid, uuid, uuid) to authenticated;
