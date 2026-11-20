# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

Most of Calorithm's code is written in AI sessions that start without memory of earlier ones.
Without a written reason, a later session can undo a deliberate choice because it looks
unusual.

## Decision

Record each significant decision in `docs/decisions/`, one short file per decision, using
`template.md`.

## Alternatives

| Option | Why not |
|---|---|
| Reasons in PR descriptions | Hard to find later, and not loaded into a session |
| One long design document | Grows stale; changes to it hide what was decided when |

## Consequences

- Sessions and contributors can find why the code is the way it is.
- Each decision costs a few minutes of writing.
- Revisit if records go unread, which shows as decisions being undone anyway.
