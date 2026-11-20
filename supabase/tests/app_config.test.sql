begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_config'::regclass),
  'row-level security is enabled'
);

set local role anon;
select is(
  (select min_app_version from public.app_config),
  '0.0.0',
  'a signed-out request can read the minimum app version'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ update public.app_config set min_app_version = '9.9.9' $$,
  '42501',
  null,
  'a signed-in user cannot change the app config'
);

select throws_ok(
  $$ insert into public.app_config (id, min_app_version) values (1, '9.9.9') $$,
  '42501',
  null,
  'a signed-in user cannot insert app config'
);

reset role;

select throws_ok(
  $$ insert into public.app_config (id, min_app_version) values (2, '1.0.0') $$,
  '23514',
  null,
  'the table holds a single row'
);

select throws_ok(
  $$ update public.app_config set min_app_version = '1.0' $$,
  '23514',
  null,
  'the minimum app version must be MAJOR.MINOR.PATCH'
);

select * from finish();
rollback;
