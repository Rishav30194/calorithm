begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- A food copied from the built-in list keeps that item's id (phase 10, decision 0027).
-- Nullable: foods typed in, or saved before this, have none.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'alice@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select col_type_is('public', 'foods', 'catalog_id', 'text', 'foods.catalog_id is text');
select col_is_null('public', 'foods', 'catalog_id', 'foods.catalog_id is nullable');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, carbs_g, fat_g, catalog_id, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Turmeric', 1, 'tsp (3 g)', 9, 0.3, 2, 0.1, 'turmeric', '2026-11-22 10:00+00', 3) $$,
  'a food copied from the built-in list keeps its catalog id'
);

select throws_ok(
  $$ update public.foods set catalog_id = '', client_updated_at = '2026-11-23 00:00+00' $$,
  '23514', null, 'an empty catalog id is rejected'
);

select throws_ok(
  $$ update public.foods set catalog_id = repeat('x', 61), client_updated_at = '2026-11-23 00:00+00' $$,
  '23514', null, 'a catalog id over 60 characters is rejected'
);

select * from finish();
rollback;
