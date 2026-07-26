create table public.gameplay_round_states (
  table_id uuid primary key references public.gameplay_active_controls(table_id) on delete cascade,
  round_number integer not null check (round_number > 0),
  phase text not null check (phase in ('bidding', 'playing', 'scored')),
  version integer not null default 0 check (version >= 0),
  aggregate jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);

create trigger gameplay_round_states_set_updated_at
before update on public.gameplay_round_states
for each row execute function public.set_updated_at();

create table public.gameplay_round_commands (
  id bigserial primary key,
  table_id uuid not null references public.gameplay_round_states(table_id) on delete cascade,
  command_id text not null check (length(trim(command_id)) > 0),
  command_type text not null check (command_type in ('SUBMIT_BID', 'PLAY_CARD')),
  expected_version integer not null check (expected_version >= 0),
  resulting_version integer not null check (resulting_version >= 0),
  actor_user_id uuid not null references auth.users(id),
  actor_seat smallint not null check (actor_seat between 1 and 4),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  accepted boolean not null,
  errors jsonb not null default '[]'::jsonb,
  transition jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  unique (table_id, command_id)
);

create index gameplay_round_commands_table_time_idx
  on public.gameplay_round_commands(table_id, recorded_at, id);

create table public.gameplay_round_invalidations (
  id bigserial primary key,
  table_id uuid not null references public.gameplay_round_states(table_id) on delete cascade,
  version integer not null check (version >= 0),
  phase text not null check (phase in ('bidding', 'playing', 'scored')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (table_id, version)
);

create index gameplay_round_invalidations_table_time_idx
  on public.gameplay_round_invalidations(table_id, recorded_at, id);

alter table public.gameplay_round_states enable row level security;
alter table public.gameplay_round_commands enable row level security;
alter table public.gameplay_round_invalidations enable row level security;

-- The full aggregate and command ledger contain all four private hands through
-- deterministic transitions. They intentionally have no authenticated policy
-- or direct grant. Only service-role Edge Function RPCs may read or write them.

create policy gameplay_round_invalidations_scoped_select
on public.gameplay_round_invalidations
for select to authenticated
using (public.can_view_gameplay_table(table_id));

grant select on public.gameplay_round_invalidations to authenticated;

-- No authenticated INSERT, UPDATE, or DELETE grant is provided for any round
-- persistence table. All authoritative writes use service-role RPCs.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gameplay_round_invalidations'
  ) then
    alter publication supabase_realtime add table public.gameplay_round_invalidations;
  end if;
end;
$$;
