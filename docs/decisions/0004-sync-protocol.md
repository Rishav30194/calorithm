# 0004. Sync with an outbox, last write wins, and pull overlap

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

Local-first storage (decision 0003) needs a sync protocol that never duplicates, never loses
committed writes, and stays simple enough to test fully.

## Decision

- Writes go to an outbox in the same Dexie transaction as the row, and are pushed as upserts
  keyed by device-created UUIDs.
- Pulls request rows with `updated_at` after the saved position minus one minute. The trigger
  stamps the transaction start time, so a slow transaction can commit behind the position; the
  overlap catches it.
- Pull pages use keyset paging on `(updated_at, id)`.
- Conflicts: the whole row with the later `client_updated_at`, the device's time of the edit,
  wins. A `BEFORE UPDATE` trigger skips an incoming update older than the stored row.
- Deletes are soft, through `deleted_at`.
- Outbox entries carry `schema_version`, and `app_config.min_app_version` stops old clients.

## Alternatives

| Option | Why not |
|---|---|
| A sequence number per row for pulling | Sequence values are assigned before commit, so it has the same gap problem |
| Postgres logical replication or Realtime | More moving parts; Realtime doesn't replace a catch-up pull |
| Per-field merge or CRDTs | Complexity without benefit while one person edits their own rows |
| Conflicts by server `updated_at` | That's the sync time, so an old offline edit that syncs late beats a newer one |

## Consequences

- Each rule is small and has its own test case.
- A concurrent offline edit to the same row on two devices loses one edit.
- Conflicts trust device clocks; a clock that's far off can pick the wrong winner.
- Revisit when rows can be shared between users.
