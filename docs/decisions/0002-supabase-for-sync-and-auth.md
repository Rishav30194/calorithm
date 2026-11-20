# 0002. Supabase for sync and sign-in

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

Data must reach more than one device, survive losing a phone, and later serve more users. A
custom backend needs hosting, security work, and upkeep that one person can't justify.

## Decision

Use Supabase: Postgres with row-level security for the sync copy and the rules, and Supabase
Auth for sign-in. Local development uses the Supabase CLI in Docker.

## Alternatives

| Option | Why not |
|---|---|
| Firebase | Document store with weaker constraints; rules aren't SQL, and tests are harder |
| Own API and database | Hosting, auth, and security to build and run |
| Local only, with file export | No sync between devices and no path to more users |

## Consequences

- Row-level security and constraints give server-side enforcement with no server code.
- pgTAP tests cover access rules directly.
- The free plan pauses after a week without requests and has unconfirmed backups; see
  `PLAN.md`, "Free-plan safeguards".
- Revisit if Supabase pricing or limits stop fitting, or if a feature needs heavy server logic.
