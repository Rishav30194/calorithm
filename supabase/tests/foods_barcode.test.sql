begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- A packaged food's barcode (phase 11): nullable, digits only, in the app's stored form.
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000001', 'alice@example.test');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select col_type_is('public', 'foods', 'barcode', 'text', 'foods.barcode is text');
select col_is_null('public', 'foods', 'barcode', 'foods.barcode is nullable');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.foods (id, user_id, name, serving_size, serving_unit, kcal, protein_g, carbs_g, fat_g, barcode, client_updated_at, schema_version)
     values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Paneer', 100, 'g', 265, 18.3, 1.2, 20.8, '0000000000017', '2026-11-22 10:00+00', 4),
            ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Paneer, small pack', 50, 'g', 133, 9.2, 0.6, 10.4, '0000000000017', '2026-11-22 10:00+00', 4) $$,
  'two foods can share a 13-digit barcode'
);

select lives_ok(
  $$ update public.foods set barcode = '00000017', client_updated_at = '2026-11-23 00:00+00'
     where id = 'c0000000-0000-4000-8000-000000000001' $$,
  'an 8-digit barcode is accepted'
);

select throws_ok(
  $$ update public.foods set barcode = '000000000017', client_updated_at = '2026-11-24 00:00+00' $$,
  '23514', null, 'a 12-digit barcode is rejected; the app stores its 13-digit form'
);

select throws_ok(
  $$ update public.foods set barcode = '', client_updated_at = '2026-11-24 00:00+00' $$,
  '23514', null, 'an empty barcode is rejected'
);

select throws_ok(
  $$ update public.foods set barcode = '000000000001x', client_updated_at = '2026-11-24 00:00+00' $$,
  '23514', null, 'a barcode with a letter is rejected'
);

select * from finish();
rollback;
