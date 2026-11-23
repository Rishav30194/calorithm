begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Higher-calorie days on the profile (phase 19): nullable, set together, a weekday mask of at
-- most 6 days, and an extra from 0 to 5000 kcal.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'alice@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select col_type_is('public', 'profile', 'higher_kcal_days', 'smallint', 'profile.higher_kcal_days is smallint');
select col_type_is('public', 'profile', 'higher_kcal_extra', 'integer', 'profile.higher_kcal_extra is integer');
select col_is_null('public', 'profile', 'higher_kcal_days', 'profile.higher_kcal_days is nullable');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.profile (id, user_id, client_updated_at, schema_version)
     values ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11-22 10:00+00', 1) $$,
  'a profile without them, as older versions write, is accepted'
);

select lives_ok(
  $$ update public.profile set higher_kcal_days = 96, higher_kcal_extra = 400, client_updated_at = '2026-11-22 11:00+00'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'Saturday and Sunday at 400 kcal more are accepted'
);

select lives_ok(
  $$ update public.profile set higher_kcal_days = 126, higher_kcal_extra = 5000, client_updated_at = '2026-11-22 12:00+00'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'six days and the largest extra are accepted'
);

select throws_ok(
  $$ update public.profile set higher_kcal_days = 127, client_updated_at = '2026-11-22 13:00+00'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'all seven days are rejected'
);

select throws_ok(
  $$ update public.profile set higher_kcal_days = -1, client_updated_at = '2026-11-22 13:00+00'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a negative mask is rejected'
);

select throws_ok(
  $$ update public.profile set higher_kcal_extra = 5001, client_updated_at = '2026-11-22 13:00+00'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'an extra over 5000 kcal is rejected'
);

select throws_ok(
  $$ update public.profile set higher_kcal_extra = null, client_updated_at = '2026-11-22 13:00+00'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'days without an extra are rejected'
);

select * from finish();
rollback;
