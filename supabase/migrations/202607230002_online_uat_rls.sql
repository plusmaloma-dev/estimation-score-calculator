create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = auth.uid()
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function public.game_workspace_id(target_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.games where id = target_game_id;
$$;

create or replace function public.round_workspace_id(target_round_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select game.workspace_id
  from public.rounds round_row
  join public.games game on game.id = round_row.game_id
  where round_row.id = target_round_id;
$$;

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_bids enable row level security;
alter table public.round_actuals enable row level security;
alter table public.round_scores enable row level security;
alter table public.score_overrides enable row level security;
alter table public.audit_events enable row level security;
alter table public.game_edit_locks enable row level security;

create policy workspaces_member_select on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

create policy profiles_self_select on public.profiles
for select to authenticated
using (user_id = auth.uid());

create policy profiles_self_update on public.profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy memberships_workspace_select on public.workspace_memberships
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy memberships_admin_insert on public.workspace_memberships
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy memberships_admin_update on public.workspace_memberships
for update to authenticated
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy players_member_select on public.players
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy players_member_insert on public.players
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['admin', 'tester'])
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and archived_at is null
);

create policy players_admin_update on public.players
for update to authenticated
using (public.has_workspace_role(workspace_id, array['admin']))
with check (
  public.has_workspace_role(workspace_id, array['admin'])
  and updated_by = auth.uid()
);

create policy games_member_select on public.games
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy games_member_insert on public.games
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['admin', 'tester'])
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy games_member_update on public.games
for update to authenticated
using (public.has_workspace_role(workspace_id, array['admin', 'tester']))
with check (
  public.has_workspace_role(workspace_id, array['admin', 'tester'])
  and updated_by = auth.uid()
);

create policy game_players_member_all on public.game_players
for all to authenticated
using (public.is_workspace_member(public.game_workspace_id(game_id)))
with check (public.has_workspace_role(public.game_workspace_id(game_id), array['admin', 'tester']));

create policy rounds_member_select on public.rounds
for select to authenticated
using (public.is_workspace_member(public.game_workspace_id(game_id)));

create policy rounds_member_insert on public.rounds
for insert to authenticated
with check (
  public.has_workspace_role(public.game_workspace_id(game_id), array['admin', 'tester'])
  and created_by = auth.uid()
);

create policy round_bids_member_all on public.round_bids
for all to authenticated
using (public.is_workspace_member(public.round_workspace_id(round_id)))
with check (public.has_workspace_role(public.round_workspace_id(round_id), array['admin', 'tester']));

create policy round_actuals_member_all on public.round_actuals
for all to authenticated
using (public.is_workspace_member(public.round_workspace_id(round_id)))
with check (public.has_workspace_role(public.round_workspace_id(round_id), array['admin', 'tester']));

create policy round_scores_member_all on public.round_scores
for all to authenticated
using (public.is_workspace_member(public.round_workspace_id(round_id)))
with check (public.has_workspace_role(public.round_workspace_id(round_id), array['admin', 'tester']));

create policy score_overrides_member_select on public.score_overrides
for select to authenticated
using (public.is_workspace_member(public.round_workspace_id(round_id)));

create policy score_overrides_member_insert on public.score_overrides
for insert to authenticated
with check (
  public.has_workspace_role(public.round_workspace_id(round_id), array['admin', 'tester'])
  and changed_by = auth.uid()
);

create policy audit_events_member_select on public.audit_events
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['admin'])
    or actor_user_id = auth.uid()
  )
);

create policy audit_events_member_insert on public.audit_events
for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and actor_user_id = auth.uid()
);

create policy game_locks_member_select on public.game_edit_locks
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy game_locks_member_insert on public.game_edit_locks
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['admin', 'tester'])
  and holder_user_id = auth.uid()
);

create policy game_locks_holder_update on public.game_edit_locks
for update to authenticated
using (
  holder_user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['admin'])
)
with check (
  holder_user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['admin'])
);

create policy game_locks_holder_delete on public.game_edit_locks
for delete to authenticated
using (
  holder_user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['admin'])
);

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
revoke all on function public.game_workspace_id(uuid) from public;
revoke all on function public.round_workspace_id(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function public.game_workspace_id(uuid) to authenticated;
grant execute on function public.round_workspace_id(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select on public.workspaces, public.profiles, public.workspace_memberships,
  public.players, public.games, public.game_players, public.rounds, public.round_bids,
  public.round_actuals, public.round_scores, public.score_overrides, public.audit_events,
  public.game_edit_locks to authenticated;
grant update on public.profiles to authenticated;
grant insert, update on public.workspace_memberships to authenticated;
grant insert, update on public.players to authenticated;

-- Game, round, score, audit, and lock writes are intentionally not granted directly.
-- Authenticated clients must use the security-definer RPCs in 202607230003_online_uat_rpc.sql,
-- which enforce optimistic versions, completed-game guards, edit locks, and actor attribution.
