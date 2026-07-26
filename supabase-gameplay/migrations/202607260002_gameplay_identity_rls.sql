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

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_memberships enable row level security;

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

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

grant usage on schema public to authenticated;
grant select on public.workspaces, public.profiles, public.workspace_memberships to authenticated;
grant update on public.profiles to authenticated;
grant insert, update on public.workspace_memberships to authenticated;
