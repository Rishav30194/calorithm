# 0033. Higher-calorie days as a fixed extra, worked out when shown

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 19 lets the user eat more on chosen weekdays, such as the weekend, with the same weekly
total. The weekly check-in stores one daily kcal target (`checkins.kcal_target`), and the
maintenance estimate averages intake over complete days. The split has to keep both
meaningful, respect the calorie floor on every day, and survive a later check-in changing
the target.

## Decision

The profile stores the chosen weekdays as a seven-bit mask (Monday is bit 0) and a fixed extra
in whole kcal for each chosen day, the user's choice over a percentage. Each day's target is
worked out from the latest check-in's target whenever it's shown (`src/domain/calorieDays.ts`):
the chosen days get the extra, and the other days share its cost evenly, with any leftover
kcal taken one each from the earliest lower days, so every 7 days in a row add up to exactly
7 times the target. At most 6 days can be chosen. The floor is the higher of the latest
check-in's and the profile's, so the profile form and the targets agree. When the floor allows
less than the saved extra, the extra is trimmed for that target and the app says so; the
setting itself is kept.
Check-ins still store one daily target, and protein is the same every day.

## Alternatives

| Option | Why not |
|---|---|
| A percentage extra | Harder to picture in kcal; the user chose a fixed amount |
| Store each day's target on the check-in | Seven more columns, and a profile change would wait for the next check-in |
| Let the week's total differ from 7 times the target | The goal rate and the maintenance estimate assume the daily average equals the target |

## Consequences

- The maintenance estimate and the check-in are unchanged: any 7 days in a row average to the
  stored target.
- A fixed extra can stop fitting when the target drops; trimming handles it, at the cost of a
  message the user has to read.
- Every screen that shows a day's target must use `kcalTargetOn`, not the check-in's target.
- Revisit if the user wants protein to vary by day, or different extras for different days.
