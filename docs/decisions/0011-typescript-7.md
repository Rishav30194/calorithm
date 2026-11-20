# 0011. TypeScript 7

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

TypeScript 7, the compiler rewritten in Go, has been released since July 2026 (7.0.2 is the
latest). The project lints with Biome, not ESLint, so no lint plugin depends on the older
compiler's API.

## Decision

Use TypeScript 7.0.2, with project references checked by `tsc -b`.

## Alternatives

| Option | Why not |
|---|---|
| TypeScript 6.0.3 | Longer track record, but slower checks, and the hooks run checks on every commit and turn |

## Consequences

- Fast type checks in `check:fast`, which runs before every commit.
- Verified in phase 1: `tsc -b` checks all three project configs, and the generated database
  types compile.
- Tools that load the TypeScript compiler API in-process may lag behind; check before adding one.
- Revisit if a needed tool doesn't support TypeScript 7.
