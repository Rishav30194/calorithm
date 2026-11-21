# 0022. Export file format and how import merges

- **Status:** Accepted
- **Date:** 2026-11-21
- **Supersedes:** none

## Context

Phase 6 adds a JSON export, as a backup that doesn't depend on Supabase, and an import that
restores it. An import can land in the account that exported the file, after data was lost,
or in another account. Three facts shape it:

- Every table's `id` is a primary key across all accounts, so another account can't reuse
  the file's ids. Row-level security would refuse the clash, and the change would fail for
  good.
- Profile, day, weigh-in, and check-in ids come from the user and the date (decisions 0018
  and 0020), and the database checks them against the row's own `user_id`.
- The account may already hold rows on the server or on this device, some edited after the
  export.

## Decision

- **File:** one JSON object with `format: "calorithm-export"`, `version: 1`, the export time,
  the app version, the exporting account's `user_id`, and every live row of every table, as
  stored, read in one transaction. Deleted rows are left out, except a deleted food or recipe
  that a live log entry or recipe item still uses.
- **Checks:** a Zod schema and the table specs check the whole file before anything is
  written: each row's shape, the database's `CHECK` ranges and column scales, one row per
  date where ids come from the date, and references to rows in the same file. Edit times may
  run at most a day past the export time, and the export time at most a day past the device's
  clock: a far-future edit time would win every later conflict. A newer format version or row
  schema version is refused with its own message.
- **Ids:** in the exporting account, ids stay as they are. In another account, every
  random id becomes a version 5 UUID of a fixed namespace, the account, and the old id.
  References change with it, and ids that come from the user and date are worked out again
  for the new user.
- **Merge:** a row is written only when its `client_updated_at` is later than this device's
  copy, compared to the microsecond, the same rule as the server's `skip_stale_update`
  trigger. Each written row keeps the
  file's edit time and is queued in the outbox, so the server also keeps any newer edit.
  Every write happens in one Dexie transaction.

## Alternatives

| Option | Why not |
|---|---|
| Random new ids in another account | Importing the same file twice duplicates every food, recipe, and log entry. |
| Keep the file's ids in every account | The ids already belong to the exporting account, so every change fails while that account exists. |
| Replace all data with the file | Loses edits made after the export, and needs a server-side delete. |
| Stamp imported rows with the import time | An old backup would overwrite every newer edit, here and on the server. |

## Consequences

- Restoring into the same account, or importing the same file twice, merges instead of
  duplicating.
- An import that loses to a newer edit is silent per row; the result counts written and
  skipped rows for the screen to report.
- The file format is a contract: a change to it gets a new `version` and an import that
  reads every older version.
- Rows kept off the server by its trigger come back on the next push, which replaces the
  local copy with the server's.
