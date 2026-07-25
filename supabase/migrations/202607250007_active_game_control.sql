create table public.gameplay_active_controls (
  table_id uuid primary key references public.gameplay_tables(id) on delete cascade,
  lifecycle text not null default 'active'
    check (lifecycle in ('active', 'paused', 'terminated')),
  host_user_id uuid not null references auth.users(id),
  turn_timer_seconds smallint not null
    check (turn_timer_seconds in (20, 30, 45, 60, 90)),
  disconnect_grace_seconds smallint not null
    check (disconnect_grace_seconds in (30, 60, 90, 120)),
  turn_id text,
  turn_seat smallint check (turn_seat between 1 and 4),
  turn_action_kind text check (turn_action_kind in ('bid', 'card')),
  turn_started_at timestamptz,
  turn_deadline_at timestamptz,
  turn_remaining_ms integer check (turn_remaining_ms is null or turn_remaining_ms >= 0),
  turn_status text check (turn_status in ('running', 'assistant-pending', 'bot-processing')),
  paused_at timestamptz,
  terminated_at timestamptz,
  terminated_by uuid references auth.users(id),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint gameplay_active_turn_shape_check check (
    (turn_id is null and turn_seat is null and turn_action_kind is null
      and turn_started_at is null and turn_deadline_at is null
      and turn_remaining_ms is null and turn_status is null)
    or
    (turn_id is not null and turn_seat is not null and turn_action_kind is not null
      and turn_started_at is not null and turn_status is not null)
  ),
  constraint gameplay_active_termination_check check (
    (lifecycle <> 'terminated' and terminated_at is null and terminated_by is null)
    or
    (lifecycle = 'terminated' and terminated_at is not null and terminated_by is not null)
  )
);

create trigger gameplay_active_controls_set_updated_at
before update on public.gameplay_active_controls
for each row execute function public.set_updated_at();

create table public.gameplay_active_seat_controls (
  table_id uuid not null references public.gameplay_active_controls(table_id) on delete cascade,
  seat_number smallint not null check (seat_number between 1 and 4),
  seat_kind text not null check (seat_kind in ('human', 'bot')),
  human_user_id uuid references auth.users(id),
  bot_id text,
  joined_at timestamptz not null,
  connected_at timestamptz,
  connection text not null check (connection in ('connected', 'disconnected')),
  control_owner text not null
    check (control_owner in ('human', 'temporary-bot', 'permanent-bot')),
  disconnected_at timestamptz,
  grace_deadline_at timestamptz,
  grace_remaining_ms integer check (grace_remaining_ms is null or grace_remaining_ms >= 0),
  reclaim_pending boolean not null default false,
  primary key (table_id, seat_number),
  constraint gameplay_active_seat_identity_check check (
    (seat_kind = 'human' and human_user_id is not null and bot_id is null)
    or
    (seat_kind = 'bot' and human_user_id is null and bot_id is not null)
  ),
  constraint gameplay_active_permanent_bot_check check (
    seat_kind <> 'bot'
    or (connection = 'disconnected' and control_owner = 'permanent-bot' and reclaim_pending = false)
  ),
  constraint gameplay_active_human_owner_check check (
    seat_kind <> 'human' or control_owner in ('human', 'temporary-bot')
  )
);

create unique index gameplay_active_human_user_uidx
  on public.gameplay_active_seat_controls(table_id, human_user_id)
  where human_user_id is not null;
create unique index gameplay_active_bot_id_uidx
  on public.gameplay_active_seat_controls(table_id, bot_id)
  where bot_id is not null;

create table public.gameplay_active_control_commands (
  id bigserial primary key,
  table_id uuid not null references public.gameplay_active_controls(table_id) on delete cascade,
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
  events jsonb not null default '[]'::jsonb,
  directives jsonb not null default '[]'::jsonb,
  recorded_at timestamptz not null default now(),
  unique (table_id, command_id)
);

create index gameplay_active_commands_table_time_idx
  on public.gameplay_active_control_commands(table_id, recorded_at, id);

alter table public.gameplay_active_controls enable row level security;
alter table public.gameplay_active_seat_controls enable row level security;
alter table public.gameplay_active_control_commands enable row level security;

create policy gameplay_active_controls_scoped_select
on public.gameplay_active_controls
for select to authenticated
using (public.can_view_gameplay_table(table_id));

create policy gameplay_active_seats_scoped_select
on public.gameplay_active_seat_controls
for select to authenticated
using (public.can_view_gameplay_table(table_id));

create policy gameplay_active_commands_audit_select
on public.gameplay_active_control_commands
for select to authenticated
using (public.can_audit_gameplay_table(table_id));

grant select on public.gameplay_active_controls,
  public.gameplay_active_seat_controls,
  public.gameplay_active_control_commands
  to authenticated;

-- Active-control writes are intentionally unavailable as direct authenticated grants.
-- Authenticated clients must use the security-definer RPCs in the next migration.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gameplay_active_controls'
  ) then
    alter publication supabase_realtime add table public.gameplay_active_controls;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gameplay_active_seat_controls'
  ) then
    alter publication supabase_realtime add table public.gameplay_active_seat_controls;
  end if;
end;
$$;
