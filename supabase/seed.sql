-- Synthetic local data only. Never put real data here.
--
-- Signed-up users for local development and the end-to-end tests, all with the password
-- Local-Seed-Pass-2026:
--   seed.user@calorithm.test     d0000000-0000-4000-8000-000000000001
--   second.user@calorithm.test   d0000000-0000-4000-8000-000000000002 (two users on one
--                                device, and sign-out tests that change its profile)
--   weight.user@calorithm.test   d0000000-0000-4000-8000-000000000003 (weight tests; its
--                                units never change)
--   units.user@calorithm.test    d0000000-0000-4000-8000-000000000004 (the units switch test)
--   profile.user@calorithm.test  d0000000-0000-4000-8000-000000000005 (the profile form test)
--   checkin.user@calorithm.test  d0000000-0000-4000-8000-000000000006 (the check-in tests)
--   import.user@calorithm.test   d0000000-0000-4000-8000-000000000007 (receives imports)
--
-- Sign-ups are off, so the user is written straight into the auth schema. Auth needs the
-- matching auth.identities row to sign in, and empty strings rather than nulls in the token
-- columns.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'seed.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'weight.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'units.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'profile.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'checkin.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0000000-0000-4000-8000-000000000007',
    'authenticated',
    'authenticated',
    'import.user@calorithm.test',
    extensions.crypt('Local-Seed-Pass-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  json_build_object('sub', u.id, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@calorithm.test';
