# 0017. Delete the local database before signing out

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none

## Context

Sign-out must leave no local database for the user (sync case 14). It takes two steps that
can't share a transaction: deleting the IndexedDB database and removing the Supabase session.
The app can be closed between them, and a delete can fail or wait on another tab. Each order
leaves a different state behind when that happens.

## Decision

Delete the database first, then sign out. Before deleting, write the database's name to a
list in `localStorage`; remove it once the delete finishes. On start, before any database
opens, the app finishes every delete still on that list.

## Alternatives

| Option | Why not |
|---|---|
| Sign out first, then delete | An interrupted delete leaves a signed-out user's data on the device, and nothing signed in to remove it |
| On start, delete every `calorithm-*` database but the signed-in user's | Destroys another user's unsent changes when their session ended without a sign-out, such as an expired refresh token |
| Keep the pending list in IndexedDB | It lives in the store being deleted, or needs a second database that the same failures can strand |

## Consequences

- An interrupted sign-out leaves the user signed in; signing out again, or the next start,
  finishes the job.
- If deleting succeeds and signing out then fails, the user stays signed in with an empty
  database. The app opens a fresh one, which pulls everything back from Supabase.
- Where `localStorage` is blocked, the list reads as empty; an interrupted delete then stays
  until the user signs out again.
- Revisit if accounts can be switched without signing out, which would make several local
  databases normal.
