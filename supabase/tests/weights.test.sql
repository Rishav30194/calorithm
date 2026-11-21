begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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
  (select relrowsecurity from pg_class where oid = 'public.weights'::regclass),
  'row-level security is enabled'
);

select col_type_is('public', 'weights', 'weight_kg', 'numeric(5,2)', 'weight_kg is numeric(5,2)');

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
     values ('798ab06f-16c7-5671-9a7c-c0241face483', 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 82.40, '2026-11-19 10:00+00', 1) $$,
  'an owner can create a weigh-in'
);

select is(
  (select count(*)::int from public.weights where id = '798ab06f-16c7-5671-9a7c-c0241face483'),
  1,
  'an owner can read their weigh-in'
);

select throws_ok(
  $$ insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
     values ('37b61985-9d9d-5b31-81f6-955febbafbc6', 'b0000000-0000-4000-8000-000000000002', '2026-11-20', 70, now(), 1) $$,
  '42501',
  null,
  'a user cannot create a weigh-in for someone else'
);

select throws_ok(
  $$ delete from public.weights $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.weights where id = '798ab06f-16c7-5671-9a7c-c0241face483'),
  0,
  'another user cannot read the weigh-in'
);

update public.weights set weight_kg = 50, client_updated_at = '2026-12-01 00:00+00' where id = '798ab06f-16c7-5671-9a7c-c0241face483';

reset role;
select is(
  (select weight_kg from public.weights where id = '798ab06f-16c7-5671-9a7c-c0241face483'),
  82.40,
  'another user cannot change the weigh-in'
);

set local role anon;
select throws_ok(
  $$ select * from public.weights $$,
  '42501',
  null,
  'a signed-out request cannot read rows'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.weights where id = '798ab06f-16c7-5671-9a7c-c0241face483'),
  now(),
  'the server sets updated_at on insert'
);

update public.weights set weight_kg = 81.00, client_updated_at = '2026-11-19 09:00+00' where id = '798ab06f-16c7-5671-9a7c-c0241face483';
select is(
  (select weight_kg from public.weights where id = '798ab06f-16c7-5671-9a7c-c0241face483'),
  82.40,
  'an update with an older client_updated_at is skipped'
);

-- A second weigh-in on the same day writes the same row, so it replaces the first.
update public.weights set weight_kg = 82.10, client_updated_at = '2026-11-19 11:00+00' where id = '798ab06f-16c7-5671-9a7c-c0241face483';
select is(
  (select weight_kg from public.weights where id = '798ab06f-16c7-5671-9a7c-c0241face483'),
  82.10,
  'an update with a newer client_updated_at is applied'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$ update public.weights set schema_version = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'schema_version must be positive'
);

select throws_ok(
  $$ update public.weights set weight_kg = 19.99, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  'new row for relation "weights" violates check constraint "weights_weight_kg_range"',
  'a weight below 20 kg is rejected'
);

select throws_ok(
  $$ update public.weights set weight_kg = 400.01, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  'new row for relation "weights" violates check constraint "weights_weight_kg_range"',
  'a weight above 400 kg is rejected'
);

select throws_ok(
  $$ update public.weights set weight_kg = null, client_updated_at = '2026-11-20 00:00+00' $$,
  '23502',
  null,
  'a weight is required'
);

select throws_ok(
  $$ insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '2026-11-21', 80, now(), 1) $$,
  '23514',
  null,
  'a weigh-in id that isn''t derived from the user and date is rejected'
);

select throws_ok(
  $$ insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
     values ('798ab06f-16c7-5671-9a7c-c0241face483', 'a0000000-0000-4000-8000-000000000001', '2026-11-21', 80, now(), 1) $$,
  '23514',
  null,
  'a weigh-in id derived from a different date is rejected'
);

select throws_ok(
  $$ insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
     values ('7ff921c7-8be7-5383-82d8-4d6cda747899', 'a0000000-0000-4000-8000-000000000001', '1999-12-31', 80, now(), 1) $$,
  '23514',
  'new row for relation "weights" violates check constraint "weights_date_range"',
  'a date before 2000 is rejected'
);

select col_is_unique(
  'public', 'weights', array['user_id', 'date'],
  'a user has at most one weigh-in per date'
);

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
     values ('4e6ef8b2-2549-5ac9-9182-88f5eb23ec9e', 'b0000000-0000-4000-8000-000000000002', '2026-11-21', 70, now(), 1) $$,
  '23514',
  null,
  'another user cannot claim a weigh-in id derived from someone else''s user id'
);

select * from finish();
rollback;
