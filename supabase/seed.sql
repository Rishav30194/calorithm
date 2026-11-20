-- Synthetic local data only. Never put real data here.
--
-- One signed-up user for local development and the end-to-end tests:
--   email:    seed.user@calorithm.test
--   password: Local-Seed-Pass-2026
--
-- Sign-ups are off, so the user is written straight into the auth schema. Auth needs the
-- matching auth.identities row to sign in, and empty strings rather than nulls in the token
-- columns.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
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
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'email',
  json_build_object(
    'sub', 'd0000000-0000-4000-8000-000000000001',
    'email', 'seed.user@calorithm.test',
    'email_verified', true
  ),
  now(),
  now(),
  now()
);
