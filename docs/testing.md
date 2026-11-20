# Testing

What each test layer covers, and the cases that must exist. A phase's acceptance criteria in
`docs/phases.md` point here.

## Layers

| Layer | Tool | Covers | Runs in |
|---|---|---|---|
| Unit | Vitest | Domain functions, repositories, sync, components | `check:fast` |
| Property | fast-check in Vitest | Calculation invariants over generated inputs | `check:fast` |
| Database | pgTAP | Row-level security, constraints, triggers, account deletion | `check:full` |
| End-to-end | Playwright with axe | User journeys and accessibility, against local Supabase | `check:full` |
| Types | `supabase gen types` diff | Generated types match the migrations | `check:full` |
| Bundle | Size script | First-load JavaScript stays within budget | `check:full` |

## Rules

- **Test first** in `src/domain/` and `src/data/sync/`. A hook blocks commits that change code
  there without a test.
- **Synthetic data only.** Fixtures are made-up histories with known answers.
- **No real network in unit tests.** Sync tests use `fake-indexeddb` for Dexie and a stub of
  the Supabase client. End-to-end tests use local Supabase.
- **Dates are inputs.** Domain tests pass today's date explicitly; nothing depends on when the
  test runs.
- **Never skip or weaken a failing test** to get a check to pass.

## Calculations

Example tests use hand-computed histories. Property tests check these invariants:

- **Trend:** stays between the lowest and highest weigh-in seen; a constant series gives a
  constant trend; a missing day carries the trend forward unchanged.
- **Maintenance:** a flat trend with steady intake gives maintenance equal to intake; a week
  with fewer than 4 complete days changes nothing; incomplete days never affect the result;
  the estimate never moves more than 150 kcal in one week.
- **Targets:** never below the calorie floor; the goal rate never exceeds 1% of trend weight a
  week; protein scales linearly with trend weight; any limit applied is reported.
- **Known answers:** synthetic 12-week histories built from a chosen maintenance value give an
  estimate within 50 kcal of it.

## Sync

Each case needs a test:

1. An offline write reaches Supabase once the connection returns.
2. A resent entry after a lost response creates no duplicate.
3. A row and its outbox entry are written together, or not at all.
4. Parents push before children.
5. The later `client_updated_at` wins a conflict, including when the older edit syncs last
   (pgTAP for the trigger, and a sync test).
6. A pulled row doesn't overwrite a local row with an unsent change.
7. A row committed late, behind the pull position, is still pulled through the overlap.
8. Rows sharing an `updated_at` across a page boundary are all pulled.
9. A soft delete reaches the other device and hides the row.
10. A permanent rejection marks the entry failed and stops retrying.
11. A network error retries with backoff.
12. An entry in the previous schema version is accepted.
13. A client below `min_app_version` stops syncing.
14. Sign-out leaves no local database for that user.
15. Sign-out with unsent changes warns before deleting anything.
16. A device whose last pull is older than 90 days does a full resync.
17. Two users on one device never see each other's rows.
18. Each Dexie version upgrade keeps existing data.

## Database

For every user table:

- The owner can select, insert, update, and soft delete their rows.
- Another signed-in user can't read or change them, and can't insert a row with someone
  else's `user_id`.
- A signed-out request sees nothing.
- Each `CHECK` constraint rejects an out-of-range value.
- The trigger sets `updated_at` on insert and update.
- An update with an older `client_updated_at` than the stored row changes nothing.

Plus: `app_config` is readable by everyone and writable by no client, and account deletion
removes every row the user owns.

## End-to-end journeys

- Sign in, sign out, wrong password.
- Create a food, log it, re-log it with one tap, copy a meal, mark a day complete.
- Build a recipe and log half a serving.
- Add weigh-ins and see the trend.
- Run a weekly check-in with seeded history.
- Write offline, reconnect, and confirm the sync.
- Export, import into a fresh account, and compare.
- Delete the account.
- An axe scan on every screen, in light and dark themes.
