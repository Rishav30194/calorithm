# 0013. Pull cursor kept as Postgres's timestamp text

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none

## Context

A pull continues after the last `(updated_at, id)` it received. Postgres stores `updated_at`
to the microsecond. JavaScript's `Date` keeps only milliseconds: checked on Node 26,
`Date.parse('2026-11-20T10:00:00.123456+00:00')` gives `…00.123Z`. One upsert stamps every row
with the same `updated_at`, so ties are common.

## Decision

Store the cursor as the exact `updated_at` string Postgres returned, plus the row's `id`, and
send it back unchanged. Use `Date` only to compute the one-minute overlap, where moving the
start slightly earlier is harmless. Before parsing, rewrite the timestamp into the format the
ECMAScript specification requires every engine to parse (`YYYY-MM-DDTHH:mm:ss.sss±HH:mm`):
microseconds and short offsets such as `+00` are left to each engine, and Safari's handling
of them is unverified. A cursor that still can't be read triggers a full pull.

## Alternatives

| Option | Why not |
|---|---|
| Store the cursor as a `Date` or epoch milliseconds | Rounds `.123456` down to `.123`; an `after` page then repeats rows, and rounding the other way skips them |
| A server-side sequence number | Assigned before commit, so it has the same late-commit gap as `updated_at`, and needs another column on every table |

## Consequences

- No row is skipped at a page boundary, whatever the timestamp precision.
- The fake server in unit tests compares timestamps as microseconds, not text, so tests catch
  precision bugs.
- The Supabase adapter (phase 2, PR 2) must pass the string through without parsing it;
  integration tests check that against real Postgres.
