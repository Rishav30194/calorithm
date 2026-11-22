import { execFileSync } from 'node:child_process'

import { deleteMeUser } from './helpers'

// Local Supabase's database container, named after project_id in supabase/config.toml. Only
// the local stack is ever touched: the test signs up no one, and the hosted project is never
// reachable from here.
const container = 'supabase_db_calorithm'

// Values go in as psql variables (:'name' quotes them), never spliced into the SQL text.
const runSql = (sql: string, variables: Record<string, string>): string =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-tA',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] },
  ).trim()

// Rows a user owns on the server, across every user table, plus their auth user.
export const serverRowsOf = (userId: string): number =>
  Number(
    runSql(
      `
      select
        (select count(*) from auth.users where id = :'id') +
        (select count(*) from public.profile where user_id = :'id') +
        (select count(*) from public.foods where user_id = :'id') +
        (select count(*) from public.recipes where user_id = :'id') +
        (select count(*) from public.recipe_items where user_id = :'id') +
        (select count(*) from public.days where user_id = :'id') +
        (select count(*) from public.log_entries where user_id = :'id') +
        (select count(*) from public.weights where user_id = :'id') +
        (select count(*) from public.checkins where user_id = :'id');
      `,
      { id: userId },
    ),
  )

// Puts back the user the account deletion test deletes, as supabase/seed.sql creates it. Sign-ups
// are off, so there's no other way to get the account back between runs.
export const restoreDeleteMeUser = (): void => {
  const { id, email, password } = deleteMeUser
  void runSql(
    `
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000', :'id', 'authenticated', 'authenticated',
      :'email', extensions.crypt(:'password', extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    )
    select
      gen_random_uuid(), u.id, u.id::text, 'email',
      json_build_object('sub', u.id, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    from auth.users u
    where u.id = :'id'
      and not exists (select 1 from auth.identities i where i.user_id = u.id);
    `,
    { id, email, password },
  )
}

// Removes a user's copies of one built-in food, with anything that uses them, so the item is
// offered again (built-in items hide once copied).
export const removeBuiltInCopies = (userId: string, catalogId: string): void => {
  runSql(
    `
    delete from public.log_entries
      where food_id in (select id from public.foods where user_id = :'id' and catalog_id = :'catalog');
    delete from public.recipe_items
      where food_id in (select id from public.foods where user_id = :'id' and catalog_id = :'catalog');
    delete from public.foods where user_id = :'id' and catalog_id = :'catalog';
    `,
    { id: userId, catalog: catalogId },
  )
}
