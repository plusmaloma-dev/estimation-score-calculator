-- Qualify joined seat-number references in the score-journal round loader.
-- Migration 014 introduced a join between active seat controls and table seats;
-- the unqualified seat_number references became ambiguous in PostgreSQL.
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
      'seat', control.seat_number - 1,
      'humanUserId', control.human_user_id,
      'botId', control.bot_id,
      'controlOwner', control.control_owner,
      'seatKind', table_seat.seat_kind,
      'displayName', case
        when table_seat.seat_kind = 'bot' then format('Standard Bot %s', control.seat_number)
        else table_seat.display_name_snapshot
      end
    ) order by control.seat_number
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
