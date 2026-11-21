begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Two synthetic users, each with one row in every user table.
insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@example.test');

-- Ids for rows of one user; the derived ones match each table's CHECK constraint.
create function pg_temp.row_id(user_id uuid, what text) returns uuid language sql as $$
  select extensions.uuid_generate_v5('6ba7b811-9dad-11d1-80b4-00c04fd430c8', user_id::text || '/' || what);
$$;

create function pg_temp.seed_rows(uid uuid) returns void language plpgsql as $$
begin
  insert into public.profile (id, user_id, client_updated_at, schema_version)
  values (uid, uid, '2026-11-19 10:00+00', 1);
  insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, client_updated_at, schema_version)
  values (pg_temp.row_id(uid, 'food'), uid, 'Oats', 40, 'g', 150, 5, '2026-11-19 10:00+00', 1);
  insert into public.recipes (id, user_id, name, servings, client_updated_at, schema_version)
  values (pg_temp.row_id(uid, 'recipe'), uid, 'Porridge', 2, '2026-11-19 10:00+00', 1);
  insert into public.recipe_items (id, user_id, recipe_id, food_id, servings, client_updated_at, schema_version)
  values (pg_temp.row_id(uid, 'item'), uid, pg_temp.row_id(uid, 'recipe'), pg_temp.row_id(uid, 'food'), 1, '2026-11-19 10:00+00', 1);
  insert into public.days (id, user_id, date, complete, client_updated_at, schema_version)
  values (extensions.uuid_generate_v5('55e70c90-e7ae-4176-b16f-2c8bfcbdef11', uid::text || '/2026-11-20'), uid, '2026-11-20', true, '2026-11-19 10:00+00', 1);
  insert into public.log_entries (id, user_id, date, meal, food_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
  values (pg_temp.row_id(uid, 'entry'), uid, '2026-11-20', 'breakfast', pg_temp.row_id(uid, 'food'), 1.5, 'Oats', 225, 7.5, 150, 5, '2026-11-20 08:00+00', '2026-11-19 10:00+00', 1);
  insert into public.log_entries (id, user_id, date, meal, recipe_id, servings, name, kcal, protein_g, kcal_per_serving, protein_g_per_serving, logged_at, client_updated_at, schema_version)
  values (pg_temp.row_id(uid, 'recipe entry'), uid, '2026-11-20', 'lunch', pg_temp.row_id(uid, 'recipe'), 1, 'Porridge', 300, 10, 300, 10, '2026-11-20 12:00+00', '2026-11-19 10:00+00', 1);
  insert into public.weights (id, user_id, date, weight_kg, client_updated_at, schema_version)
  values (extensions.uuid_generate_v5('927e1d10-0ca5-4624-ba33-d19a9497f975', uid::text || '/2026-11-20'), uid, '2026-11-20', 82.4, '2026-11-19 10:00+00', 1);
  insert into public.checkins
  select * from jsonb_populate_record(null::public.checkins, jsonb_build_object(
    'id', extensions.uuid_generate_v5('7211687f-5471-4201-a682-62b6fde94019', uid::text || '/2026-11-20'),
    'user_id', uid, 'date', '2026-11-20', 'status', 'updated', 'skip_reason', null,
    'method', 'adaptive', 'previous_maintenance_kcal', 2500, 'raw_maintenance_kcal', 2400,
    'maintenance_kcal', 2450, 'kcal_target', 1900, 'protein_target_g', 147.6,
    'trend_weight_kg', 82.00, 'trend_change_kg', -1.20, 'window_days', 28,
    'complete_days_in_window', 24, 'average_intake_kcal', 2120, 'complete_days_in_week', 6,
    'goal_rate_requested_kg_per_week', -0.50, 'goal_rate_applied_kg_per_week', -0.50,
    'protein_g_per_kg', 1.8, 'calorie_floor_kcal', 1200, 'floor_applied', false,
    'rate_capped', false, 'client_updated_at', '2026-11-20 10:00+00', 'schema_version', 1
  ));
end;
$$;

select pg_temp.seed_rows('a0000000-0000-4000-8000-000000000001');
select pg_temp.seed_rows('b0000000-0000-4000-8000-000000000002');

-- Rows a user owns across every user table.
create function pg_temp.owned(uid uuid) returns int language sql as $$
  select (
    (select count(*) from public.profile where user_id = uid) +
    (select count(*) from public.foods where user_id = uid) +
    (select count(*) from public.recipes where user_id = uid) +
    (select count(*) from public.recipe_items where user_id = uid) +
    (select count(*) from public.days where user_id = uid) +
    (select count(*) from public.log_entries where user_id = uid) +
    (select count(*) from public.weights where user_id = uid) +
    (select count(*) from public.checkins where user_id = uid)
  )::int;
$$;

grant execute on function pg_temp.owned(uuid) to authenticated, anon;

-- Acts as a user whose JWT carries these sign-in methods, as Supabase Auth issues it:
-- amr is a list of { method, timestamp } with the sign-in time in seconds.
create function pg_temp.act_as(user_id uuid, amr jsonb) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'amr', amr)::text,
    true
  );
  set local role authenticated;
$$;

create function pg_temp.password_sign_in(seconds_ago int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'method', 'password',
    'timestamp', extract(epoch from now())::bigint - seconds_ago
  ));
$$;

-- Structure ---------------------------------------------------------------------------------

select has_function('public', 'delete_account', array[]::name[], 'delete_account() exists');
select is_definer('public', 'delete_account', array[]::name[], 'it runs as its owner, to reach auth.users');
select is(pg_temp.owned('a0000000-0000-4000-8000-000000000001'), 9, 'alice starts with 9 rows');

-- Refusals ----------------------------------------------------------------------------------

set local role anon;
select throws_ok($$ select public.delete_account() $$, '42501', null, 'anon cannot call it');
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001', null);
select throws_ok($$ select public.delete_account() $$, '28000', null, 'a session with no sign-in methods is refused');
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001', pg_temp.password_sign_in(301));
select throws_ok($$ select public.delete_account() $$, '28000', null, 'a password sign-in over 5 minutes old is refused');
reset role;

select pg_temp.act_as(
  'a0000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint))
);
select throws_ok($$ select public.delete_account() $$, '28000', null, 'a recent sign-in without a password is refused');
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001', '{"method": "password"}');
select throws_ok($$ select public.delete_account() $$, '28000', null, 'an amr that is not a list is refused');
reset role;

select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'amr', pg_temp.password_sign_in(0))::text, true);
set local role authenticated;
select throws_ok($$ select public.delete_account() $$, '42501', null, 'a JWT with no user is refused');
reset role;

select is(pg_temp.owned('a0000000-0000-4000-8000-000000000001'), 9, 'a refused call deletes nothing');
select is((select count(*)::int from auth.users where id = 'a0000000-0000-4000-8000-000000000001'), 1, 'a refused call keeps the account');

-- Deletion ----------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001', pg_temp.password_sign_in(10));
select lives_ok($$ select public.delete_account() $$, 'a password sign-in in the last 5 minutes deletes the account');
reset role;

select is((select count(*)::int from auth.users where id = 'a0000000-0000-4000-8000-000000000001'), 0, 'the auth user is gone');
select is((select count(*)::int from public.profile where user_id = 'a0000000-0000-4000-8000-000000000001'), 0, 'no profile rows are left');
select is((select count(*)::int from public.foods where user_id = 'a0000000-0000-4000-8000-000000000001'), 0, 'no food rows are left');
select is((select count(*)::int from public.recipes where user_id = 'a0000000-0000-4000-8000-000000000001'), 0, 'no recipe rows are left');
select is((select count(*)::int from public.recipe_items where user_id = 'a0000000-0000-4000-8000-000000000001'), 0, 'no recipe item rows are left');
select is((select count(*)::int from public.days where user_id = 'a0000000-0000-4000-8000-000000000001'), 0, 'no day rows are left');
select is((select count(*)::int from public.log_entries where user_id = 'a0000000-0000-4000-8000-000000000001'), 0, 'no log entry rows are left');
select is(
  (select count(*)::int from public.weights where user_id = 'a0000000-0000-4000-8000-000000000001') +
  (select count(*)::int from public.checkins where user_id = 'a0000000-0000-4000-8000-000000000001'),
  0,
  'no weigh-in or check-in rows are left'
);
select is(pg_temp.owned('b0000000-0000-4000-8000-000000000002'), 9, 'another user keeps every row');

select * from finish();
rollback;
