# 0009. Safety limits on targets

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

An adaptive target can drift very low after a few weeks of under-logging, or follow an
aggressive goal rate. For an app others may use, including people with a history of eating
disorders, unsafe targets are a real harm.

## Decision

- The calorie target never goes below a calorie floor: 1,200 kcal by default, adjustable in the
  profile.
- The goal rate is capped at 1% of trend weight a week, for losing or gaining.
- When a limit changes a target, the check-in says so.

Both are common rules of thumb, not medical advice.

## Alternatives

| Option | Why not |
|---|---|
| No limits | Acceptable for one informed user, not for anyone else |
| Sex-specific floors | More precise, but adds rules to explain; the floor is adjustable |

## Consequences

- The limits live in `src/domain/targets.ts` with property tests.
- Some users may find the limits restrictive; the floor can be lowered deliberately.
- Revisit with professional input before customers.
