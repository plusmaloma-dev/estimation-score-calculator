create or replace function public.assert_gameplay_actor(
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
    raise exception 'Authenticated user does not match gameplay actor.';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Actor is not a member of the requested workspace.';
  end if;
end;
$$;

create or replace function public.gameplay_table_snapshot_json(
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
  table_row public.gameplay_tables%rowtype;
  actor_is_host boolean;
  actor_is_admin boolean;
begin
  select * into table_row
  from public.gameplay_tables
  where id = p_table_id;

  if not found then
    raise exception 'Gameplay table was not found.';
  end if;

  if not public.can_view_gameplay_table(p_table_id) then
    raise exception 'Gameplay table is not visible to this user.';
  end if;

  actor_is_host := table_row.host_user_id = p_actor_user_id;
  actor_is_admin := public.has_workspace_role(table_row.workspace_id, array['admin']);

  return jsonb_build_object(
    'tableId', table_row.id,
    'workspaceId', table_row.workspace_id,
    'name', table_row.name,
    'visibility', table_row.visibility,
    'joinPolicy', table_row.join_policy,
    'lifecycle', table_row.lifecycle,
    'hostUserId', table_row.host_user_id,
    'turnTimerSeconds', table_row.turn_timer_seconds,
    'disconnectGraceSeconds', table_row.disconnect_grace_seconds,
    'settingsLocked', table_row.settings_locked,
    'occupiedSeatCount', (
      select count(*) from public.gameplay_table_seats seat where seat.table_id = p_table_id
    ),
    'version', table_row.version,
    'createdAt', table_row.created_at,
    'seats', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'seat', seat.seat_number - 1,
          'kind', seat.seat_kind,
          'userId', seat.user_id,
          'botId', seat.bot_id,
          'displayName', seat.display_name_snapshot,
          'joinedAt', seat.joined_at
        )
        order by seat.seat_number
      )
      from public.gameplay_table_seats seat
      where seat.table_id = p_table_id
    ), '[]'::jsonb),
    'joinRequests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requestId', request.id,
          'userId', request.user_id,
          'displayName', request.display_name_snapshot,
          'requestedSeat', case
            when request.requested_seat is null then null
            else request.requested_seat - 1
          end,
          'requestedAt', request.requested_at,
          'status', request.status,
          'resolvedAt', request.resolved_at,
          'resolvedBy', request.resolved_by
        )
        order by request.requested_at, request.id
      )
      from public.gameplay_join_requests request
      where request.table_id = p_table_id
        and (
          request.user_id = p_actor_user_id
          or actor_is_host
          or actor_is_admin
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_gameplay_table_command(
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
  p_event_type text default null,
  p_event_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.gameplay_table_commands (
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
    transition
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
    p_transition
  );

  if p_accepted and p_event_type is not null then
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
      p_event_type,
      p_actor_user_id,
      p_event_details,
      p_occurred_at
    );
  end if;

  return p_transition;
end;
$$;

create or replace function public.process_gameplay_table_command(
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
  table_row public.gameplay_tables%rowtype;
  existing_command public.gameplay_table_commands%rowtype;
  request_row public.gameplay_join_requests%rowtype;
  leaving_seat public.gameplay_table_seats%rowtype;
  next_host_user_id uuid;
  selected_seat smallint;
  requested_seat smallint;
  command_errors jsonb;
  transition jsonb;
  event_type text;
  event_details jsonb := '{}'::jsonb;
  error_message text;
  seat_number smallint;
begin
  perform public.assert_gameplay_actor(p_workspace_id, p_actor_user_id);

  select * into table_row
  from public.gameplay_tables
  where id = p_table_id
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
      or existing_command.command_type <> p_command_type
      or existing_command.payload <> p_payload then
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
      p_table_id, p_command_id, p_command_type, p_expected_version, table_row.version,
      p_actor_user_id, p_occurred_at, p_payload, false, command_errors, transition
    );
  end if;

  if p_command_type = 'UPDATE_SETTINGS' then
    if table_row.lifecycle <> 'lobby' or table_row.settings_locked then
      command_errors := jsonb_build_array('Table settings are locked after Start.');
    elsif table_row.host_user_id is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('Only the current host can update table settings.');
    elsif p_payload ? 'turnTimerSeconds'
      and (p_payload->>'turnTimerSeconds')::integer not in (20, 30, 45, 60, 90) then
      command_errors := jsonb_build_array('Invalid turn timer.');
    elsif p_payload ? 'disconnectGraceSeconds'
      and (p_payload->>'disconnectGraceSeconds')::integer not in (30, 60, 90, 120) then
      command_errors := jsonb_build_array('Invalid disconnect grace.');
    else
      update public.gameplay_tables
      set name = coalesce(nullif(trim(p_payload->>'name'), ''), name),
          visibility = coalesce(p_payload->>'visibility', visibility),
          join_policy = coalesce(p_payload->>'joinPolicy', join_policy),
          turn_timer_seconds = coalesce((p_payload->>'turnTimerSeconds')::integer, turn_timer_seconds),
          disconnect_grace_seconds = coalesce((p_payload->>'disconnectGraceSeconds')::integer, disconnect_grace_seconds),
          updated_by = p_actor_user_id
      where id = p_table_id;
      event_type := 'table.settings-updated';
      event_details := p_payload;
    end if;

  elsif p_command_type = 'JOIN_OPEN' then
    if table_row.lifecycle <> 'lobby' or table_row.settings_locked then
      command_errors := jsonb_build_array('Players cannot join after the table has started.');
    elsif exists (
      select 1 from public.gameplay_table_seats seat
      where seat.table_id = p_table_id and seat.user_id = p_actor_user_id
    ) then
      command_errors := jsonb_build_array('User is already seated at this table.');
    elsif table_row.visibility = 'private'
      and coalesce((p_payload->>'privateAccessGranted')::boolean, false) is not true then
      command_errors := jsonb_build_array('Private table access has not been granted.');
    elsif table_row.visibility = 'public' and table_row.join_policy = 'approval-required' then
      command_errors := jsonb_build_array('This table requires host approval before joining.');
    else
      requested_seat := case
        when p_payload ? 'requestedSeat' then (p_payload->>'requestedSeat')::smallint + 1
        else null
      end;
      if requested_seat is not null and exists (
        select 1 from public.gameplay_table_seats seat
        where seat.table_id = p_table_id and seat.seat_number = requested_seat
      ) then
        command_errors := jsonb_build_array('Requested seat is already occupied.');
      else
        select coalesce(requested_seat, min(candidate.seat_number)) into selected_seat
        from generate_series(1, 4) as candidate(seat_number)
        where requested_seat is not null
          or not exists (
            select 1 from public.gameplay_table_seats seat
            where seat.table_id = p_table_id and seat.seat_number = candidate.seat_number
          );
        if selected_seat is null then
          command_errors := jsonb_build_array('Table has no vacant seats.');
        else
          insert into public.gameplay_table_seats (
            table_id, seat_number, seat_kind, user_id, display_name_snapshot, joined_at
          ) values (
            p_table_id, selected_seat, 'human', p_actor_user_id,
            trim(p_payload->>'displayName'), p_occurred_at
          );
          event_type := 'table.player-joined';
          event_details := jsonb_build_object('userId', p_actor_user_id, 'seat', selected_seat - 1);
        end if;
      end if;
    end if;

  elsif p_command_type = 'REQUEST_JOIN' then
    if table_row.lifecycle <> 'lobby' or table_row.settings_locked then
      command_errors := jsonb_build_array('Join requests are accepted only in the lobby.');
    elsif table_row.visibility <> 'public' then
      command_errors := jsonb_build_array('Join requests are available only for public tables.');
    elsif table_row.join_policy <> 'approval-required' then
      command_errors := jsonb_build_array('This table does not use approval-required joining.');
    elsif exists (
      select 1 from public.gameplay_join_requests request
      where request.table_id = p_table_id
        and request.user_id = p_actor_user_id
        and request.status = 'pending'
    ) then
      command_errors := jsonb_build_array('User already has a pending join request.');
    else
      insert into public.gameplay_join_requests (
        id, table_id, user_id, display_name_snapshot, requested_seat, requested_at
      ) values (
        (p_payload->>'requestId')::uuid,
        p_table_id,
        p_actor_user_id,
        trim(p_payload->>'displayName'),
        case when p_payload ? 'requestedSeat'
          then (p_payload->>'requestedSeat')::smallint + 1 else null end,
        p_occurred_at
      );
      event_type := 'table.join-requested';
      event_details := jsonb_build_object('requestId', p_payload->>'requestId');
    end if;

  elsif p_command_type = 'RESPOND_JOIN_REQUEST' then
    if table_row.lifecycle <> 'lobby' or table_row.settings_locked then
      command_errors := jsonb_build_array('Join requests can be resolved only in the lobby.');
    elsif table_row.host_user_id is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('Only the current host can respond to join requests.');
    else
      select * into request_row
      from public.gameplay_join_requests request
      where request.id = (p_payload->>'requestId')::uuid
        and request.table_id = p_table_id
      for update;

      if not found then
        command_errors := jsonb_build_array('Join request was not found.');
      elsif request_row.status <> 'pending' then
        command_errors := jsonb_build_array('Join request has already been resolved.');
      elsif p_payload->>'decision' = 'reject' then
        update public.gameplay_join_requests
        set status = 'rejected', resolved_at = p_occurred_at, resolved_by = p_actor_user_id
        where id = request_row.id;
        event_type := 'table.join-rejected';
        event_details := jsonb_build_object('requestId', request_row.id);
      else
        if request_row.requested_seat is not null and exists (
          select 1 from public.gameplay_table_seats seat
          where seat.table_id = p_table_id and seat.seat_number = request_row.requested_seat
        ) then
          command_errors := jsonb_build_array('Requested seat is no longer available.');
        else
          select coalesce(request_row.requested_seat, min(candidate.seat_number)) into selected_seat
          from generate_series(1, 4) as candidate(seat_number)
          where request_row.requested_seat is not null
            or not exists (
              select 1 from public.gameplay_table_seats seat
              where seat.table_id = p_table_id and seat.seat_number = candidate.seat_number
            );
          if selected_seat is null then
            command_errors := jsonb_build_array('Table has no vacant seats.');
          else
            insert into public.gameplay_table_seats (
              table_id, seat_number, seat_kind, user_id, display_name_snapshot, joined_at
            ) values (
              p_table_id, selected_seat, 'human', request_row.user_id,
              request_row.display_name_snapshot, p_occurred_at
            );
            update public.gameplay_join_requests
            set status = 'accepted', resolved_at = p_occurred_at, resolved_by = p_actor_user_id
            where id = request_row.id;
            event_type := 'table.join-accepted';
            event_details := jsonb_build_object(
              'requestId', request_row.id,
              'userId', request_row.user_id,
              'seat', selected_seat - 1
            );
          end if;
        end if;
      end if;
    end if;

  elsif p_command_type = 'LEAVE_LOBBY' then
    if table_row.lifecycle <> 'lobby' then
      command_errors := jsonb_build_array('Players can leave through this command only in the lobby.');
    else
      delete from public.gameplay_table_seats seat
      where seat.table_id = p_table_id
        and seat.seat_kind = 'human'
        and seat.user_id = p_actor_user_id
      returning * into leaving_seat;

      if not found then
        command_errors := jsonb_build_array('User is not seated at this table.');
      elsif table_row.host_user_id = p_actor_user_id then
        select seat.user_id into next_host_user_id
        from public.gameplay_table_seats seat
        where seat.table_id = p_table_id and seat.seat_kind = 'human'
        order by seat.joined_at, seat.seat_number
        limit 1;

        if next_host_user_id is null then
          update public.gameplay_tables
          set lifecycle = 'closed', host_user_id = null, updated_by = p_actor_user_id
          where id = p_table_id;
          event_type := 'table.closed';
        else
          update public.gameplay_tables
          set host_user_id = next_host_user_id, updated_by = p_actor_user_id
          where id = p_table_id;
          event_type := 'table.host-transferred';
          event_details := jsonb_build_object('hostUserId', next_host_user_id);
        end if;
      else
        event_type := 'table.player-left';
        event_details := jsonb_build_object('userId', p_actor_user_id);
      end if;
    end if;

  elsif p_command_type = 'START' then
    if table_row.lifecycle <> 'lobby' or table_row.settings_locked then
      command_errors := jsonb_build_array('This table has already started.');
    elsif table_row.host_user_id is distinct from p_actor_user_id then
      command_errors := jsonb_build_array('Only the current host can start the table.');
    elsif exists (
      select 1 from public.gameplay_join_requests request
      where request.table_id = p_table_id and request.status = 'pending'
    ) then
      command_errors := jsonb_build_array('All pending join requests must be resolved before Start.');
    elsif not exists (
      select 1 from public.gameplay_table_seats seat
      where seat.table_id = p_table_id and seat.seat_kind = 'human'
    ) then
      command_errors := jsonb_build_array('At least one connected human is required to start.');
    else
      -- permanent bot id format standard-bot:table-id:seat_number
      for seat_number in 1..4 loop
        if not exists (
          select 1 from public.gameplay_table_seats seat
          where seat.table_id = p_table_id and seat.seat_number = seat_number
        ) then
          insert into public.gameplay_table_seats (
            table_id, seat_number, seat_kind, bot_id, display_name_snapshot, joined_at
          ) values (
            p_table_id,
            seat_number,
            'bot',
            format('standard-bot:%s:%s', p_table_id, seat_number - 1),
            format('Standard Bot %s', seat_number),
            p_occurred_at
          );
        end if;
      end loop;

      update public.gameplay_tables
      set lifecycle = 'active', settings_locked = true, updated_by = p_actor_user_id
      where id = p_table_id;
      event_type := 'table.started';
    end if;

  else
    command_errors := jsonb_build_array('Unsupported gameplay table command.');
  end if;

  if command_errors is not null then
    transition := jsonb_build_object(
      'valid', false,
      'errors', command_errors,
      'tableId', p_table_id,
      'version', table_row.version
    );
    return public.record_gameplay_table_command(
      p_table_id, p_command_id, p_command_type, p_expected_version, table_row.version,
      p_actor_user_id, p_occurred_at, p_payload, false, command_errors, transition
    );
  end if;

  update public.gameplay_tables
  set version = version + 1,
      updated_by = p_actor_user_id
  where id = p_table_id
  returning * into table_row;

  transition := public.gameplay_table_snapshot_json(p_table_id, p_actor_user_id)
    || jsonb_build_object('valid', true, 'errors', '[]'::jsonb);

  return public.record_gameplay_table_command(
    p_table_id, p_command_id, p_command_type, p_expected_version, table_row.version,
    p_actor_user_id, p_occurred_at, p_payload, true, '[]'::jsonb, transition,
    event_type, event_details
  );
end;
$$;

create or replace function public.create_gameplay_table(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_name text,
  p_visibility text,
  p_join_policy text,
  p_turn_timer_seconds integer default 45,
  p_disconnect_grace_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  table_id uuid;
  transition jsonb;
begin
  perform public.assert_gameplay_actor(p_workspace_id, p_actor_user_id);

  if trim(p_name) = '' then raise exception 'Table name is required.'; end if;
  if p_visibility not in ('private', 'public') then raise exception 'Invalid table visibility.'; end if;
  if p_join_policy not in ('open', 'approval-required') then raise exception 'Invalid join policy.'; end if;
  if p_turn_timer_seconds not in (20, 30, 45, 60, 90) then raise exception 'Invalid turn timer.'; end if;
  if p_disconnect_grace_seconds not in (30, 60, 90, 120) then raise exception 'Invalid disconnect grace.'; end if;

  insert into public.gameplay_tables (
    workspace_id, name, visibility, join_policy, host_user_id,
    turn_timer_seconds, disconnect_grace_seconds, created_by, updated_by
  ) values (
    p_workspace_id, trim(p_name), p_visibility, p_join_policy, p_actor_user_id,
    p_turn_timer_seconds, p_disconnect_grace_seconds, p_actor_user_id, p_actor_user_id
  ) returning id into table_id;

  insert into public.gameplay_table_seats (
    table_id, seat_number, seat_kind, user_id, display_name_snapshot, joined_at
  ) values (
    table_id,
    1,
    'human',
    p_actor_user_id,
    coalesce((select nullif(trim(display_name), '') from public.profiles where user_id = p_actor_user_id), 'Host'),
    now()
  );

  transition := public.gameplay_table_snapshot_json(table_id, p_actor_user_id)
    || jsonb_build_object('valid', true, 'errors', '[]'::jsonb);

  perform public.record_gameplay_table_command(
    table_id, p_command_id, 'CREATE', 0, 0, p_actor_user_id, now(),
    jsonb_build_object(
      'name', p_name,
      'visibility', p_visibility,
      'joinPolicy', p_join_policy,
      'turnTimerSeconds', p_turn_timer_seconds,
      'disconnectGraceSeconds', p_disconnect_grace_seconds
    ),
    true, '[]'::jsonb, transition, 'table.created', '{}'::jsonb
  );

  return transition;
end;
$$;

create or replace function public.update_gameplay_table_settings(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer,
  p_patch jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_gameplay_table_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id, p_expected_version,
    now(), 'UPDATE_SETTINGS', p_patch
  );
$$;

create or replace function public.join_gameplay_table(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer,
  p_join_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_gameplay_table_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id, p_expected_version,
    now(), 'JOIN_OPEN', p_join_payload
  );
$$;

create or replace function public.request_gameplay_table_join(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer,
  p_request_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_gameplay_table_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id, p_expected_version,
    now(), 'REQUEST_JOIN', p_request_payload
  );
$$;

create or replace function public.respond_gameplay_join_request(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer,
  p_request_id uuid,
  p_decision text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_gameplay_table_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id, p_expected_version,
    now(), 'RESPOND_JOIN_REQUEST',
    jsonb_build_object('requestId', p_request_id, 'decision', p_decision)
  );
$$;

create or replace function public.leave_gameplay_table(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_gameplay_table_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id, p_expected_version,
    now(), 'LEAVE_LOBBY', '{}'::jsonb
  );
$$;

create or replace function public.start_gameplay_table(
  p_table_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_command_id text,
  p_expected_version integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_gameplay_table_command(
    p_table_id, p_workspace_id, p_actor_user_id, p_command_id, p_expected_version,
    now(), 'START', '{}'::jsonb
  );
$$;

create or replace function public.get_gameplay_lobby(
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
  perform public.assert_gameplay_actor(p_workspace_id, p_actor_user_id);

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'tableId', table_row.id,
        'name', table_row.name,
        'visibility', table_row.visibility,
        'joinPolicy', table_row.join_policy,
        'lifecycle', table_row.lifecycle,
        'hostUserId', table_row.host_user_id,
        'turnTimerSeconds', table_row.turn_timer_seconds,
        'disconnectGraceSeconds', table_row.disconnect_grace_seconds,
        'occupiedSeatCount', (
          select count(*) from public.gameplay_table_seats seat where seat.table_id = table_row.id
        ),
        'version', table_row.version
      ) order by table_row.updated_at desc, table_row.id
    )
    from public.gameplay_tables table_row
    where table_row.workspace_id = p_workspace_id
      and table_row.visibility = 'public'
      and table_row.lifecycle = 'lobby'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_gameplay_table_snapshot(
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
  perform public.assert_gameplay_actor(p_workspace_id, p_actor_user_id);
  if public.gameplay_table_workspace_id(p_table_id) is distinct from p_workspace_id then
    raise exception 'Gameplay table was not found in the requested workspace.';
  end if;
  return public.gameplay_table_snapshot_json(p_table_id, p_actor_user_id);
end;
$$;

revoke all on function public.assert_gameplay_actor(uuid, uuid) from public;
revoke all on function public.gameplay_table_snapshot_json(uuid, uuid) from public;
revoke all on function public.record_gameplay_table_command(uuid, text, text, integer, integer, uuid, timestamptz, jsonb, boolean, jsonb, jsonb, text, jsonb) from public;
revoke all on function public.process_gameplay_table_command(uuid, uuid, uuid, text, integer, timestamptz, text, jsonb) from public;
revoke all on function public.create_gameplay_table(uuid, uuid, text, text, text, text, integer, integer) from public;
revoke all on function public.update_gameplay_table_settings(uuid, uuid, uuid, text, integer, jsonb) from public;
revoke all on function public.join_gameplay_table(uuid, uuid, uuid, text, integer, jsonb) from public;
revoke all on function public.request_gameplay_table_join(uuid, uuid, uuid, text, integer, jsonb) from public;
revoke all on function public.respond_gameplay_join_request(uuid, uuid, uuid, text, integer, uuid, text) from public;
revoke all on function public.leave_gameplay_table(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.start_gameplay_table(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.get_gameplay_lobby(uuid, uuid) from public;
revoke all on function public.get_gameplay_table_snapshot(uuid, uuid, uuid) from public;

grant execute on function public.create_gameplay_table(uuid, uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.update_gameplay_table_settings(uuid, uuid, uuid, text, integer, jsonb) to authenticated;
grant execute on function public.join_gameplay_table(uuid, uuid, uuid, text, integer, jsonb) to authenticated;
grant execute on function public.request_gameplay_table_join(uuid, uuid, uuid, text, integer, jsonb) to authenticated;
grant execute on function public.respond_gameplay_join_request(uuid, uuid, uuid, text, integer, uuid, text) to authenticated;
grant execute on function public.leave_gameplay_table(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.start_gameplay_table(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.get_gameplay_lobby(uuid, uuid) to authenticated;
grant execute on function public.get_gameplay_table_snapshot(uuid, uuid, uuid) to authenticated;
