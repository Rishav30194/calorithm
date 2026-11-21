# 0021. Weekly check-in rules

- **Status:** Accepted
- **Date:** 2026-11-21
- **Supersedes:** none

## Context

`PLAN.md`, "How the numbers work", says the app estimates maintenance every 7 days, blends the
new estimate with the previous one, moves it at most 150 kcal a week, and skips a week with
fewer than 4 complete days. It leaves open when a check-in runs, whether it saves on its own,
how much of the new estimate the blend keeps, what a skipped week stores, and what the first
check-in does without a previous estimate.

## Decision

- **Timing:** a check-in is due when none exists, or when 7 days have passed since the last
  one. After a gap of several weeks, one check-in runs, not one per missed week.
- **Saving:** the check-in screen shows the result, and you save it with **Save check-in**.
  Targets never change without you seeing why.
- **Method:** the Mifflin-St Jeor formula times an activity factor, until 14 days have passed
  since the first weigh-in. After that, the adaptive estimate: average intake on complete
  days in the last 28 days ending yesterday, plus 7,700 kcal per kilogram the trend fell,
  spread over the window's days.
- **Blending:** the new estimate moves halfway from the previous one toward the raw one, and
  at most 150 kcal, whichever method produced the raw value.
- **Skipped weeks:** a check-in with a previous estimate and fewer than 4 complete days in the
  last 7 is stored as `skipped`, copying the previous check-in's estimate, targets, and
  settings. The first check-in has nothing to carry, so it's never skipped: without enough
  complete days it uses the formula, which needs no intake.
- **Blocked check-ins:** with no weigh-in, or a profile missing a field the formula needs, no
  check-in runs and nothing is stored; the screen says what's missing.
- **Ranges:** the calculation clamps its results to the ranges the `checkins` table allows,
  which every input the profile and weights tables accept can reach, so a check-in never
  fails to push.
- **Enforced by the database:** the 150 kcal step, the calorie floor, the 1% rate cap, which
  fields each method and status carry, and that a skipped week keeps the previous estimate.

## Alternatives

| Option | Why not |
|---|---|
| Save the check-in automatically | Targets would change without the user seeing the reason or the limits applied |
| Check in on a fixed weekday | Adds a setting; 7 days since the last check-in needs none |
| Keep a quarter or less of the new estimate | Converges too slowly from a formula estimate that's 500 kcal off to meet 50 kcal in 12 weeks |
| Replace the estimate outright | One noisy week would swing the targets, which the plan rules out |
| Don't store skipped weeks | The 7-day clock wouldn't advance, and the screen couldn't say why targets didn't change |

## Consequences

- A user who never opens the check-in screen keeps their last targets.
- Changing the activity level moves the formula estimate at most 150 kcal a week, like any
  other change.
- The halfway blend and the 14-day switch are untested against real logs; revisit them after
  a few months of use.
