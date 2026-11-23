begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Quick add (phase 16): an entry with neither a food nor a recipe is accepted; both is not.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'alice@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, client_updated_at, schema_version)
values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Oats', 40, 'g', 150, 5, '2026-11-22 10:00+00', 4);
insert into public.recipes (id, user_id, name, servings, client_updated_at, schema_version)
values ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Porridge', 1, '2026-11-22 10:00+00', 1);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11-22', 'dinner', 1, 'Restaurant thali', 850, 30, 850, 30, now(), '2026-11-22 10:00+00', 3) $$,
  'an entry with neither a food nor a recipe is accepted'
);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '2026-11-22', 'breakfast', 'c0000000-0000-4000-8000-000000000001', 1, 'Oats', 150, 5, 150, 5, now(), '2026-11-22 10:00+00', 3) $$,
  'an entry with a food is still accepted'
);

select throws_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, recipe_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '2026-11-22', 'lunch', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 1, 'Both', 150, 5, 150, 5, now(), '2026-11-22 10:00+00', 3) $$,
  '23514', null, 'an entry with both a food and a recipe is rejected'
);

select is(
  (select count(*)::int from pg_constraint where conname = 'log_entries_one_source'),
  0,
  'the old one-source rule is gone'
);

select * from finish();
rollback;
