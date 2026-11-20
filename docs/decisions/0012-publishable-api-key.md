# 0012. Publishable API key

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

The plan named Supabase's `anon` key for the app. Supabase is replacing the `anon` and
`service_role` keys with publishable (`sb_publishable_…`) and secret (`sb_secret_…`) keys, and
documents deprecating the old ones by the end of 2026. The publishable key has the same low
privileges, so row-level security works the same.

## Decision

The app reads `VITE_SUPABASE_PUBLISHABLE_KEY` and passes it to `createClient`. Secret keys are
never used by the app.

## Alternatives

| Option | Why not |
|---|---|
| The legacy `anon` key | Being deprecated; a forced migration later |

## Consequences

- No key migration when the legacy keys are switched off.
- The hosted project needs a publishable key created in the dashboard (phase 7).
