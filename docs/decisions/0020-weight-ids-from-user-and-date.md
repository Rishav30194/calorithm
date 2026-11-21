# 0020. Weigh-in ids derived from the user and date

- **Status:** Accepted
- **Date:** 2026-11-21
- **Supersedes:** none

## Context

`weights` holds one weigh-in per user and date, enforced by a unique key on
`(user_id, date)`. A second weigh-in on the same day must replace the first, including one
made offline on another device. With random ids, the second device's row breaks the unique key
when it syncs and its change is refused for good: the same problem `days` had (decision 0018).

## Decision

A weigh-in's id is the UUID v5 of `<user_id>/<date>` in its own fixed namespace, computed by
the app (`weightId` in `src/data/dayId.ts`). A `CHECK` constraint requires the same value from
the row's own `user_id` and `date`, as decision 0018 does for `days`.

## Alternatives

| Option | Why not |
|---|---|
| Random ids, and replace the earlier row on the device | Works on one device; two offline devices still clash on the unique key |
| Reuse the `days` namespace | A day and a weigh-in for the same date would share an id; ids are easier to reason about when unique across tables |
| Several weigh-ins a day, averaged | The plan and the trend use one weigh-in a day |

## Consequences

- Weighing in again, on any device, overwrites the day's weigh-in; the later edit wins.
- Deleting a weigh-in soft deletes the row, and weighing in again that day revives the same
  row.
- The namespace can never change, for the same reason as the `days` one.
