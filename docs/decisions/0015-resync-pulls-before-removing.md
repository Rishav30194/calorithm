# 0015. Full resync pulls before removing anything

- **Status:** Accepted
- **Date:** 2026-11-20
- **Supersedes:** none

## Context

A device whose last pull is older than the 90-day retention window may hold rows whose deletes
the server has since erased. The architecture first said such a device clears its local
tables and then pulls everything. If that pull fails, an offline user sees an empty app until
the next successful sync.

## Decision

Pull every row first. Only after the pull for a table succeeds, remove local rows the server
didn't send, except rows with an unsent or failed change in the outbox.

## Alternatives

| Option | Why not |
|---|---|
| Clear tables, then pull | The app looks empty if the pull fails, and offline use is the norm |
| Clear tables, pull, and put outbox rows back | Same empty-app window; more steps to get right |

## Consequences

- The app never shows an empty state because of a resync.
- A full pull uses more data than an incremental one; it happens only after 90 days away, or
  on a device's first sync.
- A change the server refused stays visible locally until the user discards it.
