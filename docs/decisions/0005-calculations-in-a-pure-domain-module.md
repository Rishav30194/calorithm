# 0005. Calculations in a pure domain module

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

The trend, maintenance estimate, and targets are the app's core value and must be correct.
They may later run outside the browser: in an Edge Function, a native app, or a reports job.

## Decision

All calculations live in `src/domain/` as pure functions. They take data and today's date as
arguments and never import React, Dexie, or Supabase, or read browser APIs or the clock. The
`check-edit.sh` hook enforces this on every edit.

## Alternatives

| Option | Why not |
|---|---|
| Postgres functions | Harder to test with property tests; can't run offline |
| Calculations inside components or hooks | Tied to React; tests need rendering; a clock read slips in unnoticed |

## Consequences

- Fast, deterministic unit and property tests.
- Reusable in any TypeScript runtime.
- Callers must gather the inputs, which adds a thin layer in `src/data/`.
