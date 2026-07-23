create or replace function public.assert_rpc_actor(
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
    raise exception 'Authenticated actor does not match the requested actor.' using errcode = '42501';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_active_game_lock(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  if not exists (
    select 1
    from public.game_edit_locks lock_row
    where lock_row.game_id = p_game_id
      and lock_row.workspace_id = p_workspace_id
      and lock_row.holder_user_id = p_actor_user_id
      and lock_row.expires_at > now()
  ) then
    raise exception 'Game edit lock is required.' using errcode = '55P03';
  end if;
end;
$$;

create or replace function public.create_game(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_rule_set text,
  p_players jsonb
)
returns table(game_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_game_id uuid;
  player_item jsonb;
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  if not public.has_workspace_role(p_workspace_id, array['admin', 'tester']) then
    raise exception 'Game creation is not permitted.' using errcode = '42501';
  end if;
  if length(trim(p_name)) = 0 then
    raise exception 'Game name is required.' using errcode = '22023';
  end if;
  if p_rule_set not in ('HOUSE_RULES_V1', 'FEDERATION_2026') then
    raise exception 'Unsupported rule set.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> 4 then
    raise exception 'Exactly four players are required.' using errcode = '22023';
  end if;
  if (
    select count(distinct item->>'player_id')
    from jsonb_array_elements(p_players) item
  ) <> 4 then
    raise exception 'Players must be unique.' using errcode = '22023';
  end if;

  insert into public.games(workspace_id, name, rule_set, created_by, updated_by)
  values (p_workspace_id, trim(p_name), p_rule_set, p_actor_user_id, p_actor_user_id)
  returning id into created_game_id;

  for player_item in select value from jsonb_array_elements(p_players)
  loop
    if not exists (
      select 1 from public.players
      where id = (player_item->>'player_id')::uuid
        and workspace_id = p_workspace_id
        and archived_at is null
    ) then
      raise exception 'Selected player is unavailable.' using errcode = '22023';
    end if;
    insert into public.game_players(game_id, player_id, seat_number, player_name_snapshot)
    values (
      created_game_id,
      (player_item->>'player_id')::uuid,
      (player_item->>'seat_number')::smallint,
      trim(player_item->>'player_name_snapshot')
    );
  end loop;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
  values (p_workspace_id, p_actor_user_id, 'game.created', 'game', created_game_id);

  return query select created_game_id, 'draft'::text, 1;
end;
$$;

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
    select 1 from public.games
    where id = p_game_id and workspace_id = p_workspace_id and status = 'draft'
  ) then
    raise exception 'Only an in-progress game can be edited.' using errcode = '55000';
  end if;

  insert into public.game_edit_locks(
    game_id, workspace_id, holder_user_id, acquired_at, heartbeat_at, expires_at
  ) values (
    p_game_id, p_workspace_id, p_actor_user_id, now(), now(), lock_expiry
  )
  on conflict (game_id) do update
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
  from public.game_edit_locks lock_row where lock_row.game_id = p_game_id;
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
  where game_id = p_game_id
    and workspace_id = p_workspace_id
    and holder_user_id = p_actor_user_id
    and expires_at > now();
  if not found then
    raise exception 'The editing lock has expired or belongs to another user.' using errcode = '55P03';
  end if;
  return query
  select lock_row.game_id, lock_row.holder_user_id, lock_row.expires_at
  from public.game_edit_locks lock_row where lock_row.game_id = p_game_id;
end;
$$;

create or replace function public.release_game_lock(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  delete from public.game_edit_locks
  where game_id = p_game_id
    and workspace_id = p_workspace_id
    and holder_user_id = p_actor_user_id;
  if found then
    insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
    values (p_workspace_id, p_actor_user_id, 'game.lock.released', 'game', p_game_id);
  end if;
  return jsonb_build_object('released', found);
end;
$$;

create or replace function public.force_release_game_lock(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  if not public.has_workspace_role(p_workspace_id, array['admin']) then
    raise exception 'Only an Admin can force-release a lock.' using errcode = '42501';
  end if;
  delete from public.game_edit_locks
  where game_id = p_game_id and workspace_id = p_workspace_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
  values (
    p_workspace_id,
    p_actor_user_id,
    'game.lock.force_released',
    'game',
    p_game_id
  );
  return jsonb_build_object('released', found);
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
  select * into game_row from public.games
  where id = p_game_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  if game_row.status <> 'draft' then
    raise exception 'A completed game is read-only.' using errcode = '55000';
  end if;
  if game_row.version <> p_expected_version then
    raise exception 'The game changed. Reload before saving.' using errcode = '40001';
  end if;
  if requested_round_number <> coalesce((select max(round_number) + 1 from public.rounds where game_id = p_game_id), 1) then
    raise exception 'Round number is not the next available round.' using errcode = '22023';
  end if;

  insert into public.rounds(
    game_id, round_number, round_type, bid_owner_player_id, risk_player_id, trump_suit,
    is_all_loser_round, consecutive_all_loser_count_before_round,
    carried_all_loser_multiplier, carry_consumed, multiple_with_multiplier, created_by
  ) values (
    p_game_id,
    requested_round_number,
    coalesce(round_result->>'roundType', round_input->>'roundType')::text,
    (round_input->>'bidOwnerPlayerId')::uuid,
    nullif(round_input->>'riskPlayerId', '')::uuid,
    (select bid->>'trumpSuit' from jsonb_array_elements(round_input->'bids') bid where bid->>'playerId' = round_input->>'bidOwnerPlayerId' limit 1),
    coalesce((round_result->>'isAllLoserRound')::boolean, false),
    coalesce((round_result->>'consecutiveAllLoserCountBeforeRound')::integer, 0),
    coalesce((round_result->>'carriedAllLoserMultiplier')::integer, 1),
    coalesce((round_result->>'carryConsumed')::boolean, false),
    coalesce((round_input->>'multipleWithMultiplier')::integer, 1),
    p_actor_user_id
  ) returning id into created_round_id;

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
    values (created_round_id, (actual_item->>'playerId')::uuid, (actual_item->>'actualTricks')::integer);
  end loop;

  score_items := coalesce(round_result->'playerScores', round_result->'scoreResult'->'playerScores');
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
  where id = p_game_id;
  update public.game_edit_locks
  set heartbeat_at = now(), expires_at = now() + interval '15 minutes'
  where game_edit_locks.game_id = p_game_id and holder_user_id = p_actor_user_id;
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

create or replace function public.override_round_scores(
  p_game_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_expected_version integer,
  p_override_payload jsonb
)
returns table(game_id uuid, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  game_row public.games%rowtype;
  target_round_id uuid;
  target_reason text := trim(p_override_payload->>'reason');
  override_entry record;
  current_score public.round_scores%rowtype;
  next_version integer;
begin
  perform public.assert_active_game_lock(p_game_id, p_workspace_id, p_actor_user_id);
  select * into game_row from public.games
  where id = p_game_id and workspace_id = p_workspace_id for update;
  if game_row.status <> 'draft' then raise exception 'A completed game is read-only.' using errcode = '55000'; end if;
  if game_row.version <> p_expected_version then raise exception 'The game changed. Reload before saving.' using errcode = '40001'; end if;
  if length(target_reason) = 0 then raise exception 'Override reason is required.' using errcode = '22023'; end if;

  select id into target_round_id from public.rounds
  where rounds.game_id = p_game_id and round_number = (p_override_payload->>'roundNumber')::integer;
  if target_round_id is null then raise exception 'Round not found.' using errcode = 'P0002'; end if;

  for override_entry in select key, value from jsonb_each_text(p_override_payload->'overridesByPlayerId')
  loop
    select * into current_score from public.round_scores
    where round_id = target_round_id and player_id = override_entry.key::uuid for update;
    if not found then raise exception 'Player score not found.' using errcode = 'P0002'; end if;
    insert into public.score_overrides(
      round_id, player_id, calculated_score, previous_applied_score,
      new_applied_score, reason, changed_by
    ) values (
      target_round_id,
      override_entry.key::uuid,
      current_score.calculated_score,
      current_score.applied_score,
      override_entry.value::integer,
      target_reason,
      p_actor_user_id
    );
    update public.round_scores
    set applied_score = override_entry.value::integer
    where round_id = target_round_id and player_id = override_entry.key::uuid;
  end loop;

  next_version := game_row.version + 1;
  update public.games set version = next_version, updated_by = p_actor_user_id where id = p_game_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (p_workspace_id, p_actor_user_id, 'score.overridden', 'game', p_game_id, p_override_payload);
  return query select p_game_id, next_version;
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
  select * into game_row from public.games
  where id = p_game_id and workspace_id = p_workspace_id for update;
  if game_row.status <> 'draft' then raise exception 'Only an in-progress game can be completed.' using errcode = '55000'; end if;
  if game_row.version <> p_expected_version then raise exception 'The game changed. Reload before completing.' using errcode = '40001'; end if;
  select count(*) into round_count from public.rounds where game_id = p_game_id;
  if round_count < 18 then raise exception 'At least 18 saved rounds are required.' using errcode = '22023'; end if;

  next_version := game_row.version + 1;
  update public.games
  set status = 'finalized', finalized_at = now(), finalized_by = p_actor_user_id,
      version = next_version, updated_by = p_actor_user_id
  where id = p_game_id;
  delete from public.game_edit_locks where game_edit_locks.game_id = p_game_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
  values (p_workspace_id, p_actor_user_id, 'game.finalized', 'game', p_game_id);
  return query select p_game_id, 'finalized'::text, next_version;
end;
$$;

create or replace function public.reopen_game(
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
  next_version integer;
begin
  perform public.assert_rpc_actor(p_workspace_id, p_actor_user_id);
  if not public.has_workspace_role(p_workspace_id, array['admin', 'tester']) then
    raise exception 'Reopening is not permitted.' using errcode = '42501';
  end if;
  select * into game_row from public.games
  where id = p_game_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  if game_row.status <> 'finalized' then raise exception 'Only a completed game can be reopened.' using errcode = '55000'; end if;
  if game_row.version <> p_expected_version then raise exception 'The game changed. Reload before reopening.' using errcode = '40001'; end if;

  next_version := game_row.version + 1;
  update public.games
  set status = 'draft', finalized_at = null, finalized_by = null,
      version = next_version, updated_by = p_actor_user_id
  where id = p_game_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, entity_type, entity_id)
  values (p_workspace_id, p_actor_user_id, 'game.reopened', 'game', p_game_id);
  return query select p_game_id, 'draft'::text, next_version;
end;
$$;

revoke all on function public.assert_rpc_actor(uuid, uuid) from public;
revoke all on function public.assert_active_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.create_game(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.acquire_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.heartbeat_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.release_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.force_release_game_lock(uuid, uuid, uuid) from public;
revoke all on function public.save_game_round(uuid, uuid, uuid, integer, jsonb) from public;
revoke all on function public.override_round_scores(uuid, uuid, uuid, integer, jsonb) from public;
revoke all on function public.finalize_game(uuid, uuid, uuid, integer) from public;
revoke all on function public.reopen_game(uuid, uuid, uuid, integer) from public;

grant execute on function public.create_game(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.acquire_game_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.heartbeat_game_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.release_game_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.force_release_game_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_game_round(uuid, uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.override_round_scores(uuid, uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.finalize_game(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.reopen_game(uuid, uuid, uuid, integer) to authenticated;
