# 0023. Account deletion needs a recent password sign-in

- **Status:** Accepted
- **Date:** 2026-11-21
- **Supersedes:** none

## Context

Phase 6 adds **Delete account**: it removes the sign-in account and every row the user owns,
after the user enters their password. The app holds only the publishable key, so deleting an
auth user has to happen on the server, in a database function or an Edge Function. Whatever
runs it must be sure the password was just entered, not only that the request carries a valid
session: a session can outlive the person who started it, on a shared or stolen device.

Every user table already references `auth.users` with `on delete cascade`, so deleting the
auth user removes the rows in the same statement.

## Decision

A `security definer` database function, `public.delete_account()`, deletes the caller's auth
user. It refuses unless the JWT's `amr` claim lists a `password` sign-in from the last 5
minutes (SQLSTATE `28000`). The app signs in again with the password, which refreshes the
session with a new `amr` entry, then calls the function. Afterwards the app deletes this
device's database and session the way sign-out does (decision 0017).

Local Supabase Auth shows `amr` as `[{ "method": "password", "timestamp": <seconds> }]`, and a
refreshed token keeps the sign-in time rather than the refresh time, so an old session can't
pass by refreshing.

## Alternatives

| Option | Why not |
|---|---|
| Check the password inside the function with `crypt` against `auth.users` | Anyone holding a session could guess passwords through the function, with no rate limit; Supabase Auth rate-limits sign-ins. |
| An Edge Function with the service-role key | Adds a deployed function and puts the service-role key in a runtime the project doesn't otherwise use. |
| Supabase Auth's `reauthenticate` nonce | Sends an email or SMS code: another step and a dependency on email delivery. |
| Trust any valid session | A stolen or forgotten session could delete the account. |

## Consequences

- One migration, testable with pgTAP: the tests prove no rows are left in any table.
- The rule depends on the `amr` claim's shape. A Supabase Auth change to it would make every
  deletion fail closed, with the "couldn't confirm your password" message, not open.
- The guarantee holds only while changing the password needs the current password or a
  recent sign-in, Supabase Auth's **Secure password change**. Without it, a stolen session
  could set a new password and then pass the check. It's on in `supabase/config.toml`; the
  hosted project's setting is the user's to confirm in the dashboard.
- A device clock far off doesn't matter: the server compares the sign-in time with its own
  clock.
- The end-to-end test deletes a seed user, then puts it back through `psql` in the local
  database container (`e2e/database.ts`), since sign-ups are off.
