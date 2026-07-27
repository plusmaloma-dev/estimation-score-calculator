create table public.gameplay_tables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  visibility text not null check (visibility in ('private', 'public')),
  join_policy text not null check (join_policy in ('open', 'approval-required')),
  lifecycle text not null default 'lobby'
    check (lifecycle in ('lobby', 'active', 'paused', 'completed', 'terminated', 'closed')),
  host_user_id uuid references auth.users(id),
  turn_timer_seconds smallint not null default 45
    check (turn_timer_seconds in (20, 30, 45, 60, 90)),
  disconnect_grace_seconds smallint not null default 60
    check (disconnect_grace_seconds in (30, 60, 90, 120)),
  settings_locked boolean not null default false,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint gameplay_tables_closed_host_check check (
    lifecycle <> 'closed' or host_user_id is null
  )
);

create index gameplay_tables_workspace_lobby_idx
  on public.gameplay_tables(workspace_id, lifecycle, visibility, updated_at desc);
create index gameplay_tables_host_idx
  on public.gameplay_tables(host_user_id)
  where host_user_id is not null;

create table public.gameplay_table_seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.gameplay_tables(id) on delete cascade,
  seat_number smallint not null check (seat_number between 1 and 4),
  seat_kind text not null check (seat_kind in ('human', 'bot')),
  user_id uuid references auth.users(id),
  bot_id text,
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) > 0),
  joined_at timestamptz not null,
  unique (table_id, seat_number),
  constraint gameplay_table_seats_identity_check check (
    (seat_kind = 'human' and user_id is not null and bot_id is null)
    or
    (seat_kind = 'bot' and user_id is null and bot_id is not null)
  )
);

create unique index gameplay_table_human_user_uidx
  on public.gameplay_table_seats(table_id, user_id)
  where user_id is not null;
create unique index gameplay_table_bot_id_uidx
  on public.gameplay_table_seats(table_id, bot_id)
  where bot_id is not null;

create table public.gameplay_join_requests (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.gameplay_tables(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name_snapshot text not null check (length(trim(display_name_snapshot)) > 0),
  requested_seat smallint check (requested_seat between 1 and 4),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  requested_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  constraint gameplay_join_request_resolution_check check (
    (status = 'pending' and resolved_at is null and resolved_by is null)
    or
    (status in ('accepted', 'rejected') and resolved_at is not null and resolved_by is not null)
  )
);

create unique index gameplay_join_requests_pending_user_uidx
  on public.gameplay_join_requests(table_id, user_id)
  where status = 'pending';
create index gameplay_join_requests_table_time_idx
  on public.gameplay_join_requests(table_id, requested_at, id);

create table public.gameplay_table_commands (
  id bigserial primary key,
  table_id uuid not null references public.gameplay_tables(id) on delete cascade,
  command_id text not null check (length(trim(command_id)) > 0),
  command_type text not null,
  expected_version integer not null check (expected_version >= 0),
  resulting_version integer not null check (resulting_version >= 0),
  actor_user_id uuid not null references auth.users(id),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  accepted boolean not null,
  errors jsonb not null default '[]'::jsonb,
  transition jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  unique (table_id, command_id)
);

create index gameplay_table_commands_table_time_idx
  on public.gameplay_table_commands(table_id, recorded_at, id);

create table public.gameplay_table_events (
  id bigserial primary key,
  table_id uuid not null references public.gameplay_tables(id) on delete cascade,
  table_version integer not null check (table_version >= 0),
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index gameplay_table_events_table_time_idx
  on public.gameplay_table_events(table_id, recorded_at, id);

create trigger gameplay_tables_set_updated_at
before update on public.gameplay_tables
for each row execute function public.set_updated_at();
