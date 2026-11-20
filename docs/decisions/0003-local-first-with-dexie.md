# 0003. Local-first storage with Dexie

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

The app is used on a phone in kitchens, gyms, and while traveling, often with a weak or no
connection. A cache in front of the server makes every screen handle online, offline, and
syncing states, and loses writes when the cache and queue disagree.

## Decision

Dexie (IndexedDB) on the device is the app's source of truth. Screens read and write only
Dexie. A background sync engine copies changes to and from Supabase.

## Alternatives

| Option | Why not |
|---|---|
| TanStack Query with a persisted cache and paused writes | Still a cache: reads need the server first, and offline is an edge case |
| PowerSync | A further service and its limits; more than one user needs |
| ElectricSQL or RxDB | Heavier dependencies and their own sync models to learn |

## Consequences

- Every screen works offline and renders instantly.
- About 200 lines of sync code to own and test thoroughly; see `docs/testing.md`, "Sync".
- Schema changes must stay compatible with clients that have been offline; see
  `docs/architecture.md`, "Schema versions".
- Revisit if sharing between users needs multi-writer merging; a sync service may then pay off.
