begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- The food's serving copied onto each log entry (phase 14): nullable, set together, and in the
-- same ranges as foods.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'alice@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select col_type_is('public', 'log_entries', 'serving_size', 'numeric(7,2)', 'log_entries.serving_size is numeric(7,2)');
select col_is_null('public', 'log_entries', 'serving_size', 'log_entries.serving_size is nullable');
select col_is_null('public', 'log_entries', 'serving_unit', 'log_entries.serving_unit is nullable');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, client_updated_at, schema_version)
values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Chicken breast', 100, 'g', 165, 31, '2026-11-22 10:00+00', 4);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, serving_size, serving_unit, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11-22', 'lunch', 'c0000000-0000-4000-8000-000000000001', 0.7, 'Chicken breast', 116, 21.7, 165, 31, 100, 'g', now(), '2026-11-22 10:00+00', 3) $$,
  'an entry keeps the serving it was logged with'
);

select lives_ok(
  $$ insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
     values ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '2026-11-22', 'lunch', 'c0000000-0000-4000-8000-000000000001', 1, 'Chicken breast', 165, 31, 165, 31, now(), '2026-11-22 10:00+00', 2) $$,
  'an entry without a serving, as older versions write, is accepted'
);

select throws_ok(
  $$ update public.log_entries set serving_unit = null, client_updated_at = '2026-11-23 00:00+00'
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a serving size without a unit is rejected'
);

select throws_ok(
  $$ update public.log_entries set serving_size = 0, client_updated_at = '2026-11-23 00:00+00'
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a serving size of 0 is rejected'
);

select throws_ok(
  $$ update public.log_entries set serving_unit = repeat('x', 21), client_updated_at = '2026-11-23 00:00+00'
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a serving unit over 20 characters is rejected'
);

select * from finish();
rollback;
