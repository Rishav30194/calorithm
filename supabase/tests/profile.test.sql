begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
  (select relrowsecurity from pg_class where oid = 'public.profile'::regclass),
  'row-level security is enabled'
);

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.profile (id, user_id, height_cm, client_updated_at, schema_version)
     values ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
             180, '2026-11-19 10:00+00', 1) $$,
  'an owner can create their profile'
);

select is(
  (select count(*)::int from public.profile),
  1,
  'an owner can read their profile'
);

select throws_ok(
  $$ insert into public.profile (id, user_id, client_updated_at, schema_version)
     values ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
             now(), 1) $$,
  '42501',
  null,
  'a user cannot create a profile for someone else'
);

select throws_ok(
  $$ delete from public.profile $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.profile),
  0,
  'another user cannot read the profile'
);

update public.profile set height_cm = 150, client_updated_at = '2026-12-01 00:00+00';

reset role;
select is(
  (select height_cm from public.profile where id = 'a0000000-0000-4000-8000-000000000001'),
  180.0,
  'another user cannot change the profile'
);

set local role anon;
select throws_ok(
  $$ select * from public.profile $$,
  '42501',
  null,
  'a signed-out request cannot read profiles'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.profile),
  now(),
  'the server sets updated_at on insert'
);

update public.profile set height_cm = 181, client_updated_at = '2026-11-19 09:00+00';
select is(
  (select height_cm from public.profile),
  180.0,
  'an update with an older client_updated_at is skipped'
);

update public.profile set height_cm = 182, client_updated_at = '2026-11-19 11:00+00';
select is(
  (select height_cm from public.profile),
  182.0,
  'an update with a newer client_updated_at is applied'
);

update public.profile
set height_cm = 183, client_updated_at = '2026-11-19 12:00+00', updated_at = '2000-01-01 00:00+00';
select is(
  (select updated_at from public.profile),
  now(),
  'the server overrides a client-sent updated_at'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$ update public.profile set height_cm = 50, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'height outside 100 to 250 cm is rejected'
);

select throws_ok(
  $$ update public.profile set protein_g_per_kg = 3.0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'protein outside 1.6 to 2.2 g per kg is rejected'
);

select throws_ok(
  $$ update public.profile set calorie_floor_kcal = 500, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'a calorie floor under 1,000 kcal is rejected'
);

select throws_ok(
  $$ update public.profile set sex = 'other', client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'an unknown sex value is rejected'
);

select throws_ok(
  $$ update public.profile
     set birth_date = current_date + 1, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'a birth date in the future is rejected'
);

select throws_ok(
  $$ update public.profile set schema_version = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'schema_version must be positive'
);

reset role;
select throws_ok(
  $$ insert into public.profile (id, user_id, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
             now(), 1) $$,
  '23514',
  null,
  'a profile id must equal its user id'
);

select * from finish();
rollback;
