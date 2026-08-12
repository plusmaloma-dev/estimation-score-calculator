-- Seat-owned, append-only public score history. This migration never backfills
-- rounds whose private aggregate has already been replaced by a later round.
create table public.gameplay_round_score_history (
  table_id uuid not null references public.gameplay_round_states(table_id) on delete cascade,
  round_number integer not null check (round_number > 0),
  seat_0_delta integer not null check (seat_0_delta between -2147483648 and 2147483647),
  seat_1_delta integer not null check (seat_1_delta between -2147483648 and 2147483647),
  seat_2_delta integer not null check (seat_2_delta between -2147483648 and 2147483647),
  seat_3_delta integer not null check (seat_3_delta between -2147483648 and 2147483647),
  recorded_at timestamptz not null default now(),
  primary key (table_id, round_number),
  unique (table_id, round_number)
);

alter table public.gameplay_round_score_history enable row level security;

revoke all on table public.gameplay_round_score_history from public;
revoke all on table public.gameplay_round_score_history from anon;
revoke all on table public.gameplay_round_score_history from authenticated;
grant select, insert on table public.gameplay_round_score_history to service_role;

create or replace function public.insert_gameplay_round_score_history(
  p_table_id uuid,
  p_round_number integer,
  p_seat_0_delta integer,
  p_seat_1_delta integer,
  p_seat_2_delta integer,
  p_seat_3_delta integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.gameplay_round_score_history%rowtype;
begin
  if p_table_id is null or p_round_number is null or p_round_number < 1
    or p_seat_0_delta is null or p_seat_1_delta is null
    or p_seat_2_delta is null or p_seat_3_delta is null then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('Score history payload is incomplete.'));
  end if;

  select * into existing
  from public.gameplay_round_score_history
  where table_id = p_table_id and round_number = p_round_number
  for update;

  if found then
    if existing.seat_0_delta is distinct from p_seat_0_delta
      or existing.seat_1_delta is distinct from p_seat_1_delta
      or existing.seat_2_delta is distinct from p_seat_2_delta
      or existing.seat_3_delta is distinct from p_seat_3_delta then
      return jsonb_build_object('valid', false, 'conflict', true, 'errors', jsonb_build_array('Score history payload conflicts with the recorded round.'));
    end if;
    return jsonb_build_object('valid', true, 'duplicate', true, 'conflict', false);
  end if;

  insert into public.gameplay_round_score_history (
    table_id, round_number, seat_0_delta, seat_1_delta, seat_2_delta, seat_3_delta
  ) values (
    p_table_id, p_round_number, p_seat_0_delta, p_seat_1_delta, p_seat_2_delta, p_seat_3_delta
  );

  return jsonb_build_object('valid', true, 'duplicate', false, 'conflict', false);
end;
$$;

revoke all on function public.insert_gameplay_round_score_history(uuid, integer, integer, integer, integer, integer) from public;
revoke all on function public.insert_gameplay_round_score_history(uuid, integer, integer, integer, integer, integer) from anon;
revoke all on function public.insert_gameplay_round_score_history(uuid, integer, integer, integer, integer, integer) from authenticated;
grant execute on function public.insert_gameplay_round_score_history(uuid, integer, integer, integer, integer, integer) to service_role;

create or replace function public.record_gameplay_round_score_history_on_scored()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  player_rows jsonb := NEW.aggregate->'players';
  score_rows jsonb := NEW.aggregate->'scoreResult'->'scoreResult'->'playerScores';
  player_id text;
  delta integer;
  seat_index integer;
  deltas integer[] := array[]::integer[];
begin
  if NEW.phase <> 'scored' or OLD.phase = 'scored' then
    return NEW;
  end if;
  if jsonb_typeof(player_rows) <> 'array'
    or jsonb_array_length(player_rows) <> 4
    or jsonb_typeof(score_rows) <> 'array' then
    raise exception 'Scored gameplay aggregate has no complete public score payload.';
  end if;

  for seat_index in 0..3 loop
    select player->>'playerId' into player_id
    from jsonb_array_elements(player_rows) player
    where (player->>'seat')::integer = seat_index;
    if player_id is null then
      raise exception 'Scored gameplay aggregate is missing table seat %.', seat_index;
    end if;
    select (score->>'score')::integer into delta
    from jsonb_array_elements(score_rows) score
    where score->>'playerId' = player_id;
    if delta is null then
      raise exception 'Scored gameplay aggregate is missing score for table seat %.', seat_index;
    end if;
    deltas := array_append(deltas, delta);
  end loop;

  insert into public.gameplay_round_score_history (
    table_id, round_number, seat_0_delta, seat_1_delta, seat_2_delta, seat_3_delta
  ) values (
    NEW.table_id, NEW.round_number, deltas[1], deltas[2], deltas[3], deltas[4]
  ) on conflict (table_id, round_number) do nothing;

  if not exists (
    select 1
    from public.gameplay_round_score_history history
    where history.table_id = NEW.table_id
      and history.round_number = NEW.round_number
      and history.seat_0_delta = deltas[1]
      and history.seat_1_delta = deltas[2]
      and history.seat_2_delta = deltas[3]
      and history.seat_3_delta = deltas[4]
  ) then
    raise exception 'Conflicting score history payload for table % round %.', NEW.table_id, NEW.round_number;
  end if;
  return NEW;
end;
$$;

drop trigger if exists gameplay_round_score_history_on_scored on public.gameplay_round_states;
create trigger gameplay_round_score_history_on_scored
after update of phase, aggregate on public.gameplay_round_states
for each row execute function public.record_gameplay_round_score_history_on_scored();

revoke all on function public.record_gameplay_round_score_history_on_scored() from public;
grant execute on function public.record_gameplay_round_score_history_on_scored() to service_role;

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
  history_rows jsonb;
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
  ), '[]'::jsonb) into command_rows
  from public.gameplay_round_commands
  where table_id = p_table_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seat', seat_number - 1,
      'humanUserId', control.human_user_id,
      'botId', control.bot_id,
      'controlOwner', control.control_owner,
      'seatKind', table_seat.seat_kind,
      'displayName', case
        when table_seat.seat_kind = 'bot' then format('Standard Bot %s', seat_number)
        else table_seat.display_name_snapshot
      end
    ) order by seat_number
  ), '[]'::jsonb) into seat_rows
  from public.gameplay_active_seat_controls control
  join public.gameplay_table_seats table_seat
    on table_seat.table_id = control.table_id
   and table_seat.seat_number = control.seat_number
  where control.table_id = p_table_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'roundNumber', round_number,
      'deltasBySeat', jsonb_build_array(seat_0_delta, seat_1_delta, seat_2_delta, seat_3_delta)
    ) order by round_number
  ), '[]'::jsonb) into history_rows
  from public.gameplay_round_score_history
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
      'seatControls', seat_rows,
      'scoreHistory', history_rows
    )
  );
end;
$$;

revoke all on function public.load_gameplay_round_for_engine(uuid) from public;
grant execute on function public.load_gameplay_round_for_engine(uuid) to service_role;
