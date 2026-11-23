# 0034. Quick adds as log entries with no food or recipe

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 16 adds quick add: logging a one-off meal by its kcal and protein, without saving a
food. Every log entry so far had exactly one source, a food or a recipe
(`log_entries_one_source`), and the app left out any row without one. The app is live on
more than one device, so a device on an older version must not show short totals once quick
adds exist. Phase 16 also lets a recipe be logged as its ingredients.

## Decision

A quick add is a log entry with neither `food_id` nor `recipe_id`; the database now refuses
only both (`log_entries_at_most_one_source`). `Entry.source` is nullable: such entries count
in every total, show, change servings, copy, export, and import, but are never suggested.
It ships in two releases: 0.17.0 reads and shows them, then 0.18.0 creates them, and a
migration raises `min_app_version` to 0.17.0, applied only once 0.17.0 is live on every
device. Logging a recipe as its ingredients is a swap on the plate (**Use the ingredients
instead** on a recipe's amount form) rather than a separate picker action, since the plate
is where amounts change.

## Alternatives

| Option | Why not |
|---|---|
| Save each quick add as a hidden food | A food row per meal, which search and backups would have to filter out |
| A new `kind` column on log entries | A column every client must send, for what the two ids already say |
| A **Log as ingredients** action in the picker | A second way to choose amounts, beside the plate that already does it |

## Consequences

- No new column, and older outbox entries keep syncing; only the check changed.
- Every place that reads an entry's source has to handle none; the type makes that explicit.
- Devices below 0.17.0 must update before syncing once the minimum is raised.
- Revisit if quick adds need to be found again, such as a list of past quick adds.
