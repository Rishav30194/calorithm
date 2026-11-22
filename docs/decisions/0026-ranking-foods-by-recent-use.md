# 0026. Ranking foods by recent use

- **Status:** Accepted
- **Date:** 2026-11-21
- **Supersedes:** none

## Context

Phase 9 makes the foods you eat most one tap away. The log picker listed **Today**,
**Yesterday**, and **Most used**, where **Most used** counted logs over the last 60 days, and
search results were sorted by name. A habit from last month should outrank one from last
year, and search should put what you eat first.

## Decision

Each log counts 1 on its day and half as much every 30 days older. **Most used** and the
picker's list of all foods and recipes rank by that score, then by most recent, then by name.
**Recent** lists the last ten foods and recipes logged, newest first, and replaces **Today**
and **Yesterday**. The picker reads the last 180 days, relative to the day being logged.

## Alternatives

| Option | Why not |
|---|---|
| A plain count over a fixed window | A food eaten daily a year ago outranks one eaten daily this month once both fit the window |
| Keep **Today** and **Yesterday** beside **Recent** | **Recent** holds both; four lists are too long to scroll on a 360-pixel screen, and **Copy from…** re-logs a whole meal |
| Read 365 days | Logs past 180 days count under 1.6% of a new one, and the picker re-reads its window on every change while open: about 30 ms for a year of synthetic entries on a laptop, slower on a phone |

## Consequences

- A food you stop eating fades from **Most used** over a few months.
- The half-life and window are constants in `src/domain/nutrition.ts` and `src/data/log.ts`.
- Revisit if the picker feels slow with years of data, or if a habit older than six months
  should still rank.
