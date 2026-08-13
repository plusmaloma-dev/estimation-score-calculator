begin;

create extension if not exists pgtap;

select plan(11);

select has_function(
  'public',
  'initialize_gameplay_auction_round_state',
  array['uuid', 'uuid', 'integer', 'text', 'jsonb', 'timestamp with time zone'],
  'auction initializer wrapper is installed'
);

select has_function(
  'public',
  'commit_gameplay_round_auction_command',
  array['uuid', 'uuid', 'smallint', 'text', 'text', 'integer', 'integer', 'integer', 'jsonb', 'boolean', 'jsonb', 'jsonb', 'jsonb', 'text', 'timestamp with time zone'],
  'auction command wrapper is installed'
);

select has_function(
  'public',
  'start_next_gameplay_auction_round',
  array['uuid', 'uuid', 'text', 'integer', 'integer', 'integer', 'integer', 'jsonb', 'timestamp with time zone'],
  'auction next-round wrapper is installed'
);

select ok(
  has_function_privilege('service_role', 'public.initialize_gameplay_auction_round_state(uuid,uuid,integer,text,jsonb,timestamp with time zone)', 'execute'),
  'service role can initialize an auction round'
);

select ok(
  has_function_privilege('service_role', 'public.commit_gameplay_round_auction_command(uuid,uuid,smallint,text,text,integer,integer,integer,jsonb,boolean,jsonb,jsonb,jsonb,text,timestamp with time zone)', 'execute'),
  'service role can commit an auction command'
);

select ok(
  has_function_privilege('service_role', 'public.start_next_gameplay_auction_round(uuid,uuid,text,integer,integer,integer,integer,jsonb,timestamp with time zone)', 'execute'),
  'service role can start the next auction round'
);

select ok(
  not has_function_privilege('anon', 'public.initialize_gameplay_auction_round_state(uuid,uuid,integer,text,jsonb,timestamp with time zone)', 'execute'),
  'anon cannot initialize an auction round'
);

select ok(
  not has_function_privilege('anon', 'public.commit_gameplay_round_auction_command(uuid,uuid,smallint,text,text,integer,integer,integer,jsonb,boolean,jsonb,jsonb,jsonb,text,timestamp with time zone)', 'execute'),
  'anon cannot commit an auction command'
);

select ok(
  not has_function_privilege('anon', 'public.start_next_gameplay_auction_round(uuid,uuid,text,integer,integer,integer,integer,jsonb,timestamp with time zone)', 'execute'),
  'anon cannot start the next auction round'
);

select is(
  (public.initialize_gameplay_auction_round_state(
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    1::smallint,
    'bidding',
    '{}'::jsonb,
    now()
  )->>'valid')::boolean,
  false,
  'auction initializer rejects the ambiguous legacy bidding phase'
);

select is(
  (public.commit_gameplay_round_auction_command(
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    1::smallint,
    'invalid-auction-command',
    'INVALID',
    1,
    1,
    2,
    '{}'::jsonb,
    false,
    '[]'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    'auction',
    now()
  )->>'valid')::boolean,
  false,
  'auction command wrapper rejects unsupported command types before touching state'
);

select * from finish();
rollback;
