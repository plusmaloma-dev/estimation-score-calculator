create extension if not exists pgcrypto;

create or replace function public.normalize_player_name(value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select lower(regexp_replace(trim(value), '\s+', ' ', 'g'));
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'tester')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (workspace_id, user_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null,
  normalized_name text generated always as (public.normalize_player_name(display_name)) stored,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint players_display_name_not_blank check (length(public.normalize_player_name(display_name)) > 0)
);

create unique index players_workspace_normalized_name_uidx
  on public.players(workspace_id, normalized_name);
create index players_workspace_active_idx
  on public.players(workspace_id, archived_at, display_name);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  rule_set text not null check (rule_set in ('HOUSE_RULES_V1', 'FEDERATION_2026')),
  status text not null default 'draft' check (status in ('draft', 'completed', 'archived')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);
create index games_workspace_updated_idx on public.games(workspace_id, updated_at desc);

create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id),
  seat_number smallint not null check (seat_number between 1 and 4),
  player_name_snapshot text not null,
  primary key (game_id, player_id),
  unique (game_id, seat_number)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  round_type text not null check (round_type in ('over', 'under')),
  bid_owner_player_id uuid not null references public.players(id),
  risk_player_id uuid references public.players(id),
  trump_suit text not null check (trump_suit in ('no-trump', 'spades', 'hearts', 'diamonds', 'clubs')),
  is_all_loser_round boolean not null default false,
  consecutive_all_loser_count_before_round integer not null default 0 check (consecutive_all_loser_count_before_round >= 0),
  carried_all_loser_multiplier integer not null default 1 check (carried_all_loser_multiplier >= 1),
  carry_consumed boolean not null default false,
  multiple_with_multiplier integer not null default 1 check (multiple_with_multiplier in (1, 2)),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (game_id, round_number)
);
create index rounds_game_number_idx on public.rounds(game_id, round_number);

create table public.round_bids (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id),
  bid_type text not null check (bid_type in ('normal', 'with', 'hold', 'dash', 'dash-call', 'pass')),
  tricks integer not null check (tricks between 0 and 13),
  trump_suit text check (trump_suit in ('no-trump', 'spades', 'hearts', 'diamonds', 'clubs')),
  with_target_player_id uuid references public.players(id),
  primary key (round_id, player_id)
);

create table public.round_actuals (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id),
  actual_tricks integer not null check (actual_tricks between 0 and 13),
  primary key (round_id, player_id)
);

create table public.round_scores (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id),
  bid_tricks integer not null,
  actual_tricks integer not null,
  delta integer not null,
  did_match_bid boolean not null,
  role text not null,
  risk_type text not null,
  is_risk_taker boolean not null,
  risk_modifier integer not null,
  is_high_contract boolean not null,
  is_only_winner boolean not null,
  is_only_loser boolean not null,
  status text not null check (status in ('success', 'failed', 'pending-rule')),
  calculated_score integer not null,
  applied_score integer not null,
  notes jsonb not null default '[]'::jsonb,
  primary key (round_id, player_id)
);

create table public.score_overrides (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id),
  calculated_score integer not null,
  previous_applied_score integer not null,
  new_applied_score integer not null,
  reason text not null check (length(trim(reason)) > 0),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id)
);
create index score_overrides_round_changed_idx on public.score_overrides(round_id, changed_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_workspace_time_idx on public.audit_events(workspace_id, occurred_at desc);

create table public.game_edit_locks (
  game_id uuid primary key references public.games(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  holder_user_id uuid not null references auth.users(id),
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint game_edit_locks_expiry_after_heartbeat check (expires_at > heartbeat_at)
);
create index game_edit_locks_workspace_expiry_idx on public.game_edit_locks(workspace_id, expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
before update on public.workspace_memberships
for each row execute function public.set_updated_at();

create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();
