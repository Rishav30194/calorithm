begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- The hosted project grants nothing on new tables, so each privilege here comes from a
-- migration, which revokes everything first so local and hosted defaults can't differ.
-- Row-level security then limits signed-in users to their own rows. Deletes are soft,
-- through deleted_at, so no role may delete.

select table_privs_are('public', 'app_config', 'anon', array['SELECT'],
  'a signed-out request can only read app_config');
select table_privs_are('public', 'app_config', 'authenticated', array['SELECT'],
  'a signed-in user can only read app_config');

select table_privs_are('public', t, 'anon', array[]::text[],
  format('a signed-out request cannot read or write %s', t))
from unnest(array['profile', 'foods', 'recipes', 'recipe_items', 'days', 'log_entries', 'weights',
  'checkins']) as t;

select table_privs_are('public', t, 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE'],
  format('a signed-in user can read, add, and update %s, but not delete', t))
from unnest(array['profile', 'foods', 'recipes', 'recipe_items', 'days', 'log_entries', 'weights',
  'checkins']) as t;

select * from finish();
rollback;
