begin;

create extension if not exists pgtap;

create temporary table next_round_fixture (
  table_id uuid not null,
  host_user_id uuid not null,
  round_number integer not null,
  round_version integer not null,
  control_version integer not null
) on commit drop;

insert into auth.users (id, is_sso_user, is_anonymous)
values ('10000000-0000-0000-0000-000000000001', false, false);

insert into public.profiles (user_id, display_name)
values ('10000000-0000-0000-0000-000000000001', 'Task 6 Host');

insert into public.workspaces (id, slug, name)
values ('10000000-0000-0000-0000-000000000010', 'task-6-local', 'Task 6 Local');

insert into public.workspace_memberships (workspace_id, user_id, role, created_by, updated_by)
values (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000001',
  'admin',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

insert into public.gameplay_tables (
  id, workspace_id, name, visibility, join_policy, lifecycle, host_user_id,
  turn_timer_seconds, disconnect_grace_seconds, settings_locked, version,
  created_by, updated_by
) values (
  '10000000-0000-0000-0000-000000000100',
  '10000000-0000-0000-0000-000000000010',
  'Task 6 Local Table',
  'private',
  'open',
  'active',
  '10000000-0000-0000-0000-000000000001',
  45,
  60,
  true,
  7,
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

insert into public.gameplay_table_seats (
  table_id, seat_number, seat_kind, user_id, bot_id, display_name_snapshot, joined_at
) values
  ('10000000-0000-0000-0000-000000000100', 1, 'human', '10000000-0000-0000-0000-000000000001', null, 'Task 6 Host', now()),
  ('10000000-0000-0000-0000-000000000100', 2, 'bot', null, 'task-6-bot-1', 'Task 6 Bot 1', now()),
  ('10000000-0000-0000-0000-000000000100', 3, 'bot', null, 'task-6-bot-2', 'Task 6 Bot 2', now()),
  ('10000000-0000-0000-0000-000000000100', 4, 'bot', null, 'task-6-bot-3', 'Task 6 Bot 3', now());

insert into public.gameplay_active_controls (
  table_id, lifecycle, host_user_id, turn_timer_seconds, disconnect_grace_seconds,
  version, updated_by
) values (
  '10000000-0000-0000-0000-000000000100',
  'active',
  '10000000-0000-0000-0000-000000000001',
  45,
  60,
  11,
  '10000000-0000-0000-0000-000000000001'
);

insert into public.gameplay_active_seat_controls (
  table_id, seat_number, seat_kind, human_user_id, bot_id, joined_at,
  connected_at, connection, control_owner, reclaim_pending
) values
  ('10000000-0000-0000-0000-000000000100', 1, 'human', '10000000-0000-0000-0000-000000000001', null, now(), now(), 'connected', 'human', false),
  ('10000000-0000-0000-0000-000000000100', 2, 'bot', null, 'task-6-bot-1', now(), null, 'disconnected', 'permanent-bot', false),
  ('10000000-0000-0000-0000-000000000100', 3, 'bot', null, 'task-6-bot-2', now(), null, 'disconnected', 'permanent-bot', false),
  ('10000000-0000-0000-0000-000000000100', 4, 'bot', null, 'task-6-bot-3', now(), null, 'disconnected', 'permanent-bot', false);

insert into public.gameplay_round_states (
  table_id, round_number, phase, version, aggregate, updated_by
) values (
  '10000000-0000-0000-0000-000000000100',
  4,
  'scored',
  21,
  jsonb_build_object('marker', 'scored-round'),
  '10000000-0000-0000-0000-000000000001'
);

insert into public.gameplay_round_invalidations (table_id, version, phase, occurred_at)
values ('10000000-0000-0000-0000-000000000100', 21, 'scored', now());

insert into next_round_fixture (table_id, host_user_id, round_number, round_version, control_version)
values (
  '10000000-0000-0000-0000-000000000100',
  '10000000-0000-0000-0000-000000000001',
  4,
  21,
  11
);

select plan(25);

select has_function(
  'public',
  'start_next_gameplay_round',
  array['uuid', 'uuid', 'text', 'integer', 'integer', 'integer', 'integer', 'jsonb', 'timestamp with time zone'],
  'next-round RPC is installed'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.start_next_gameplay_round(uuid,uuid,text,integer,integer,integer,integer,jsonb,timestamp with time zone)',
    'execute'
  ),
  'service role can execute the next-round RPC'
);

set local role anon;
select throws_ok(
  $$select public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-anon',
    4,
    21,
    11,
    1,
    jsonb_build_object('marker', 'anon'),
    now()
  )$$,
  '42501',
  'permission denied for function start_next_gameplay_round',
  'anon cannot execute the private next-round RPC'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-authenticated',
    4,
    21,
    11,
    1,
    jsonb_build_object('marker', 'authenticated'),
    now()
  )$$,
  '42501',
  'permission denied for function start_next_gameplay_round',
  'authenticated users cannot execute the private next-round RPC'
);
reset role;

set local role service_role;
select is(
  (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-next-round',
    4,
    21,
    11,
    1,
    jsonb_build_object('marker', 'first-committed'),
    '2026-07-29T12:00:00Z'::timestamptz
  )->>'roundNumber')::integer,
  5,
  'service-role transition advances to the next round'
);
reset role;

select is(
  (select round_number from public.gameplay_round_states where table_id = '10000000-0000-0000-0000-000000000100'),
  5,
  'new round number commits atomically'
);
select is(
  (select version from public.gameplay_round_states where table_id = '10000000-0000-0000-0000-000000000100'),
  22,
  'round version increments from 21 to 22 without resetting'
);
select is(
  (select version from public.gameplay_active_controls where table_id = '10000000-0000-0000-0000-000000000100'),
  12,
  'active-control version increments exactly once'
);
select is(
  (select turn_id from public.gameplay_active_controls where table_id = '10000000-0000-0000-0000-000000000100'),
  'round-5:bid:22:1',
  'first bid turn uses the deterministic public turn id'
);
select is(
  (select turn_seat from public.gameplay_active_controls where table_id = '10000000-0000-0000-0000-000000000100'),
  2::smallint,
  'first bid turn maps the public zero-based seat to storage'
);
select is(
  (select count(*) from public.gameplay_round_invalidations where table_id = '10000000-0000-0000-0000-000000000100' and version = 22 and phase = 'bidding'),
  1::bigint,
  'one next-round invalidation is emitted'
);
select is(
  (select aggregate->>'marker' from public.gameplay_round_states where table_id = '10000000-0000-0000-0000-000000000100'),
  'first-committed',
  'initial replacement aggregate is stored'
);

set local role service_role;
select ok(
  (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-next-round',
    4,
    21,
    11,
    1,
    jsonb_build_object('marker', 'retry-must-not-replace'),
    '2026-07-29T12:01:00Z'::timestamptz
  )->>'duplicate')::boolean,
  'identical command retry returns the committed transition'
);
reset role;
select is(
  (select aggregate->>'marker' from public.gameplay_round_states where table_id = '10000000-0000-0000-0000-000000000100'),
  'first-committed',
  'identical retry does not consume its replacement aggregate'
);

set local role service_role;
select throws_ok(
  $$select public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-next-round',
    4,
    21,
    11,
    2,
    jsonb_build_object('marker', 'changed-public-command'),
    now()
  )$$,
  'P0001',
  'Next-round command id was already used with a different payload.',
  'reused command id with changed public identity is rejected'
);
reset role;
select is(
  (select version from public.gameplay_round_states where table_id = '10000000-0000-0000-0000-000000000100'),
  22,
  'changed command reuse cannot mutate round state'
);

set local role service_role;
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-stale-round-number',
    4,
    22,
    12,
    1,
    jsonb_build_object('marker', 'stale-round-number'),
    now()
  )->>'valid')::boolean,
  'stale expected round number is rejected'
);
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-stale-round-version',
    5,
    21,
    12,
    1,
    jsonb_build_object('marker', 'stale-round-version'),
    now()
  )->>'valid')::boolean,
  'stale expected round version is rejected'
);
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-stale-control-version',
    5,
    22,
    11,
    1,
    jsonb_build_object('marker', 'stale-control-version'),
    now()
  )->>'valid')::boolean,
  'stale expected active-control version is rejected'
);
reset role;

update public.gameplay_round_states set phase = 'bidding' where table_id = '10000000-0000-0000-0000-000000000100';
set local role service_role;
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-not-scored', 5, 22, 12, 1, jsonb_build_object('marker', 'not-scored'), now()
  )->>'valid')::boolean,
  'non-scored rounds are rejected'
);
reset role;
update public.gameplay_round_states set phase = 'scored' where table_id = '10000000-0000-0000-0000-000000000100';

update public.gameplay_active_controls set lifecycle = 'paused', paused_at = now() where table_id = '10000000-0000-0000-0000-000000000100';
set local role service_role;
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-paused', 5, 22, 12, 1, jsonb_build_object('marker', 'paused'), now()
  )->>'valid')::boolean,
  'paused active control is rejected'
);
reset role;
update public.gameplay_active_controls set lifecycle = 'active', paused_at = null where table_id = '10000000-0000-0000-0000-000000000100';

update public.gameplay_active_controls
set lifecycle = 'terminated', terminated_at = now(), terminated_by = '10000000-0000-0000-0000-000000000001'
where table_id = '10000000-0000-0000-0000-000000000100';
set local role service_role;
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-terminated', 5, 22, 12, 1, jsonb_build_object('marker', 'terminated'), now()
  )->>'valid')::boolean,
  'terminated active control is rejected'
);
reset role;
update public.gameplay_active_controls
set lifecycle = 'active', terminated_at = null, terminated_by = null
where table_id = '10000000-0000-0000-0000-000000000100';

update public.gameplay_active_controls
set turn_id = 'round-5:bid:22:1', turn_seat = 2, turn_action_kind = 'bid',
    turn_started_at = now(), turn_deadline_at = now() + interval '45 seconds', turn_status = 'running'
where table_id = '10000000-0000-0000-0000-000000000100';
set local role service_role;
select ok(
  not (public.start_next_gameplay_round(
    '10000000-0000-0000-0000-000000000100',
    '10000000-0000-0000-0000-000000000001',
    'task-6-pending-turn', 5, 22, 12, 1, jsonb_build_object('marker', 'pending-turn'), now()
  )->>'valid')::boolean,
  'an existing active turn is rejected'
);
reset role;
update public.gameplay_active_controls
set turn_id = null, turn_seat = null, turn_action_kind = null, turn_started_at = null,
    turn_deadline_at = null, turn_status = null
where table_id = '10000000-0000-0000-0000-000000000100';

select ok(
  not exists (
    select 1
    from public.gameplay_active_control_commands
    where table_id = '10000000-0000-0000-0000-000000000100'
      and concat_ws(' ', payload::text, transition::text, events::text, directives::text)
        ~ '"(aggregate|hand|hands|card|cards|deck|seed|nonce|shuffledDeck|dealAudit)"\\s*:'
  ),
  'active command ledger stores only privacy-safe next-round metadata'
);
select ok(
  not exists (
    select 1
    from public.gameplay_table_events
    where table_id = '10000000-0000-0000-0000-000000000100'
      and details::text ~ '"(aggregate|hand|hands|card|cards|deck|seed|nonce|shuffledDeck|dealAudit)"\\s*:'
  ),
  'event ledger stores only privacy-safe next-round metadata'
);

select * from finish();
rollback;
