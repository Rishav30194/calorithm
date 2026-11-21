begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Two synthetic users. Tests act as one of them by setting the JWT claims PostgREST would set.
insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Parent rows for both users, written as the table owner.
insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, client_updated_at, schema_version)
values
  ('f0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'Oats', 40, 'g', 150, 5.0, now(), 1),
  ('f0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', 'Rice', 75, 'g', 270, 5.3, now(), 1);
insert into public.recipes (id, user_id, name, servings, client_updated_at, schema_version)
values
  ('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'Porridge', 2, now(), 1),
  ('e0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', 'Rice bowl', 2, now(), 1);

-- Structure ---------------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.log_entries'::regclass),
  'row-level security is enabled'
);

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 'breakfast', 'f0000000-0000-4000-8000-00000000000a', 1.5, 'Oats', 225, 7.5, 150, 5, '2026-11-20 08:00+00', '2026-11-19 10:00+00', 1) $$,
  'an owner can create a log entry row'
);

select is(
  (select count(*)::int from public.log_entries where id = 'c0000000-0000-4000-8000-000000000001'),
  1,
  'an owner can read their log entry row'
);

select throws_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '2026-11-20', 'breakfast', 'f0000000-0000-4000-8000-00000000000a', 1.5, 'Oats', 225, 7.5, 150, 5, '2026-11-20 08:00+00', now(), 1) $$,
  '42501',
  null,
  'a user cannot create a log entry row for someone else'
);

select throws_ok(
  $$ delete from public.log_entries $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.log_entries where id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'another user cannot read the row'
);

update public.log_entries set kcal = 300, client_updated_at = '2026-12-01 00:00+00' where id = 'c0000000-0000-4000-8000-000000000001';

reset role;
select is(
  (select kcal::text from public.log_entries where id = 'c0000000-0000-4000-8000-000000000001'),
  '225',
  'another user cannot change the row'
);

set local role anon;
select throws_ok(
  $$ select * from public.log_entries $$,
  '42501',
  null,
  'a signed-out request cannot read rows'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.log_entries where id = 'c0000000-0000-4000-8000-000000000001'),
  now(),
  'the server sets updated_at on insert'
);

update public.log_entries set kcal = 300, client_updated_at = '2026-11-19 09:00+00' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select kcal::text from public.log_entries where id = 'c0000000-0000-4000-8000-000000000001'),
  '225',
  'an update with an older client_updated_at is skipped'
);

update public.log_entries set kcal = 310, client_updated_at = '2026-11-19 11:00+00' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select kcal::text from public.log_entries where id = 'c0000000-0000-4000-8000-000000000001'),
  '310',
  'an update with a newer client_updated_at is applied'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$ update public.log_entries set kcal = -1, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'negative kcal is rejected'
);

select throws_ok(
  $$ update public.log_entries set protein_g = -1, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'negative protein is rejected'
);

select throws_ok(
  $$ update public.log_entries set servings = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'zero servings is rejected'
);

select throws_ok(
  $$ update public.log_entries set meal = 'brunch', client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'an unknown meal is rejected'
);

select throws_ok(
  $$ update public.log_entries set name = '', client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'an empty name is rejected'
);

select throws_ok(
  $$ update public.log_entries set recipe_id = 'e0000000-0000-4000-8000-00000000000a', client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'an entry with both a food and a recipe is rejected'
);

select throws_ok(
  $$ update public.log_entries set food_id = null, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'an entry with neither a food nor a recipe is rejected'
);

select throws_ok(
  $$ update public.log_entries set date = '1999-12-31', client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'a date before 2000 is rejected'
);

select throws_ok(
  $$ update public.log_entries set kcal_per_serving = -1, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'a negative kcal per serving is rejected'
);

select throws_ok(
  $$ update public.log_entries set protein_g_per_serving = -1, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'a negative protein per serving is rejected'
);

select throws_ok(
  $$ update public.log_entries set schema_version = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'schema_version must be positive'
);

select throws_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 'lunch', 'f0000000-0000-4000-8000-00000000000b', 1, 'Rice', 270, 5.3, 270, 5.3, now(), now(), 1) $$,
  '23503',
  null,
  'an entry cannot log another user''s food'
);

select throws_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, recipe_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 'lunch', 'e0000000-0000-4000-8000-00000000000b', 1, 'Rice bowl', 400, 9.0, 400, 9, now(), now(), 1) $$,
  '23503',
  null,
  'an entry cannot log another user''s recipe'
);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, recipe_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 'dinner', 'e0000000-0000-4000-8000-00000000000a', 0.5, 'Porridge', 150, 5.0, 300, 10, now(), now(), 1) $$,
  'an entry can log the owner''s recipe'
);

select * from finish();
rollback;
