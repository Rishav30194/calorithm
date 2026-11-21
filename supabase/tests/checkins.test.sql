begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- Two synthetic users. Tests act as one of them by setting the JWT claims PostgREST would set.
insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Inserts alice's check-in for 2026-11-20 with valid values, overriding the given columns.
create function pg_temp.insert_checkin(overrides jsonb default '{}') returns void language plpgsql as $$
declare
  base jsonb := jsonb_build_object(
    'id', '8c3ca5ea-8894-5508-a86e-24807ecfb92b',
    'user_id', 'a0000000-0000-4000-8000-000000000001',
    'date', '2026-11-20',
    'status', 'updated',
    'skip_reason', null,
    'method', 'adaptive',
    'previous_maintenance_kcal', 2500,
    'raw_maintenance_kcal', 2400,
    'maintenance_kcal', 2450,
    'kcal_target', 1900,
    'protein_target_g', 147.6,
    'trend_weight_kg', 82.00,
    'trend_change_kg', -1.20,
    'window_days', 28,
    'complete_days_in_window', 24,
    'average_intake_kcal', 2120,
    'complete_days_in_week', 6,
    'goal_rate_requested_kg_per_week', -0.50,
    'goal_rate_applied_kg_per_week', -0.50,
    'protein_g_per_kg', 1.8,
    'calorie_floor_kcal', 1200,
    'floor_applied', false,
    'rate_capped', false,
    'client_updated_at', '2026-11-20 10:00+00',
    'schema_version', 1
  );
begin
  insert into public.checkins
  select * from jsonb_populate_record(null::public.checkins, base || overrides);
end;
$$;

grant execute on function pg_temp.insert_checkin(jsonb) to authenticated;

-- Structure ---------------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.checkins'::regclass),
  'row-level security is enabled'
);

select col_type_is('public', 'checkins', 'protein_target_g', 'numeric(4,1)', 'protein_target_g is numeric(4,1)');
select col_type_is('public', 'checkins', 'trend_weight_kg', 'numeric(5,2)', 'trend_weight_kg is numeric(5,2)');
select col_type_is('public', 'checkins', 'kcal_target', 'integer', 'kcal_target is an integer');

select col_is_unique(
  'public', 'checkins', array['user_id', 'date'],
  'a user has at most one check-in per date'
);

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok($$ select pg_temp.insert_checkin() $$, 'an owner can create a check-in');

select is(
  (select count(*)::int from public.checkins where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b'),
  1,
  'an owner can read their check-in'
);

select throws_ok(
  $$ select pg_temp.insert_checkin(jsonb_build_object(
       'id', '27202772-78bb-5755-a7e3-eba3a6f06b9d',
       'user_id', 'b0000000-0000-4000-8000-000000000002')) $$,
  '42501',
  null,
  'a user cannot create a check-in for someone else'
);

select throws_ok(
  $$ update public.checkins set user_id = 'b0000000-0000-4000-8000-000000000002', client_updated_at = '2026-11-20 10:30+00'
     where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b' $$,
  '42501',
  null,
  'an owner cannot give their check-in to another user'
);

select throws_ok(
  $$ delete from public.checkins $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.checkins where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b'),
  0,
  'another user cannot read the check-in'
);

update public.checkins set kcal_target = 3000, client_updated_at = '2026-12-01 00:00+00'
where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b';

reset role;
select is(
  (select kcal_target from public.checkins where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b'),
  1900,
  'another user cannot change the check-in'
);

set local role anon;
select throws_ok(
  $$ select * from public.checkins $$,
  '42501',
  null,
  'a signed-out request cannot read rows'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.checkins where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b'),
  now(),
  'the server sets updated_at on insert'
);

update public.checkins set kcal_target = 2000, client_updated_at = '2026-11-20 09:00+00'
where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b';
select is(
  (select kcal_target from public.checkins where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b'),
  1900,
  'an update with an older client_updated_at is skipped'
);

update public.checkins set kcal_target = 2000, client_updated_at = '2026-11-20 11:00+00'
where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b';
select is(
  (select kcal_target from public.checkins where id = '8c3ca5ea-8894-5508-a86e-24807ecfb92b'),
  2000,
  'an update with a newer client_updated_at is applied'
);

-- Constraints -------------------------------------------------------------------------------

-- Each case uses alice's 2026-11-27 id, so only the columns under test are wrong.

select lives_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "status": "skipped", "skip_reason": "too_few_complete_days", "method": null, "raw_maintenance_kcal": null, "trend_change_kg": null, "window_days": null, "complete_days_in_window": null, "average_intake_kcal": null, "maintenance_kcal": 2500}') $$,
  'a skipped check-in carrying the previous estimate is accepted'
);

reset role;
delete from public.checkins where id = '154fce82-1848-52c7-8c94-a7a415cb670e';
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "method": "formula", "trend_change_kg": null, "window_days": null, "complete_days_in_window": null, "average_intake_kcal": null}') $$,
  'a formula check-in without window fields is accepted'
);

reset role;
delete from public.checkins where id = '154fce82-1848-52c7-8c94-a7a415cb670e';
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "method": null}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_status_fields"',
  'an updated check-in needs a method'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "skip_reason": "too_few_complete_days"}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_status_fields"',
  'an updated check-in has no skip reason'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "status": "skipped", "skip_reason": "too_few_complete_days", "method": null, "raw_maintenance_kcal": null, "trend_change_kg": null, "window_days": null, "complete_days_in_window": null, "average_intake_kcal": null, "skip_reason": "no_weigh_ins", "maintenance_kcal": 2500}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_skip_reason_values"',
  'only a week with too few complete days is stored as skipped'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "status": "skipped", "skip_reason": "too_few_complete_days", "method": null, "raw_maintenance_kcal": null, "trend_change_kg": null, "window_days": null, "complete_days_in_window": null, "average_intake_kcal": null, "maintenance_kcal": 2500, "previous_maintenance_kcal": null}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_skipped_carries_previous"',
  'a skipped check-in needs a previous estimate'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "status": "skipped", "skip_reason": "too_few_complete_days", "method": null, "raw_maintenance_kcal": null, "trend_change_kg": null, "window_days": null, "complete_days_in_window": null, "average_intake_kcal": null, "maintenance_kcal": 2450}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_skipped_carries_previous"',
  'a skipped check-in carries the previous estimate unchanged'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "raw_maintenance_kcal": null}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_raw_when_updated"',
  'an updated check-in needs a raw estimate'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "window_days": null}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_window_when_adaptive"',
  'an adaptive check-in needs its window'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "method": "formula"}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_window_when_adaptive"',
  'a formula check-in has no window'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "maintenance_kcal": 2349}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_maintenance_step"',
  'the estimate cannot move more than 150 kcal'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "kcal_target": 1199}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_kcal_target_floor"',
  'a target below the calorie floor is rejected'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "kcal_target": 1300, "floor_applied": true}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_floor_applied"',
  'the floor is reported applied only when the target equals it'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "goal_rate_applied_kg_per_week": -0.6}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_goal_rate_applied_range"',
  'the applied rate cannot be faster than the requested one'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "goal_rate_applied_kg_per_week": 0.3}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_goal_rate_applied_range"',
  'the applied rate cannot have the opposite sign'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "trend_weight_kg": 40.00, "protein_target_g": 72.0}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_goal_rate_applied_range"',
  'the applied rate cannot exceed 1% of trend weight a week'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "goal_rate_applied_kg_per_week": -0.40}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_rate_capped"',
  'a lowered rate must be reported as capped'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "rate_capped": true}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_rate_capped"',
  'an unchanged rate is not reported as capped'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "complete_days_in_window": 29}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_complete_days_in_window_range"',
  'complete days cannot exceed the window'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "complete_days_in_week": 8}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_complete_days_in_week_range"',
  'a week has at most 7 complete days'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "trend_weight_kg": 19.99, "goal_rate_requested_kg_per_week": 0, "goal_rate_applied_kg_per_week": 0}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_trend_weight_range"',
  'a trend weight below 20 kg is rejected'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "154fce82-1848-52c7-8c94-a7a415cb670e", "date": "2026-11-27", "schema_version": 0}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_schema_version_positive"',
  'schema_version must be positive'
);

select throws_ok(
  $$ select pg_temp.insert_checkin('{"id": "5f5127f9-3b68-5635-a1f5-950aad1e4c04", "date": "1999-12-31"}') $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_date_range"',
  'a date before 2000 is rejected'
);

select throws_ok(
  $$ select pg_temp.insert_checkin(jsonb_build_object('id', gen_random_uuid(), 'date', '2026-11-27')) $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_id_from_user_and_date"',
  'a check-in id that isn''t derived from the user and date is rejected'
);

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ select pg_temp.insert_checkin(jsonb_build_object(
       'id', '154fce82-1848-52c7-8c94-a7a415cb670e',
       'user_id', 'b0000000-0000-4000-8000-000000000002',
       'date', '2026-11-27')) $$,
  '23514',
  'new row for relation "checkins" violates check constraint "checkins_id_from_user_and_date"',
  'another user cannot claim a check-in id derived from someone else''s user id'
);

select * from finish();
rollback;
