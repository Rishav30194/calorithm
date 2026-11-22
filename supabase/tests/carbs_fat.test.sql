begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Carbs and fat on foods and log entries (decision 0025): nullable, because rows saved before
-- them have no values, with one decimal place and the same ranges as protein.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'alice@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select col_type_is('public', 'foods', 'carbs_g', 'numeric(6,1)', 'foods.carbs_g is numeric(6,1)');
select col_type_is('public', 'foods', 'fat_g', 'numeric(6,1)', 'foods.fat_g is numeric(6,1)');
select col_type_is('public', 'log_entries', 'carbs_g', 'numeric(7,1)', 'log_entries.carbs_g is numeric(7,1)');
select col_type_is('public', 'log_entries', 'fat_g', 'numeric(7,1)', 'log_entries.fat_g is numeric(7,1)');
select col_type_is('public', 'log_entries', 'carbs_g_per_serving', 'numeric(8,3)',
  'log_entries.carbs_g_per_serving is numeric(8,3)');
select col_type_is('public', 'log_entries', 'fat_g_per_serving', 'numeric(8,3)',
  'log_entries.fat_g_per_serving is numeric(8,3)');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Old oats', 40, 'g', 150, 5.0, '2026-11-19 10:00+00', 1) $$,
  'a food saved without carbs and fat is accepted, as version 1 apps send it'
);

select lives_ok(
  $$ insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, carbs_g, fat_g, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Paneer', 100, 'g', 265, 18.3, 1.2, 20.8, '2026-11-19 10:00+00', 2) $$,
  'a food with carbs and fat is accepted'
);

select throws_ok(
  $$ update public.foods set carbs_g = -0.1, client_updated_at = '2026-11-20 00:00+00' where id = 'c0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'negative carbs on a food are rejected'
);

select throws_ok(
  $$ update public.foods set fat_g = 1000.1, client_updated_at = '2026-11-20 00:00+00' where id = 'c0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'fat over 1000 g on a food is rejected'
);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 'breakfast', 'c0000000-0000-4000-8000-000000000001', 1, 'Old oats', 150, 5.0, 150, 5.0, now(), '2026-11-19 10:00+00', 1) $$,
  'a log entry saved without carbs and fat is accepted'
);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, carbs_g, fat_g, kcal_per_serving, protein_g_per_serving, carbs_g_per_serving, fat_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '2026-11-20', 'lunch', 'c0000000-0000-4000-8000-000000000002', 1.5, 'Paneer', 398, 27.5, 1.8, 31.2, 265, 18.3, 1.2, 20.8, now(), '2026-11-19 10:00+00', 2) $$,
  'a log entry with carbs and fat is accepted'
);

select throws_ok(
  $$ update public.log_entries set carbs_g = 10000.1, client_updated_at = '2026-11-20 00:00+00' where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'carbs over 10000 g on a log entry are rejected'
);

select throws_ok(
  $$ update public.log_entries set fat_g = -1, client_updated_at = '2026-11-20 00:00+00' where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'negative fat on a log entry is rejected'
);

select throws_ok(
  $$ update public.log_entries set carbs_g_per_serving = -1, client_updated_at = '2026-11-20 00:00+00' where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'negative carbs per serving are rejected'
);

select throws_ok(
  $$ update public.log_entries set fat_g_per_serving = 10000.001, client_updated_at = '2026-11-20 00:00+00' where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'fat per serving over 10000 g is rejected'
);

select * from finish();
rollback;
