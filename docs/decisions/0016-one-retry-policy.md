# 0016. One retry policy: the sync engine's

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none

## Context

The installed `@supabase/postgrest-js` (from `@supabase/supabase-js` 2.119.0) retries `GET`
requests on its own: up to 3 times, waiting 1, 2, then 4 seconds, when a fetch fails or the
server answers 503 or 520. The sync engine already backs off after network errors (decision
0014). With both, a failed pull took about 7 seconds before the engine even knew, and the
integration test of an unreachable server timed out.

## Decision

Turn off the library's retries with `.retry(false)` on every read in
`src/data/sync/supabaseRemote.ts`. The engine's backoff is the only retry policy for sync.

## Alternatives

| Option | Why not |
|---|---|
| Keep both | Delays stack, the offline badge appears late, and timing becomes hard to reason about |
| Rely on the library only | It retries reads only, never upserts, and knows nothing of the outbox or the shared backoff |

## Consequences

- A failed sync reports at once, and the engine retries on its own schedule.
- A 503 while PostgREST loads its schema cache is retried by the engine, at most 5 minutes
  later, instead of within seconds by the library. Acceptable for background sync.
- Revisit if transient 503s turn out to be common on the hosted project.
