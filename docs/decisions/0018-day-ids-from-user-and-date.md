# 0018. Day ids derived from the user and date, checked by the database

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none

## Context

`days` holds one row per user and date, enforced by a unique key on `(user_id, date)`. Sync
upserts rows by `id`. If two offline devices each create the same day with a random id, the
second one to sync breaks the unique key, and its change is refused for good.

The profile table avoids this by making its id the user's id. A day can do the same with an
id derived from the user and the date. But `id` is the table's only primary key, so an id
anyone can compute from a known user id could be inserted first by another user, blocking
that day's sync (found in the phase 3 PR 1 security review).

## Decision

A day's id is the UUID v5 of `<user_id>/<date>` in a fixed namespace, computed by the app
(`src/data/dayId.ts`). A `CHECK` constraint requires the same value, computed by Postgres's
`uuid_generate_v5`, from the row's own `user_id` and `date`. Row-level security already
pins `user_id` to the signed-in user, so no user can write a row with someone else's day id.

## Alternatives

| Option | Why not |
|---|---|
| Random ids, and resolve the unique-key clash during push | Needs a table-specific merge in the generic push, and a refused change until it runs |
| Upsert `days` on `(user_id, date)` instead of `id` | Two ids for one row: the losing device keeps a local row whose id the server never stores |
| Derived id with a per-user secret | The secret has to reach every device before the first write, which offline devices can't guarantee |
| Derived id without the check | Another user who learns a user id can claim that user's day ids first |

## Consequences

- Marking a day complete offline on two devices writes one row; the later edit wins as
  usual.
- The namespace can never change: the app and the constraint must agree on every id.
- The `uuid-ossp` extension must exist in the hosted project. The migration creates it if
  it's missing; Supabase installs it by default, which is unverified for this project until
  the hosted migrations run.
