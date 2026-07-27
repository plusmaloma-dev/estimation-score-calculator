create or replace function public.gameplay_table_workspace_id(target_table_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select workspace_id
  from public.gameplay_tables
  where id = target_table_id;
$$;

create or replace function public.is_gameplay_table_participant(target_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.gameplay_table_seats seat
    where seat.table_id = target_table_id
      and seat.seat_kind = 'human'
      and seat.user_id = auth.uid()
  );
$$;

create or replace function public.can_view_gameplay_table(target_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.gameplay_tables table_row
    where table_row.id = target_table_id
      and public.is_workspace_member(table_row.workspace_id)
      and (
        table_row.visibility = 'public'
        or table_row.host_user_id = auth.uid()
        or public.is_gameplay_table_participant(table_row.id)
        or public.has_workspace_role(table_row.workspace_id, array['admin'])
      )
  );
$$;

create or replace function public.can_audit_gameplay_table(target_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.gameplay_tables table_row
    where table_row.id = target_table_id
      and public.is_workspace_member(table_row.workspace_id)
      and (
        table_row.host_user_id = auth.uid()
        or public.is_gameplay_table_participant(table_row.id)
        or public.has_workspace_role(table_row.workspace_id, array['admin'])
      )
  );
$$;

alter table public.gameplay_tables enable row level security;
alter table public.gameplay_table_seats enable row level security;
alter table public.gameplay_join_requests enable row level security;
alter table public.gameplay_table_commands enable row level security;
alter table public.gameplay_table_events enable row level security;

create policy gameplay_tables_scoped_select on public.gameplay_tables
for select to authenticated
using (public.can_view_gameplay_table(id));

create policy gameplay_table_seats_scoped_select on public.gameplay_table_seats
for select to authenticated
using (public.can_view_gameplay_table(table_id));

create policy gameplay_join_requests_scoped_select on public.gameplay_join_requests
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.gameplay_tables table_row
    where table_row.id = table_id
      and (
        table_row.host_user_id = auth.uid()
        or public.has_workspace_role(table_row.workspace_id, array['admin'])
      )
  )
);

create policy gameplay_table_commands_audit_select on public.gameplay_table_commands
for select to authenticated
using (public.can_audit_gameplay_table(table_id));

create policy gameplay_table_events_audit_select on public.gameplay_table_events
for select to authenticated
using (public.can_audit_gameplay_table(table_id));

revoke all on function public.gameplay_table_workspace_id(uuid) from public;
revoke all on function public.is_gameplay_table_participant(uuid) from public;
revoke all on function public.can_view_gameplay_table(uuid) from public;
revoke all on function public.can_audit_gameplay_table(uuid) from public;

grant execute on function public.gameplay_table_workspace_id(uuid) to authenticated;
grant execute on function public.is_gameplay_table_participant(uuid) to authenticated;
grant execute on function public.can_view_gameplay_table(uuid) to authenticated;
grant execute on function public.can_audit_gameplay_table(uuid) to authenticated;

grant select on public.gameplay_tables,
  public.gameplay_table_seats,
  public.gameplay_join_requests,
  public.gameplay_table_commands,
  public.gameplay_table_events
  to authenticated;

-- Gameplay table writes are intentionally unavailable as direct authenticated grants.
-- Authenticated clients must use the security-definer RPCs in the next migration.
