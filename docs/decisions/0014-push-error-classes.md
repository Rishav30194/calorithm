# 0014. Push error classes and shared backoff

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none

## Context

A push can fail because the network is down, the session expired, or the server refuses the
data. Retrying the first two eventually works; retrying a refusal never does. Postgres rejects
an upsert statement as a whole, so one bad row fails every row in its batch.

## Decision

- **Three classes:** `network` (no response, 5xx, 429) retries with backoff; `auth` asks the
  app to refresh the session; `rejected` (constraint, policy, foreign key) marks the entry
  failed and stops retrying it.
- **Find the bad rows:** a rejected batch is resent one row at a time, so only the bad rows
  fail and the rest go through.
- **Shared backoff:** one waiting entry holds the whole push. Backoff doubles from 2 seconds
  up to 5 minutes, with full jitter and a 1-second floor.
- **Failed entries stay visible:** the user sees them with the reason and can discard them
  (phase 2, PR 2). A new edit of the row clears the failure and tries again.

## Alternatives

| Option | Why not |
|---|---|
| Retry everything forever | A refused row blocks nothing but retries forever, wasting requests and hiding the problem |
| Drop refused rows silently | Loses the user's change without telling them |
| Backoff per entry | Lets a child row go ahead of a parent that's waiting, which the foreign key then rejects |

## Consequences

- One bad row never blocks the rest of the outbox.
- A rejected batch of 100 rows costs up to 100 extra requests once; rare in practice.
- The Supabase adapter must map error codes into these three classes (phase 2, PR 2).
