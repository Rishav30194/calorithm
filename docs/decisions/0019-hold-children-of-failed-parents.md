# 0019. Hold rows whose parent has a failed change

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none (narrows decision 0014)

## Context

Decision 0014 marks a change the server rejects as failed, including foreign key errors,
and never retries it. Phase 3 adds tables that reference others: a log entry or recipe item
points at a food or recipe. When the server refuses a food, a log entry for it is sent next
and fails on the foreign key. Fixing the food later doesn't help: the log entry stays failed
until the user discards it, and the food they logged is lost.

## Decision

Each table spec can name the rows a row references (`parents` in `src/data/tables.ts`). A
row is always sent. If the server rejects it with a foreign key error (`23503`) while one of
its parents has a failed change, the row stays queued instead of failing. It goes out once
the parent's change is fixed by a new edit or discarded. Decision 0014 is unchanged for
every other rejection.

Sending first matters: a parent already on the server, with only a later edit refused, still
accepts new children, so they sync at once.

## Alternatives

| Option | Why not |
|---|---|
| Treat foreign key errors as retryable | A row whose parent never reaches the server retries forever and never shows **Discard** |
| Clear the failure of children when their parent syncs | Needs to know which failures came from a parent, and the child shows as failed in between |
| Hold children before sending while a parent has a failed change | Holds children of a parent already on the server, whose only refused change was an edit |
| Discard children with their parent | Throws away what the user logged because a food had a bad value |

## Consequences

- One refused food doesn't take its log entries with it; the badge shows them as waiting.
- A held row whose parent is discarded and never reached the server then fails on the
  foreign key, and the user can discard it, as before.
- A queued child is sent again on every push while its parent stays failed, one extra
  request each time; cheap at this size.
