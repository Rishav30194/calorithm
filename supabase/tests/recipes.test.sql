begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Two synthetic users. Tests act as one of them by setting the JWT claims PostgREST would set.
insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Structure ---------------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.recipes'::regclass),
  'row-level security is enabled'
);

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.recipes (id, user_id, name, servings, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Chili', 4, '2026-11-19 10:00+00', 1) $$,
  'an owner can create a recipe row'
);

select is(
  (select count(*)::int from public.recipes where id = 'c0000000-0000-4000-8000-000000000001'),
  1,
  'an owner can read their recipe row'
);

select throws_ok(
  $$ insert into public.recipes (id, user_id, name, servings, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Chili', 4, now(), 1) $$,
  '42501',
  null,
  'a user cannot create a recipe row for someone else'
);

select throws_ok(
  $$ delete from public.recipes $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.recipes where id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'another user cannot read the row'
);

update public.recipes set servings = 5, client_updated_at = '2026-12-01 00:00+00' where id = 'c0000000-0000-4000-8000-000000000001';

reset role;
select is(
  (select servings::text from public.recipes where id = 'c0000000-0000-4000-8000-000000000001'),
  '4.00',
  'another user cannot change the row'
);

set local role anon;
select throws_ok(
  $$ select * from public.recipes $$,
  '42501',
  null,
  'a signed-out request cannot read rows'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.recipes where id = 'c0000000-0000-4000-8000-000000000001'),
  now(),
  'the server sets updated_at on insert'
);

update public.recipes set servings = 5, client_updated_at = '2026-11-19 09:00+00' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select servings::text from public.recipes where id = 'c0000000-0000-4000-8000-000000000001'),
  '4.00',
  'an update with an older client_updated_at is skipped'
);

update public.recipes set servings = 6, client_updated_at = '2026-11-19 11:00+00' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select servings::text from public.recipes where id = 'c0000000-0000-4000-8000-000000000001'),
  '6.00',
  'an update with a newer client_updated_at is applied'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$ update public.recipes set servings = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'zero servings is rejected'
);

select throws_ok(
  $$ update public.recipes set servings = -1, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'negative servings is rejected'
);

select throws_ok(
  $$ update public.recipes set name = '', client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'an empty name is rejected'
);

select throws_ok(
  $$ update public.recipes set schema_version = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'schema_version must be positive'
);

select * from finish();
rollback;
