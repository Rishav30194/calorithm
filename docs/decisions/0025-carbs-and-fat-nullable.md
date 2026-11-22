# 0025. Carbs and fat as nullable columns

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 8 adds carbs and fat beside kcal and protein on foods and log entries. Existing rows
have no values for them, and the app is live, so a phone can hold outbox entries in the old
shape. `docs/architecture.md`, "Schema versions", plans a change in two releases that ends with
the new columns required.

## Decision

`carbs_g` and `fat_g` (and the per-serving copies on log entries) stay nullable for good, and
null means "not set". The app requires both whenever it saves a food from the version that
adds them to the form. Tables declare the columns each schema version added
(`TableSpec.addedColumns`), and push sends an entry from an earlier version without them, so
the server keeps the values a newer device stored. The second release raises
`min_app_version` instead of adding `NOT NULL`.

There are no carbs or fat targets: kcal and protein stay the targets the weekly check-in sets.

## Alternatives

| Option | Why not |
|---|---|
| Backfill 0 and add `NOT NULL` | 0 is a false value, and totals would quietly understate carbs and fat |
| Fill null when upgrading an old outbox entry | Its upsert would clear values another device set since |
| Daily carbs and fat targets | Not needed yet; totals come first, and targets can follow if they prove useful |

## Consequences

- Old foods and log entries show carbs and fat as not set until edited; totals say when some
  entries lack them.
- Every future column added to a synced table gets the same treatment through `addedColumns`.
- PostgREST's upsert keeps columns a row leaves out; an integration test proves it, and the
  sync fake does the same.
- Revisit if a database rule must depend on carbs or fat being present.
