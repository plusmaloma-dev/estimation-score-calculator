-- Fix PL/pgSQL result-column variables colliding with table column names.
--
-- Functions declared with RETURNS TABLE expose each result column as a
-- PL/pgSQL variable. Qualify database columns (and name the lock constraint)
-- so the functions behave consistently with plpgsql.variable_conflict=error.

create or replace function public.acquire_game_lock(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns table(game_id uuid, holder_user_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
  lock_expiry timestamptz := now() + interval '15 minutes';
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  if not public.has_workspace_role(p_workspace_id, array['admin', 'tester']) then
    raise exception 'Editing is not permitted.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.games game_row
    where game_row.id = p_game_id
      and game_row.workspace_id = p_workspace_id
      and game_row.status = 'draft'
  ) then
    raise exception 'Only an in-progress game can be edited.' using errcode = '55000';
  end if;

  insert into public.game_edit_locks(
    game_id, workspace_id, holder_user_id, acquired_at, heartbeat_at, expires_at
  ) values (
    p_game_id, p_workspace_id, p_actor_user_id, now(), now(), lock_expiry
  )
  on conflict on constraint game_edit_locks_pkey do update
  set workspace_id = excluded.workspace_id,
      holder_user_id = excluded.holder_user_id,
      acquired_at = case
        when public.game_edit_locks.holder_user_id = excluded.holder_user_id
          then public.game_edit_locks.acquired_at
        else now()
      end,
      heartbeat_at = now(),
      expires_at = lock_expiry
  where public.game_edit_locks.expires_at <= now()
     or public.game_edit_locks.holder_user_id = excluded.holder_user_id;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'Game is being edited by another user.' using errcode = '55P03';
  end if;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
  values (p_workspace_id, p_actor_user_id, 'game.lock.acquired', 'game', p_game_id);

  return query
  select lock_row.game_id, lock_row.holder_user_id, lock_row.expires_at
  from public.game_edit_locks lock_row
  where lock_row.game_id = p_game_id;
end;
$$;

create or replace function public.heartbeat_game_lock(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns table(game_id uuid, holder_user_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  update public.game_edit_locks
  set heartbeat_at = now(), expires_at = now() + interval '15 minutes'
  where public.game_edit_locks.game_id = p_game_id
    and public.game_edit_locks.workspace_id = p_workspace_id
    and public.game_edit_locks.holder_user_id = p_actor_user_id
    and public.game_edit_locks.expires_at > now();
  if not found then
    raise exception 'The editing lock has expired or belongs to another user.' using errcode = '55P03';
  end if;
  return query
  select lock_row.game_id, lock_row.holder_user_id, lock_row.expires_at
  from public.game_edit_locks lock_row
  where lock_row.game_id = p_game_id;
end;
$$;

create or replace function public.save_game_round(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_expected_version integer,
  p_round_payload jsonb
)
returns table(game_id uuid, round_number integer, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  game_row public.games%rowtype;
  round_input jsonb := p_round_payload->'roundInput';
  round_result jsonb := p_round_payload->'roundResult';
  score_items jsonb;
  bid_item jsonb;
  actual_item jsonb;
  score_item jsonb;
  created_round_id uuid;
  requested_round_number integer := (p_round_payload->>'roundNumber')::integer;
  next_version integer;
begin
  perform public.assert_active_game_lock(p_game_id, p_workspace_id, p_actor_user_id);
  select game_record.*
  into game_row
  from public.games game_record
  where game_record.id = p_game_id
    and game_record.workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  if game_row.status <> 'draft' then
    raise exception 'A completed game is read-only.' using errcode = '55000';
  end if;
  if game_row.version <> p_expected_version then
    raise exception 'The game changed. Reload before saving.' using errcode = '40001';
  end if;
  if requested_round_number <> coalesce((
    select max(existing_round.round_number) + 1
    from public.rounds existing_round
    where existing_round.game_id = p_game_id
  ), 1) then
    raise exception 'Round number is not the next available round.' using errcode = '22023';
  end if;

  score_items := coalesce(round_result->'playerScores', round_result->'scoreResult'->'playerScores');
  perform public.assert_exact_game_player_set(p_game_id, round_input->'bids', 'Bids');
  perform public.assert_exact_game_player_set(p_game_id, round_input->'actualResults', 'Actual results');
  perform public.assert_exact_game_player_set(p_game_id, score_items, 'Calculated scores');
  if not exists (
    select 1
    from public.game_players game_player
    where game_player.game_id = p_game_id
      and game_player.player_id::text = round_input->>'bidOwnerPlayerId'
  ) then
    raise exception 'Selected player is not part of this game.' using errcode = '22023';
  end if;
  if nullif(round_input->>'riskPlayerId', '') is not null
    and not exists (
      select 1
      from public.game_players game_player
      where game_player.game_id = p_game_id
        and game_player.player_id::text = round_input->>'riskPlayerId'
    )
  then
    raise exception 'Selected player is not part of this game.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(round_input->'bids') bid
    where nullif(bid->>'withTargetPlayerId', '') is not null
      and not exists (
        select 1
        from public.game_players game_player
        where game_player.game_id = p_game_id
          and game_player.player_id::text = bid->>'withTargetPlayerId'
      )
  ) then
    raise exception 'Selected player is not part of this game.' using errcode = '22023';
  end if;

  insert into public.rounds(
    game_id, round_number, round_type, bid_owner_player_id, risk_player_id, trump_suit,
    is_all_loser_round, consecutive_all_loser_count_before_round,
    carried_all_loser_multiplier, carry_consumed, multiple_with_multiplier, created_by
  ) values (
    p_game_id,
    requested_round_number,
    coalesce(
      round_result->'scoreResult'->>'roundType',
      round_result->>'roundType',
      round_input->>'roundType'
    )::text,
    (round_input->>'bidOwnerPlayerId')::uuid,
    nullif(round_input->>'riskPlayerId', '')::uuid,
    (
      select bid->>'trumpSuit'
      from jsonb_array_elements(round_input->'bids') bid
      where bid->>'playerId' = round_input->>'bidOwnerPlayerId'
      limit 1
    ),
    coalesce((round_result->>'isAllLoserRound')::boolean, false),
    coalesce((round_result->>'consecutiveAllLoserCountBeforeRound')::integer, 0),
    coalesce((round_result->>'carriedAllLoserMultiplier')::integer, 1),
    coalesce((round_result->>'carryConsumed')::boolean, false),
    coalesce((round_input->>'multipleWithMultiplier')::integer, 1),
    p_actor_user_id
  ) returning public.rounds.id into created_round_id;

  for bid_item in select value from jsonb_array_elements(round_input->'bids')
  loop
    insert into public.round_bids(round_id, player_id, bid_type, tricks, trump_suit, with_target_player_id)
    values (
      created_round_id,
      (bid_item->>'playerId')::uuid,
      bid_item->>'bidType',
      (bid_item->>'tricks')::integer,
      nullif(bid_item->>'trumpSuit', ''),
      nullif(bid_item->>'withTargetPlayerId', '')::uuid
    );
  end loop;

  for actual_item in select value from jsonb_array_elements(round_input->'actualResults')
  loop
    insert into public.round_actuals(round_id, player_id, actual_tricks)
    values (
      created_round_id,
      (actual_item->>'playerId')::uuid,
      (actual_item->>'actualTricks')::integer
    );
  end loop;

  for score_item in select value from jsonb_array_elements(score_items)
  loop
    insert into public.round_scores(
      round_id, player_id, bid_tricks, actual_tricks, delta, did_match_bid, role,
      risk_type, is_risk_taker, risk_modifier, is_high_contract, is_only_winner,
      is_only_loser, status, calculated_score, applied_score, notes
    ) values (
      created_round_id,
      (score_item->>'playerId')::uuid,
      (score_item->>'bidTricks')::integer,
      (score_item->>'actualTricks')::integer,
      (score_item->>'delta')::integer,
      (score_item->>'didMatchBid')::boolean,
      score_item->>'role',
      score_item->>'riskType',
      (score_item->>'isRiskTaker')::boolean,
      (score_item->>'riskModifier')::integer,
      (score_item->>'isHighContract')::boolean,
      (score_item->>'isOnlyWinner')::boolean,
      (score_item->>'isOnlyLoser')::boolean,
      score_item->>'status',
      (score_item->>'score')::integer,
      (score_item->>'score')::integer,
      coalesce(score_item->'notes', '[]'::jsonb)
    );
  end loop;

  next_version := game_row.version + 1;
  update public.games
  set version = next_version, updated_by = p_actor_user_id
  where public.games.id = p_game_id;
  update public.game_edit_locks
  set heartbeat_at = now(), expires_at = now() + interval '15 minutes'
  where public.game_edit_locks.game_id = p_game_id
    and public.game_edit_locks.holder_user_id = p_actor_user_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (
    p_workspace_id,
    p_actor_user_id,
    'round.saved',
    'round',
    created_round_id,
    jsonb_build_object('gameId', p_game_id, 'roundNumber', requested_round_number)
  );
  return query select p_game_id, requested_round_number, next_version;
end;
$$;

create or replace function public.finalize_game(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_expected_version integer
)
returns table(game_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  game_row public.games%rowtype;
  round_count integer;
  next_version integer;
begin
  perform public.assert_active_game_lock(p_game_id, p_workspace_id, p_actor_user_id);
  select game_record.*
  into game_row
  from public.games game_record
  where game_record.id = p_game_id
    and game_record.workspace_id = p_workspace_id
  for update;
  if game_row.status <> 'draft' then
    raise exception 'Only an in-progress game can be completed.' using errcode = '55000';
  end if;
  if game_row.version <> p_expected_version then
    raise exception 'The game changed. Reload before completing.' using errcode = '40001';
  end if;
  select count(*)
  into round_count
  from public.rounds existing_round
  where existing_round.game_id = p_game_id;
  if round_count < 18 then
    raise exception 'At least 18 saved rounds are required.' using errcode = '22023';
  end if;

  next_version := game_row.version + 1;
  update public.games
  set status = 'finalized',
      finalized_at = now(),
      finalized_by = p_actor_user_id,
      version = next_version,
      updated_by = p_actor_user_id
  where public.games.id = p_game_id;
  delete from public.game_edit_locks
  where public.game_edit_locks.game_id = p_game_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
  values (p_workspace_id, p_actor_user_id, 'game.finalized', 'game', p_game_id);
  return query select p_game_id, 'finalized'::text, next_version;
end;
$$;

revoke all on function public.acquire_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.heartbeat_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.save_game_round(uuid, uuid, uuid, integer, jsonb) from public;
revoke all on function public.finalize_game(uuid, uuid, uuid, integer) from public;

grant execute on function public.acquire_game_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.heartbeat_game_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_game_round(uuid, uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.finalize_game(uuid, uuid, uuid, integer) to authenticated;
