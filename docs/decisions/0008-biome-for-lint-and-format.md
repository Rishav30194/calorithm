# 0008. Biome for lint and format

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

A hook lints and formats every file after each edit, so the tool must be fast. Sibling projects
use ESLint with Prettier.

## Decision

Use Biome for linting and formatting, with `biome ci` in `check:fast`.

## Alternatives

| Option | Why not |
|---|---|
| ESLint with Prettier | Two tools, two configs, and slower per-file runs |

## Consequences

- One fast tool and one config file.
- Fewer plugins than ESLint; an accessibility linter for JSX is partly covered by Biome's
  `a11y` rules, and axe covers the rendered result.
- Revisit if a needed rule exists only as an ESLint plugin.
