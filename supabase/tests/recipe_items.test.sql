begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
  (select relrowsecurity from pg_class where oid = 'public.recipe_items'::regclass),
  'row-level security is enabled'
);

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.recipe_items (id, user_id, recipe_id, food_id, servings, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000a', 1, '2026-11-19 10:00+00', 1) $$,
  'an owner can create a recipe item row'
);

select is(
  (select count(*)::int from public.recipe_items where id = 'c0000000-0000-4000-8000-000000000001'),
  1,
  'an owner can read their recipe item row'
);

select throws_ok(
  $$ insert into public.recipe_items (id, user_id, recipe_id, food_id, servings, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000a', 1, now(), 1) $$,
  '42501',
  null,
  'a user cannot create a recipe item row for someone else'
);

select throws_ok(
  $$ delete from public.recipe_items $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.recipe_items where id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'another user cannot read the row'
);

update public.recipe_items set servings = 2, client_updated_at = '2026-12-01 00:00+00' where id = 'c0000000-0000-4000-8000-000000000001';

reset role;
select is(
  (select servings::text from public.recipe_items where id = 'c0000000-0000-4000-8000-000000000001'),
  '1.00',
  'another user cannot change the row'
);

set local role anon;
select throws_ok(
  $$ select * from public.recipe_items $$,
  '42501',
  null,
  'a signed-out request cannot read rows'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.recipe_items where id = 'c0000000-0000-4000-8000-000000000001'),
  now(),
  'the server sets updated_at on insert'
);

update public.recipe_items set servings = 2, client_updated_at = '2026-11-19 09:00+00' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select servings::text from public.recipe_items where id = 'c0000000-0000-4000-8000-000000000001'),
  '1.00',
  'an update with an older client_updated_at is skipped'
);

update public.recipe_items set servings = 3, client_updated_at = '2026-11-19 11:00+00' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select servings::text from public.recipe_items where id = 'c0000000-0000-4000-8000-000000000001'),
  '3.00',
  'an update with a newer client_updated_at is applied'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$ update public.recipe_items set servings = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'zero servings is rejected'
);

select throws_ok(
  $$ update public.recipe_items set servings = -0.5, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'negative servings is rejected'
);

select throws_ok(
  $$ update public.recipe_items set schema_version = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'schema_version must be positive'
);

select throws_ok(
  $$ insert into public.recipe_items (id, user_id, recipe_id, food_id, servings, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000b', 1, now(), 1) $$,
  '23503',
  null,
  'a recipe item cannot use another user''s food'
);

select throws_ok(
  $$ insert into public.recipe_items (id, user_id, recipe_id, food_id, servings, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-00000000000a', 1, now(), 1) $$,
  '23503',
  null,
  'a recipe item cannot join another user''s recipe'
);

select * from finish();
rollback;
