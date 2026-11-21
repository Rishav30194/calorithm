begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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
  (select relrowsecurity from pg_class where oid = 'public.days'::regclass),
  'row-level security is enabled'
);

-- Owner access ------------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.days (id, user_id, date, complete, client_updated_at, schema_version)
     values ('a7299a3c-0c31-50d1-b33c-727ad2d15782', 'a0000000-0000-4000-8000-000000000001', '2026-11-20', false, '2026-11-19 10:00+00', 1) $$,
  'an owner can create a days row'
);

select is(
  (select count(*)::int from public.days where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782'),
  1,
  'an owner can read their days row'
);

select throws_ok(
  $$ insert into public.days (id, user_id, date, complete, client_updated_at, schema_version)
     values ('12de9922-5eb9-5831-a48b-ed52fabb6e22', 'b0000000-0000-4000-8000-000000000002', '2026-11-20', false, now(), 1) $$,
  '42501',
  null,
  'a user cannot create a days row for someone else'
);

select throws_ok(
  $$ delete from public.days $$,
  '42501',
  null,
  'a user cannot hard delete; rows are soft deleted'
);

-- Other users and signed-out requests -------------------------------------------------------

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.days where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782'),
  0,
  'another user cannot read the row'
);

update public.days set complete = true, client_updated_at = '2026-12-01 00:00+00' where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782';

reset role;
select is(
  (select complete::text from public.days where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782'),
  'false',
  'another user cannot change the row'
);

set local role anon;
select throws_ok(
  $$ select * from public.days $$,
  '42501',
  null,
  'a signed-out request cannot read rows'
);
reset role;

-- Sync triggers -----------------------------------------------------------------------------

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select is(
  (select updated_at from public.days where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782'),
  now(),
  'the server sets updated_at on insert'
);

update public.days set complete = true, client_updated_at = '2026-11-19 09:00+00' where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782';
select is(
  (select complete::text from public.days where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782'),
  'false',
  'an update with an older client_updated_at is skipped'
);

update public.days set complete = true, client_updated_at = '2026-11-19 11:00+00' where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782';
select is(
  (select complete::text from public.days where id = 'a7299a3c-0c31-50d1-b33c-727ad2d15782'),
  'true',
  'an update with a newer client_updated_at is applied'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$ update public.days set schema_version = 0, client_updated_at = '2026-11-20 00:00+00' $$,
  '23514',
  null,
  'schema_version must be positive'
);

select throws_ok(
  $$ insert into public.days (id, user_id, date, client_updated_at, schema_version)
     values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '2026-11-21', now(), 1) $$,
  '23514',
  null,
  'a day id that isn''t derived from the user and date is rejected'
);

select throws_ok(
  $$ insert into public.days (id, user_id, date, client_updated_at, schema_version)
     values ('a7299a3c-0c31-50d1-b33c-727ad2d15782', 'a0000000-0000-4000-8000-000000000001', '2026-11-21', now(), 1) $$,
  '23514',
  null,
  'a day id derived from a different date is rejected'
);

select throws_ok(
  $$ insert into public.days (id, user_id, date, client_updated_at, schema_version)
     values (
       extensions.uuid_generate_v5('55e70c90-e7ae-4176-b16f-2c8bfcbdef11', 'a0000000-0000-4000-8000-000000000001/1999-12-31'),
       'a0000000-0000-4000-8000-000000000001', '1999-12-31', now(), 1
     ) $$,
  '23514',
  'new row for relation "days" violates check constraint "days_date_range"',
  'a date before 2000 is rejected'
);

select col_is_unique(
  'public', 'days', array['user_id', 'date'],
  'a user has at most one row per date'
);

select pg_temp.act_as('b0000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ insert into public.days (id, user_id, date, client_updated_at, schema_version)
     values ('da801a1e-e5fe-5cb2-b36f-6347ac238af7', 'b0000000-0000-4000-8000-000000000002', '2026-11-21', now(), 1) $$,
  '23514',
  null,
  'another user cannot claim a day id derived from someone else''s user id'
);

select * from finish();
rollback;
