# Phases

The build order from `PLAN.md`, with each phase's scope, acceptance criteria, and status. A
phase is done when every acceptance criterion is met, `npm run check:full` passes, and its PRs
are merged.

When a phase finishes, fill in its **Implementation notes**: what was built, what changed from
the plan and why, and anything the next phase must know. Keep each note to a few bullets; the
PRs hold the detail.

The session-start hook reads the **Status** lines, so keep the format: `Not started`,
`In progress`, or `Done (YYYY-MM-DD)`.

## Phase 1 — Foundations

**Status:** Done (2026-11-20)

**Goal:** an empty app that signs in, with every check and gate working.

**Scope:**
- `git init`, the first commit on `main`, then `chore/scaffold`.
- Vite, React, TypeScript (strict settings from `CLAUDE.md`), Tailwind v4, `vite-plugin-pwa`,
  Biome, Vitest, fast-check, `fake-indexeddb`, Playwright, and `@axe-core/playwright`, plus
  Dexie, Zod, `date-fns`, and `@supabase/supabase-js`. Dependencies need the user's approval
  before install.
- `.nvmrc` and `.env.example`.
- All `package.json` scripts from `CLAUDE.md`, "Commands".
- Local Supabase. Migrations for `profile`, `app_config`, the shared trigger functions (set
  `updated_at`, skip updates with an older `client_updated_at`), and row-level security.
  pgTAP tests for both tables and both triggers.
- `npm run db:types` and the generated-types check.
- Sign-in, sign-out, and an empty signed-in shell with bottom tabs and hash routes.
- `src/strings.ts`, theme tokens for light and dark, and the `Intl` formatting helpers.
- GitHub Actions running `check:full` on every PR.
- Decision record template in use.

**Acceptance criteria:**
- [x] `npm run check:full` passes locally and in CI.
- [x] Signing in with the seeded synthetic user shows the empty shell; a wrong password shows
  an error.
- [x] pgTAP proves one user can't read or write another's `profile` row.
- [x] axe reports no violations on the sign-in screen and the shell.
- [x] The production build installs as a PWA in Chrome. (Checked by `e2e/pwa.spec.ts`, and installed
  by hand in Chrome on macOS on 2026-11-20.)

**Implementation notes:**
- Dependencies pinned to exact versions at least 7 days old; `overrides` pins `playwright-core`
  to match `@playwright/test`, because `@axe-core/playwright` takes it as a peer.
- TypeScript 7.0.2 (decision 0011) and the publishable key (decision 0012).
- Local work needs no `.env` file: `scripts/with-local-env.mjs` reads `supabase status`.
- Local Supabase uses ports 55320 to 55329, so it runs beside other local Supabase projects.
- The `/calorithm/` base path applies in dev and preview too, after the preview server served
  `index.html` for every asset under a build-only base path.
- `profile.id` equals `user_id`, so two devices creating a profile offline write one row.
- Biome's Markdown formatter is off, so the docs keep their hand-written tables.
- First-load JavaScript: 129.8 kB gzipped of the 200 kB budget.
- Merged in PR #1 on 2026-11-20 (merge commit 12ecde4).
- Another project's service worker on `localhost:4173` showed its own app at first. Chrome
  scopes service workers by origin and path, so a worker at another app's root path controls
  `/calorithm/` too. Incognito, or unregistering that worker, avoids it.
- On wide desktop windows the screen content sits at the left while the tab bar is centered.
  Cosmetic; the layout targets phones first.

## Phase 2 — Local database and sync

**Status:** Done (2026-11-20)

**Goal:** any table can be written offline and reaches Supabase reliably.

**Scope:**
- Dexie database named per user, with `outbox` and `sync_state`.
- Repository pattern: row write and outbox entry in one transaction.
- Push, pull with overlap and keyset paging, conflict rule, soft deletes, backoff, failed
  entries, and the full resync for devices offline more than 90 days.
- `schema_version` on every row, `min_app_version` check, and the **Update** screen.
- Sign-out syncs, warns about unsent changes, then deletes the local database.
  `navigator.storage.persist()` on start.
- A sync status indicator (last synced, pending count, failures).

**Acceptance criteria:**
- [x] Every sync case in `docs/testing.md`, "Sync", has a passing test.
- [x] A Playwright test writes offline, goes online, and finds the row in Supabase. (A second
  device reads it back from Supabase: `e2e/sync.spec.ts`.)
- [x] Two browser contexts as the same user see each other's changes.
- [x] After sign-out, IndexedDB holds no database for that user. (`e2e/session.spec.ts`,
  also with a second tab open.)

**Plan** (approved 2026-11-20): three PRs.

1. **Engine:** Dexie database, synced-table registry, repository and outbox (one row per
   pending change, collapsed on repeat edits), push with error classes and backoff, pull with
   keyset paging and the one-minute overlap, the full resync rule, an in-memory fake server,
   and unit tests for sync cases 2 to 12, 16, and 18.
2. **Live wiring:** the Supabase adapter with integration tests against local Supabase (new
   `test:integration` script in `check:full`), the sync schedule, the `min_app_version` check
   and **Update** screen (`workbox-window` 7.4.1 becomes a direct dependency), the sync status
   badge and Settings panel with **Discard** for failed changes, and a **Units** setting as the
   first real synced write. Case 13.
3. **Session:** sign-out that syncs, warns, and offers a JSON export of unsent changes;
   separate databases per user; `storage.persist()`; Playwright tests for offline writes, two
   windows, and sign-out. Cases 1, 14, 15, and 17.

Cases 4 and 12 use a made-up table until phase 3 adds parent and child tables and a second
schema version. The server job that removes rows deleted over 90 days ago moves to phase 7.

**Implementation notes:**
- PR 1 (engine), merged in PR #2 on 2026-11-20: `src/data/db.ts`, `tables.ts`, `repository.ts`, and `src/data/sync/` (push,
  pull, `syncOnce`, and the in-memory `FakeRemote`). Sync cases 2 to 12, 16, and 18 have unit
  tests; each guard was checked by breaking it on purpose and watching its test fail.
- A full resync pulls before removing anything, instead of clearing tables first (decision
  0015).
- The outbox holds one entry per row, with a `rev` counter so a push never clears an edit made
  while it was in flight.
- Code review before the PR found 7 real sync gaps, all fixed with tests: rows the server
  skipped as older are fetched back, unreadable rows are retried by id, full pulls never
  delete rows they couldn't read, auth errors don't back off, pulls run during backoff, a
  clock jumping back can't stall sync, and failed changes can be discarded
  (`src/data/sync/discard.ts`).
- PR 2 (live wiring): the Supabase adapter with 12 integration tests against local Supabase,
  the engine schedule, the minimum-version check and **Update** screen (case 13), the sync
  badge and Settings panel with **Discard**, and the **Units** setting. Browser tests already
  cover case 1 (an offline change syncing once back online) and two windows seeing each
  other's change, both planned for PR 3.
- Integration tests confirmed on real Postgres that an upsert skipped as older is missing
  from the returned rows, which push depends on. The library's own read retries are off
  (decision 0016).
- First-load JavaScript is 169.3 kB of the 200 kB budget, up from 129.8 kB. Phase 3 may need
  to load screens on demand.

## Phase 3 — Foods, recipes, and the daily log

**Status:** Done (2026-11-21)

**Goal:** logging a day's food takes seconds.

**Scope:**
- Migrations and pgTAP tests for `foods`, `recipes`, `recipe_items`, `log_entries`, and `days`.
- Food and recipe editors, archiving, recipe totals.
- Today's log by meal, with one-tap re-logging from today, yesterday, and most used.
- Copy a meal from an earlier day. Mark a day complete.
- Daily kcal and protein totals.

**Acceptance criteria:**
- [x] Logging a saved food takes at most two taps from the log screen. (`e2e/log.spec.ts`)
- [x] Editing a food doesn't change any past log entry (unit and end-to-end tests).
- [x] A log made at 00:30 lands on that calendar day. (End-to-end, in the `Asia/Kolkata`
  time zone with a fixed clock.)
- [x] Constraints reject negative kcal, zero servings, and similar values (pgTAP).
- [x] axe passes on every new screen.

**Plan** (approved 2026-11-20): four PRs.

1. **Schema:** migrations and pgTAP tests for the five tables, generated types, table specs in
   push order, Dexie schema version 2 with an upgrade test, and sync case 4 on the real
   `recipes` and `recipe_items` tables.
2. **Calculations and storage:** `src/domain/nutrition.ts` with property tests, repository
   functions, and a `days` id derived from the user and date. From the PR 1 review:
   - Repositories round servings and serving size to two decimals, protein to one, and kcal
     to a whole number before writing, so the server never rejects a stored value.
   - Push holds a log entry or recipe item while its food or recipe has a failed change.
     Without this, the child fails on the foreign key and stays failed after the parent is
     fixed. Sent once the parent syncs or is discarded.
   - From the PR 1 security review: a `days` id computed only from the user ID and date can
     be computed by anyone who learns the user ID, who could then claim that id first and
     block the day's sync. Since `id` is the table's only primary key, the derivation needs a
     per-user secret, or the design changes to rely on the `(user_id, date)` unique key.
3. **Foods and recipes screens**, loaded on demand.
4. **The log screen:** meals, quick re-log, copy a meal, day complete, totals, and the
   end-to-end journeys.

**Implementation notes:**
- References between tables include `user_id`, as foreign keys on `(id, user_id)`. Postgres
  checks foreign keys without row-level security, so a key on `id` alone would let a row
  point at another user's food or recipe.
- Log entries copy the food or recipe's `name`, `kcal`, and `protein_g` (for the servings
  logged) when written, so later edits never change a past day.
- `meal` is one of `breakfast`, `lunch`, `dinner`, or `snacks`; a food is logged by servings.
- The foreign keys have no `on delete` action, so phase 7's job that removes rows deleted
  over 90 days ago must skip foods and recipes that live rows still reference, or remove
  those first.
- `days` and `log_entries` accept future dates on purpose, for logging ahead.
- PR 2: `src/domain/nutrition.ts` rounds at the storage boundary (kcal whole, protein one
  decimal, servings two) and scales a recipe's exact totals before rounding once.
  Repositories are `src/data/foods.ts` and `src/data/log.ts`. Day ids follow decision 0018,
  and a row that fails on the foreign key while its parent has a failed change stays
  queued (decision 0019).
- Log entries store their unrounded per-serving values (`kcal_per_serving`,
  `protein_g_per_serving`), so changing servings rescales exactly, and `logged_at`, which
  orders a meal. Copies of a meal are logged a millisecond apart to keep their order.
- Recipe items have no stored order and come back in id order; the recipe screen sorts them.
- PR 3: food and recipe screens live under the log tab at `#/log/foods` and `#/log/recipes`
  (`src/ui/routes.ts`), and load on demand from `src/ui/food/screens.tsx` as a separate
  chunk. Screens read through `src/data/foodHooks.ts`, which returns view objects, never
  rows. `ScreenErrorBoundary` catches live-query errors and offers **Try again**. Forms
  parse with Zod in `src/ui/food/forms.ts` and accept a decimal comma.
- PR 4: the log screen (`src/ui/log/`) shows today at `#/log` and other days at
  `#/log/day/YYYY-MM-DD`, loaded on demand. `useToday` reads the local day and moves on at
  midnight and when the app returns to the foreground. The picker's Today, Yesterday, and
  Most used rows (last 60 days, top 10) log the servings last logged in one tap; search logs
  one serving. `src/domain/dates.ts` does calendar arithmetic in UTC so daylight saving
  never skips a day.

## Phase 4 — Weight and the trend chart

**Status:** Done (2026-11-21)

**Goal:** daily weigh-ins with a trend line you can trust.

**Scope:**
- `weights` migration and pgTAP tests.
- Weigh-in entry, one per day, in kg or lb.
- `src/domain/trend.ts` with example and property tests.
- SVG chart of weigh-ins and the trend, with an accessible text summary.

**Acceptance criteria:**
- [x] Trend matches hand-computed values for the test histories. (`src/domain/trend.test.ts`)
- [x] Property tests: the trend stays between the lowest and highest weigh-in, and missing days
  carry it forward. (`src/domain/trend.test.ts`)
- [x] A second weigh-in on the same day replaces the first. (`src/data/weights.test.ts`, and
  the database test in `supabase/tests/weights.test.sql`)
- [x] Units switch without changing stored values. (`src/domain/weight.test.ts` and
  `e2e/weight.spec.ts`)

**Plan** (approved 2026-11-21): three PRs, merged as #11 to #13.

1. **Schema:** `weights` migration and pgTAP tests, generated types, `weightsSpec` last in
   push order, and Dexie schema version 3 with an upgrade test.
2. **Calculations and storage:** `src/domain/trend.ts` (an exponential moving average, 10% a
   weigh-in, carried forward over missing days) with example and property tests, kg and lb
   conversion with a round-trip property test, and the weigh-in repository and hooks.
3. **The weight screen**, loaded on demand: weigh-in entry for any day in the profile's
   units, recent weigh-ins to edit or delete, an SVG chart of the last 90 days, a text
   summary, and the end-to-end journeys with axe.

**Implementation notes:**
- PR 1: a weigh-in's id is a UUID v5 of the user and date in its own namespace, checked by
  the database (decision 0020), so a second weigh-in that day, from any device, replaces the
  first. `weight_kg` is `numeric(5,2)` between 20 and 400; `weightsSpec` rejects values
  outside that range before they're sent.
- PR 2: `trend()` in `src/domain/trend.ts` returns one point per day from the first weigh-in
  (or the range start, if later) to the range end, with the trend unrounded; weigh-ins before
  the range still count. It walks every day from the first weigh-in ever, which is cheap for
  years of data; start from the last weigh-in before the range if the chart ever lags. Unit conversion lives in `src/domain/weight.ts`, not `format.ts`,
  and uses the exact pound (0.45359237 kg); `formatWeight` now uses it too. A pound value
  entered with one decimal shows back unchanged (property test). `src/data/weights.ts`
  rounds to two decimals and refuses values outside 20 to 400 kg, and dates before 2000 or
  not real, with a typed result;
  `src/data/weightHooks.ts` reads and writes for the screen.
- PR 3: the weight screen (`src/ui/weight/`) loads on demand at `#/weight`. It shows the
  trend and its change over 7 days, a weigh-in form for today or an earlier day, a chart of
  the last 90 days, and a table of those weigh-ins with their trend (**Show all weigh-ins**
  lists older ones); a row opens an edit dialog with **Delete**. The chart's axis starts at
  the first point in the window. Without a weigh-in in the window, the screen shows no trend,
  since one carried from months ago isn't current. The form's day follows today until a day
  is picked, typed text clears when the unit changes, and the screen waits for the profile's
  unit (`useWeightUnit`) before showing the form. An unchanged pound edit saves nothing, since
  one decimal in pounds doesn't always convert back to the stored kilograms. The SVG
  is hidden from screen readers; a visually hidden summary names its dates and the lowest and
  highest weigh-in, and the table holds the values. `trendChange` in `src/domain/trend.ts`
  gives the 7-day change. The plan's hidden data table became the visible weigh-ins table.
- The browser tests sign in as two synthetic users added to `supabase/seed.sql`:
  `weight.user`, whose units never change, and `units.user`, for the desktop-only units test.
  The seed user can't be used, because `sync.spec.ts` flips its units in parallel. Each test
  fixes the clock to a random past day and waits for the outbox to empty before it ends.

## Phase 5 — Targets and the weekly check-in

**Status:** Done (2026-11-21)

**Goal:** the app sets your targets from your own data each week.

**Scope:**
- `checkins` migration and pgTAP tests.
- `src/domain/maintenance.ts` and `src/domain/targets.ts`, including safety limits.
- Profile screen: height, birth date, sex, activity, goal rate, protein g per kg, calorie floor.
- Progress bars on the log screen.
- Weekly check-in screen: the estimate, how it changed, targets, and any limit applied.

**Acceptance criteria:**
- [x] Every property listed in `docs/testing.md`, "Calculations", has a passing test.
  (`src/domain/trend.test.ts`, `maintenance.test.ts`, and `targets.test.ts`)
- [x] Synthetic 12-week histories give estimates within 50 kcal of their known maintenance.
  (`src/domain/checkin.test.ts`)
- [x] No input produces a target below the calorie floor or a rate above the cap.
  (`src/domain/targets.test.ts`, and the database test in `supabase/tests/checkins.test.sql`)
- [x] A week with fewer than 4 complete days leaves targets unchanged and says why.
  (`src/domain/maintenance.test.ts`, `src/ui/checkin/checkin.test.tsx`, and `e2e/checkin.spec.ts`)

**Plan** (approved 2026-11-21): four PRs, merged as #17 to #20.

1. **Schema:** `checkins` migration and pgTAP tests, generated types, `checkinsSpec` last in
   push order, Dexie schema version 4 with an upgrade test, and decision 0021.
2. **Calculations:** `src/domain/maintenance.ts` (the Mifflin-St Jeor formula, the adaptive
   estimate, blending, and skip reasons) and `src/domain/targets.ts` (rate cap, calorie floor,
   protein), with every property in `docs/testing.md`, "Calculations", and 12-week synthetic
   histories.
3. **Profile screen** on the settings tab: height, birth date, sex, activity, goal rate,
   protein g per kg, and calorie floor.
4. **The check-in screen**, loaded on demand, and progress bars on the log screen, with the
   end-to-end journeys and axe.

Check-in rules: decision 0021.

**Implementation notes:**
- PR 1: a check-in's id is a UUID v5 of the user and date in its own namespace (`checkinId`),
  checked by the database, so two devices running the same check-in write one row. Each row
  stores the result and the inputs used: status (`updated` or `skipped`), method (`formula` or
  `adaptive`), the previous, raw, and new estimates, the targets, trend weight and change, the
  window and its complete days, average intake, requested and applied goal rate, protein
  setting, calorie floor, and which limits applied. Only `too_few_complete_days` is a stored
  skip reason: missing weigh-ins or profile fields block a check-in instead. A skipped week
  copies the previous estimate, targets, and settings; the first check-in is never skipped.
  The database enforces the 150 kcal step, the floor, the 1% rate cap, and which fields each
  method and status carry, with wide ranges the calculation clamps to (decision 0021).
  `checkinsSpec` mirrors every one of those rules and the columns' precision, so a bad row
  fails before it's queued.
- PR 2: `src/domain/maintenance.ts` (`estimateMaintenance`), `targets.ts`, and `checkin.ts`
  (`isCheckinDue` and `runCheckin`, which returns the fields to store, or why the check-in is
  blocked). The adaptive window ends yesterday, since today's log isn't finished, and spans
  up to 28 days from the trend the day before it; the trend weight includes today's weigh-in,
  so a new user gets targets on day one. The rate cap rounds down to whole hundredths, so the
  applied rate never exceeds the database's 1% check. Results are clamped to the `checkins`
  ranges, and a property test runs a check-in and the next one, 7 to 21 days later, against
  every range and rule of the table. A repeated date in the days passed in counts once, the
  last entry winning.
  The 12-week histories (noise-free, ±0.8 kg daily noise, and under-logged incomplete days)
  end within 2 kcal without noise and within 22 kcal with it. The early windows read low
  during weight loss while the trend catches up from its first weigh-in, then recover.
- PR 3: the profile form (`src/ui/profile/`) loads on demand at the top of the settings
  screen. Metric shows height in centimeters; imperial in whole feet and inches. The goal is
  **Lose**, **Maintain**, or **Gain** plus an amount a week, since a phone's decimal keypad has
  no minus key, and protein is a list of 1.6 to 2.2. `profileErrors` in
  `src/domain/profile.ts` holds the profile table's checks, used by the form and by
  `saveProfileSettings`. The form saves only the fields that differ from what it showed, and
  the save merges them onto the stored row: an older open form can't undo another device's
  change, imperial rounding can't rewrite a stored height or rate, and a value this version
  doesn't know survives. Birth dates stop at yesterday, because the database checks them
  against the server's UTC date, which can be a day behind the device. A device without the
  profile fetches the server's copy before showing the form (`loadProfile`), and offline it
  says so with a retry: a form started from defaults would overwrite the server's profile on
  save, which a 360-pixel screenshot caught and an end-to-end test now covers. The browser
  tests use a new synthetic seed user, `profile.user`, desktop only for writes.
- PR 4: the check-in screen (`src/ui/checkin/`) loads on demand at `#/checkin`. When a
  check-in is due it shows the result to save: the estimate, how it changed and how it was
  made, the targets, and any limit applied; or, for a skipped week, why the targets stay the
  same. A blocked check-in links to the weight or settings screen. Otherwise it shows the
  latest check-in and the next date. `src/data/checkins.ts` gathers the inputs from Dexie
  (weigh-ins, each day's logged kcal and completion for the last 35 days, the profile, and
  the latest check-in) and maps `CheckinFields` to the row; a property test runs real
  check-ins through `checkinsSpec`. Today's log shows kcal and protein bars against the
  latest check-in's targets, under the day total, or a link to the check-in before the first.
  Other days show the day total only, since their targets may have differed. Counts in the
  check-in's text are formatted with `Intl`, and a capped rate shows two decimals rounded
  down, so it never reads above 1%.
  The browser tests use a new synthetic seed user, `checkin.user`; since check-ins can't be
  deleted, each test fixes the clock 7 days past the latest stored check-in.

## Phase 6 — Export, import, account deletion, and updates

**Status:** Done (2026-11-21)

**Goal:** you own your data and can leave with it.

**Scope:**
- Versioned JSON export with a Zod schema, and import that validates before writing.
- Export reminder on the check-in screen after 30 days.
- Delete account: password confirmation, an Edge Function or database function that removes
  every owned row and the auth user, then local data.
- **Update available** prompt.

**Acceptance criteria:**
- [x] Export then import into a fresh account reproduces every row (round-trip test).
  (`src/data/backup/backup.test.ts` and `e2e/backup.spec.ts`)
- [x] A malformed or newer-version file is rejected with a clear message and writes nothing.
  (`src/data/backup/format.test.ts`, `src/ui/backup/backup.test.tsx`, and `e2e/backup.spec.ts`)
- [x] pgTAP proves account deletion leaves no rows for that user.
  (`supabase/tests/delete_account.test.sql`, and `e2e/account.spec.ts` end to end)
- [x] A new deployment shows the update prompt without reloading on its own.
  (`e2e/update.spec.ts`)

**Plan** (approved 2026-11-21): four PRs, merged as #22 to #25, then this status change.

**Implementation notes:**
- PR 1: `src/data/backup/`. `buildExport` writes every live row of every table, unsent
  changes included, under a header with the format, version 1, export time, app version, and
  the exporting account. `importData` checks the whole file first (`parseExport`): row shapes
  through the table specs, the database's `CHECK` ranges the specs don't repeat, one row per
  date for days, weigh-ins, and check-ins, and references inside the file. It then writes, in
  one Dexie transaction, each row newer than this device's copy, keeping the file's edit time.
  Another account gets new ids: version 5 UUIDs of the account and old id, so a second import
  merges (decision 0022).
- PR 2: **Your data** on the settings screen (`src/ui/backup/`, loaded on demand) exports the
  file and records the local day in a new local-only Dexie table, `meta` (schema version 5).
  Import checks the file, asks with its export date and item count, then reports how many
  items it added or updated and how many were already current, or why it refused the file. A
  file over 75 MB is refused unread. The check-in screen's reminder (`exportReminder`) counts
  30 days from this device's last export, or from its oldest live log entry or weigh-in when
  it never exported. A synthetic seed user, `import.user`, receives imports in the browser
  tests.
- PR 3: `public.delete_account()` (migration `20261121080000`), a `security definer`
  function that deletes the caller's auth user, so every user table's cascade removes the
  rows. It needs a password sign-in in the last 5 minutes in the JWT's `amr` claim, checked
  against local Supabase Auth, including that a refreshed token keeps the sign-in time
  (decision 0023). **Delete account** on the settings screen asks for the password, signs in
  again with it, calls the function, then removes this device's data and session as
  sign-out does. pgTAP covers the refusals and proves no rows are left in any table; the
  end-to-end test deletes `delete.me@calorithm.test` and puts it back first through `psql` in
  the local database container (`e2e/database.ts`).
- PR 4: the **Update available** banner above every screen, signed in or not, with
  **Update** and **Later**. `usePwaUpdate()` checks hourly and on returning to the
  foreground, reads the waiting worker directly (the plugin misses updates another tab
  found), and turns off the plugin's reload on takeover. The end-to-end test serves its own
  copy of the build (`e2e/deployment.ts`), changes `sw.js` as a deployment would, and shows
  the banner in two tabs; the tab that selects **Update** reloads and the other doesn't.
  Further tests: **Later** hides only the version put off, and **Update** works offline
  once the new version has downloaded.
  Chromium refuses a worker update whose script Playwright intercepts, hence the server.

## Phase 7 — Production

**Status:** Done (2026-11-21)

**Goal:** the app runs on your phone against the hosted database.

**Scope:**
- The user creates the hosted Supabase project, turns off sign-ups, and sets the GitHub
  Actions secrets.
- The user applies migrations to the hosted project, turns on **Secure password change** in
  its Auth settings (decision 0023 relies on it), and deletes a throwaway account to check
  that `delete_account()` works there as it does locally.
- Deploy workflow to GitHub Pages.
- Keep-awake workflow, twice a week so one failed run still leaves a request inside the week.

**Acceptance criteria:**
- [x] The live app installs on the phone and opens offline. (The user installed it on an
  iPhone and opened it in airplane mode, 2026-11-21.)
- [x] An entry made on the phone appears on a laptop, and the reverse. (The phone's log
  entries, food, and weigh-in reached a laptop browser, and a laptop food reached the
  phone, 2026-11-21.)
- [x] A new deployment shows the update prompt on the phone. (Deploying 0.2.0 showed
  **Update** and **Later** on the installed app, and **Update** loaded it, 2026-11-21.)
- [x] The keep-awake workflow has run successfully once. (Run on 2026-11-22 UTC, reading
  `app_config` from the hosted project.)
- [x] Export from the live app downloads a valid file. (`calorithm-export-2026-11-21.json`
  with the export header and every row, checked 2026-11-21.)

**Plan** (approved 2026-11-21): one PR with the deploy and keep-awake workflows and
`docs/production.md`, then the user's setup and the checks in that document. The repository
is made public, because GitHub Pages on the Free plan serves only public repositories.

**Implementation notes:**
- PR #27: `deploy.yml` publishes to Pages after CI passes on `main`, only for the commit
  still at its head, and stops early on a missing or wrong Supabase secret.
  `keep-awake.yml` reads `app_config` on Mondays and Thursdays. Decision 0024 records making
  the repository public.
- PR #28: the hosted project grants nothing on new tables, unlike local Supabase at the time,
  so migration `20261121090000` grants each table's privileges explicitly, and local runs
  with `auto_expose_new_tables = false` to match. The hook now blocks every hosted database
  change, which CLI 3.x names with `--remote`.
- Hosted setup, 2026-11-21: the user created the project, turned off sign-ups, turned on
  **Secure password change**, and set the secrets. Claude applied the first 14 migrations with the user's one-off approval, and the
  user applied the grants migration. Deleting a throwaway account through the live app
  removed it, and its sign-in then failed.
- Releases are tagged: `v0.1.0` marks the first live version, and from 0.2.0 the deploy
  workflow tags each deployed version (`docs/development.md`, "Versions and tags").

## Phase 8 — Carbs and fat

**Status:** Done (2026-11-22)

**Goal:** every food, recipe, and log entry carries kcal, protein, carbs, and fat.

**Scope:**
- Carbs and fat per serving on foods, one decimal place, like protein. Log entries copy them
  at log time, as they copy kcal and protein. Recipe totals add them up from the
  ingredients.
- Schema change in two releases (`docs/architecture.md`, "Schema versions"): add the columns
  as nullable and accept rows without them, then make them required once no client sends the
  old shape. Existing foods show "not set" for carbs and fat until edited.
- The log shows the day's carbs and fat beside kcal and protein, and each entry shows all
  four.
- The export format gets a new version that includes carbs and fat; import still accepts
  version 1 files.
- Optional daily carbs and fat targets, decided at the phase's start (see the open
  question).

**Acceptance criteria:**
- [x] A food saved with carbs and fat shows them on the food, in a recipe's totals, and in
  the log, rounded to one decimal place. (`e2e/foods.spec.ts`, `src/ui/log/log.test.tsx`,
  and the live app on 0.3.0, 2026-11-21)
- [x] Editing a food's carbs or fat doesn't change entries already logged.
  (`src/data/log.test.ts`)
- [x] A device on the previous version keeps syncing while the new columns exist (the first
  release accepts both shapes). (`supabase/tests/carbs_fat.test.sql` accepts rows without
  them, and the push and integration tests prove a version 1 entry keeps stored values;
  not watched on a real device running 0.2.0.)
- [x] Export then import reproduces carbs and fat; a version 1 file still imports.
  (`src/data/backup/backup.test.ts` restores every row of foods and log entries exactly;
  `src/data/backup/format.test.ts` imports rows from before carbs and fat; the export
  format stays version 1, see the implementation notes)
- [x] pgTAP covers the new columns' ranges, and fast-check covers the new totals.
  (`supabase/tests/carbs_fat.test.sql` and `src/domain/nutrition.test.ts`)

**Decided** (2026-11-21): no carbs or fat targets, only totals. Kcal and protein stay the
targets the weekly check-in sets.

**Plan** (approved 2026-11-21): three PRs. PR 1: nullable columns, sync, and Dexie version 6
(decision 0025: the columns stay nullable, and the second release raises `min_app_version`
instead of adding `NOT NULL`). PR 2: totals, the food form, recipes, and the log, then
version 0.3.0; it must also carry carbs and fat through copy and repeat in `src/data/log.ts`,
which build entries from kcal and protein only. PR 3: export format version 2.

**Implementation notes:**
- PR #33: nullable `carbs_g` and `fat_g` on foods, and those plus per-serving copies on log
  entries; schema version 2 with `addedColumns`; Dexie version 6. Push never sends an added
  column as null and splits upserts by column set, because postgrest-js sends one column
  list per request and null for a column a row lacks (decision 0025).
- PR #34 (0.3.0): the form requires carbs and fat; every nutrient line reads "kcal ·
  protein · carbs · fat" through `src/ui/macros.ts`. A day's totals add the known values
  and say when some are missing; a recipe's carbs or fat are not set if any ingredient's
  are, since a logged recipe is one entry. Logged totals are checked locally for precision
  only, like protein.
- PR 3 (0.3.1): the planned export format version 2 was dropped (review of PR 3). Rows carry
  their own `schema_version`, so 0.2.0 already refuses a file with carbs and fat as
  `newer_version`, and a format bump would only have stopped 0.3.0 importing a newer app's
  file. The format stays version 1. Import now refuses carbs or fat on log entries that the
  database's ranges would refuse.
- Release 2: migration `20261122030000` raises `min_app_version` to 0.3.0, after the user
  confirmed their phone and laptop run 0.5.0 (2026-11-22).

## Phase 9 — Recent and frequent foods

**Status:** Done (2026-11-21)

**Goal:** the foods you eat most are one tap away.

**Already built:** the log picker lists **Today**, **Yesterday**, and **Most used**
(`mostUsed` in `src/domain/nutrition.ts`).

**Scope:**
- A **Recent** list: the last distinct foods and recipes logged, newest first, across every
  meal.
- Ranking for **Most used** that weighs recent use over old use, so last month's habit
  outranks last year's.
- Search results in the picker ranked by the same score, then by name.
- Pure ranking functions in `src/domain/`, written test first.

**Acceptance criteria:**
- [x] A food logged yesterday appears at the top of **Recent**. (`recentPicks` tests in
  `src/domain/nutrition.test.ts`, and `e2e/log.spec.ts` on the day after a logged food)
- [x] A food logged daily this month outranks one logged often a year ago in **Most used**.
  (`src/domain/nutrition.test.ts`)
- [x] Typing in the picker search puts frequent matches above rare ones.
  (`src/ui/log/log.test.tsx`)
- [x] Example and fast-check tests cover the ranking; archived foods never appear.
  (`src/domain/nutrition.test.ts`, and `quickPicks` in `src/data/log.test.ts`)

**Plan** (approved 2026-11-21): one PR, version 0.4.0, no migration. **Recent** replaces
**Today** and **Yesterday** in the picker, since it holds both and **Copy from…** re-logs a
whole meal. A log counts 1 on its day, halving every 30 days; **Most used** and the picker's
list rank by that score, over the last 180 days (decision 0026; the plan said 365, cut after
timing it).

**Implementation notes:**
- One PR (0.4.0). `useScores`, `mostUsed`, and `recentPicks` in `src/domain/nutrition.ts`;
  `quickPicks` returns **Recent**, **Most used**, and the scores, which the picker's search
  list sorts by. The window is 180 days, not the planned 365: timing a year of synthetic
  entries gave about 30 ms per refresh on a laptop, and older logs weigh under 1.6%
  (decision 0026).

## Phase 10 — Built-in Indian and gym foods

**Status:** Done (2026-11-22)

**Goal:** common Indian home foods and gym staples are there to pick, without typing their
numbers.

**Scope:**
- A curated list of about 150 to 250 foods, shipped with the app as a small file loaded on
  demand, not stored per user in the database. Picking one copies it into your own foods,
  so editing, sync, export, and logging work as they do today.
- Coverage: staples (rice, roti, chapati, paratha, poha, upma, idli, dosa, dal varieties,
  rajma, chole, sambar, curd, milk, ghee), gym foods (chicken breast, eggs and egg whites,
  paneer, soya chunks, whey protein, oats, peanut butter, Greek yogurt, fish), and common
  fruit, vegetables, nuts, and snacks.
- Each item lists kcal, protein, carbs, and fat per serving, with an Indian household
  serving where one exists (1 katori, 1 roti) and grams.
- Each item cites its source. USDA FoodData Central is public domain and comes first; the
  Indian Food Composition Tables (IFCT 2017) are used only if NIN's terms allow it, which is
  unverified.
- A decision record covers the source, how values were chosen, and how the list is
  updated.

**Acceptance criteria:**
- [x] Searching "paneer", "dal", or "roti" in the picker shows built-in items before you
  have created any food. (`src/data/catalog/search.test.ts`, `src/ui/log/log.test.tsx`, and
  `e2e/log.spec.ts`)
- [x] Picking a built-in item adds it to your foods with all four numbers and its source.
  (`logCatalogFood` in `src/data/log.test.ts`, and `e2e/log.spec.ts`)
- [x] The list loads on demand and leaves first-load JavaScript within its 200 kB budget.
  (Its own 38 kB chunk, precached for offline use; first load 185.0 kB.)
- [x] A test checks every item: four numbers present, energy consistent with protein,
  carbs, and fat, and a source on each. (`src/data/catalog/foods.test.ts`; the energy check
  is "not above 4/4/9 by more than 10%, nor below 45% of it", see the plan.)

**Open question:** whether NIN permits reuse of IFCT 2017 values. Until answered, use
USDA values only.

**Plan** (approved 2026-11-22): USDA FoodData Central only (decision 0027). PR 1: the
curated list, its build script, and tests. PR 2: the picker shows built-in matches and
copies a picked one into your foods, with a nullable `catalog_id` column on foods (a
migration), version 0.5.0. The energy check is "not above 4/4/9 by more than 10%, nor below
45% of it", not "within 10%": USDA's food-specific factors put fruit and vegetables below
the general formula.

**Implementation notes:**
- PR #37: 192 foods from USDA FoodData Central (SR Legacy and FNDDS 2021-2023), built by
  `scripts/build-catalog.mjs` from `scripts/catalog/items.json`; `docs/catalog.md` lists the
  gaps (jaggery, poha, khichdi, and others) and approximations (paneer's carbs).
- PR 2 (0.5.0): the picker searches the list by English and Hindi names once you type, and
  a tap copies the item into your foods and logs one serving. Foods gained a nullable
  `catalog_id` (migration `20261122020000`, schema version 3, Dexie version 7), so a copy
  names its source and the item isn't offered again; push never sends it as null. The
  picker now keeps its search box for someone with no foods yet.

## Phase 11 — Barcode scanning

**Status:** Done (2026-11-22)

**Goal:** scan a packaged food's barcode to add it.

**Scope:**
- A **Scan barcode** button in the picker opens the camera. iPhone Safari doesn't support
  the browser's built-in barcode API, so scanning uses a WebAssembly decoder (for example
  ZXing), loaded only when the scanner opens. Adding it needs the user's approval, with its
  bundle cost.
- A scanned code is looked up first in your own foods, then in Open Food Facts. A found
  product opens the food form filled in, for you to check and save. Not found, or offline,
  opens an empty form with the barcode filled in.
- Foods get an optional barcode field, so a second scan finds your saved food without the
  network.
- Open Food Facts data is under the ODbL: the form and the food show "© Open Food Facts
  contributors" with a link. A decision record covers the license and the privacy of
  sending barcodes to Open Food Facts.

**Acceptance criteria:**
- [x] Scanning a known product on the iPhone fills in its name and four numbers.
- [x] A second scan of a saved product works offline.
- [x] An unknown barcode, a denied camera, and no network each show a clear message and a
  way to enter the food by hand.
- [x] The scanner loads on demand and leaves first-load JavaScript within budget.
- [x] End-to-end tests cover the lookup with a recorded Open Food Facts response, not the
  live service.

**Open questions:**
- Open Food Facts asks each request to name the app and a contact address. Which contact
  should it use? It must not be a personal email unless the user approves.
- How well Open Food Facts covers Indian brands is unknown; check it with real packages at
  the phase's start.

**Plan** (2026-11-22; the user approved both marked points the same day):
- Library: `barcode-detector` 3.2.3 (MIT, 2026-10-19; 3.2.4 was under 7 days old), a
  polyfill of the browser's `BarcodeDetector` on `zxing-wasm`. Its reader WebAssembly is
  about 947 kB uncompressed, loaded only when the scanner opens, and self-hosted instead of
  fetched from its default CDN; confirm the setting in the installed version's types.
  Approved as a new dependency.
- Lookup: Open Food Facts (ODbL), sending only the barcode; attribution "© Open Food Facts
  contributors" wherever its data shows. If a contact is needed, the project's GitHub
  address, never the user's email (approved). Browsers can't set User-Agent, and Open Food
  Facts' docs don't cover browser apps; its API allows an `X-User-Agent` header from any
  origin (checked 2026-11-22), so PR 2 sends the app name and contact there. Unverified as
  their recommended practice.
- PR 1 (0.6.0, one migration): nullable `barcode` on foods (schema version 4, in
  `addedColumns`, Dexie index), an optional **Barcode** field on the food form, and lookup
  of your own foods by barcode, test first.
- PR 2 (0.7.0): **Scan barcode** and **Enter barcode** in the picker; your foods first, then
  Open Food Facts filling the food form; messages for unknown codes, no network, and a
  denied camera; browser tests with a recorded Open Food Facts response; decision 0029.
  Real scanning is checked on the user's iPhone.

**Implementation notes:**
- PR 1 (0.6.0, migration `20261122040000_foods_barcode`): `src/domain/barcode.ts` checks
  the GS1 check digit and stores one form per product (decision 0028): EAN-8, EAN-13, or
  GTIN-14 digits, with a 12-digit UPC-A code as its EAN-13 form, a 14-digit code's leading
  zero dropped, and a zero-padded EAN-8 code as its 8 digits. The database checks only the
  digit pattern. UPC-E (8 digits, check digit on the expanded code)
  isn't read; PR 2 expands it when the scanner reports that format.
- The barcode is nullable and in `addedColumns` (schema version 4), so sync never clears
  it (decision 0025): the form refuses to empty a saved barcode, and an edit without one
  keeps it. Not unique; `findFoodsByBarcode` parses the code it's given and returns active
  foods by name, then archived ones.
- 0.5.0 and earlier drop columns they don't know from pulled rows (as 0.5.0 did
  `catalog_id`), so Dexie version 8 clears the foods pull cursor, and the next pull reads
  every food again without counting as a resync.
- Open Food Facts limits product reads to 15 a minute per IP address. Its v2 API is
  deprecated, and v3.5 and v3.6 replace `nutriments` with a shape that mixes label values
  and estimates, so PR 2 pins v3.4 (decision 0029).
- PR 2 (0.7.0): **Scan barcode** and **Enter barcode** in the picker (`BarcodePanel`). The
  camera and decoder (`BarcodeCamera`, `detector.ts`) load on demand: a 15 kB chunk plus
  the 947 kB WebAssembly, which the service worker precaches (the user approved adding
  `wasm` to `globPatterns`). First-load JavaScript is 186.4 kB. UPC-E scans are expanded to
  UPC-A. `lookupBarcode` checks your foods, then Open Food Facts; a found product fills
  `FoodForm` (split out of `FoodEditor`) per 100 g, and **Save and log** saves the food with
  `catalog_id = 'openfoodfacts'` and logs one serving. A saved archived food is restored
  when logged from a scan.
- The browser tests replay recorded Open Food Facts responses
  (`src/data/openFoodFacts/fixtures`). `e2e/camera.spec.ts` feeds Chromium's fake camera a
  generated EAN-13 video, so the real decoder runs; it needs the full Chromium build
  (`channel: 'chromium'`), because Playwright's headless shell has no camera capture.
- The second-scan-offline criterion is covered for a typed code in the browser tests. On
  2026-11-22 the user checked 0.7.0 on the iPhone: scanning real packs filled the form, a
  saved pack scanned offline, and a denied camera offered typing the code.

## Phase 12 — Review against MacroFactor

**Status:** Not started

**Goal:** a ranked list of improvements, learned from a month of MacroFactor.

**Scope:**
- Starts after phases 8 to 11. The user buys one month of MacroFactor; Claude reviews its
  screens through what the user shares or through Claude in Chrome, whichever MacroFactor
  allows.
- A written comparison, screen by screen: food search and logging, recipes, the weekly
  check-in, weight trend, and settings. For each: what MacroFactor does better, what this app
  does better, and the cost to close the gap.
- Calorithm stays its own design: the review takes ideas, not MacroFactor's food data, text,
  or visual design.
- The output is new phases in this file, each planned and approved before any code.

**Acceptance criteria:**
- [ ] The comparison covers every screen listed in the scope.
- [ ] Each proposed improvement has a size and a reason, and the user has ranked them.
- [ ] The approved improvements are written up as phases here.

**Implementation notes:**
- First pass, 2026-11-22, from MacroFactor's own "Getting Started" video (transcript and
  about 30 screenshots; no subscription yet). The user chose what to build: phases 15 to 20.
  Left out: AI logging, micronutrients, a branded food database, Apple Health, body photos
  and measurements, coaching modules, and carbs and fat targets (kcal and protein stay the
  only targets, decision 0025). The hands-on month stays open, to revisit once these ship.

## Phase 13 — Nutrition label

**Status:** Parked (2026-11-22): both PRs shipped in 0.9.0; photo reading works on the iPhone but needs close photos and misses fields. Improvements are planned in `HANDOVER.md`.

**Goal:** fill the food form from a pack's nutrition facts label, when there's no barcode or
Open Food Facts doesn't know it.

Phase 12 waits for the user's MacroFactor subscription, so this phase runs first.

**Scope:**
- A pure parser in `src/domain/` reads label text into a serving (per 100 g, per 100 ml, or
  the label's serving) and kcal, protein, carbs, and fat. It handles the US "Nutrition
  Facts" panel, EU and UK "Nutrition information" tables, and Indian FSSAI "Nutritional
  information" tables; converts kJ to kcal; takes total carbohydrate and total fat, never
  their sub-lines (sugars, saturated); and prefers the per-100 column when there are two.
  A value it can't read is left empty, never guessed.
- Two ways in, both opening the food form filled in, for you to check and save:
  - **Paste label text:** the iPhone's Live Text copies a label's text from the camera or a
    photo. No download, and works offline.
  - **Photo of label:** on-device text recognition (`tesseract.js` 7.0.0, Apache-2.0),
    loaded only on first use and self-hosted. Photos never leave the phone. Approved by the
    user on 2026-11-22; its download size is measured in PR 2.
- Entry points: **Read nutrition label** in the picker, and **Read the label** on the
  barcode flow's not-found and unreachable form, which keeps the barcode.
- No AI and no server: the user wants none, and a static app can't hide an API key.

**Acceptance criteria:**
- [x] Parser tests cover the three label formats with synthetic text, including kJ only,
  two columns, and noisy text recognition output, plus property tests.
- [x] Pasted label text fills the form, and a value the parser can't read stays empty.
- [ ] A photo of a real label on the iPhone fills the four numbers, or leaves unread ones
  empty for the user to type.
- [x] Text recognition loads on demand and leaves first-load JavaScript within budget.
- [x] End-to-end tests cover paste, and a photo built from a generated label image.

**Plan:**
- PR 1 (0.8.0): the parser, test first; **Read nutrition label** with **Paste label text**
  in the picker and on the barcode form; decision 0030 (parsing rules and leaving values
  empty rather than guessing).
- PR 2 (0.9.0): **Photo of label** with `tesseract.js`, self-hosted, cached after first
  use; browser tests with a generated label image; the user checks real labels on the
  iPhone.

**Implementation notes:**
- PR 1 (0.8.0): `parseNutritionLabel` (`src/domain/label.ts`, decision 0030) reads a row
  only when the nutrient's name comes before its first number, starting at the table (a
  "Nutrition information" title or the per-100 header), so a claim such as "High protein
  20g" above it is skipped. It takes the column the header's "per 100 g" names among its
  "per …" columns (not a "Serving size 100 g" line), joins a name with values that text
  recognition put on the next lines, reads kcal beside kJ and falls back to kJ ÷ 4.184,
  fixes a letter O beside digits (not in "1oz"), and treats a comma as a decimal mark except
  in energy values such as 1,569 or 1.569. It leaves empty a "<" amount, a row missing the
  chosen column, and values no food can have (over 100 g, or 900 kcal, per 100 g).
- **Read nutrition label** in the picker opens `LabelPanel`: paste, **Read label**, then
  `FoodForm` filled for naming and checking, with a message naming any values left empty.
  **Read the label** on the barcode flow's not-found and unreachable form keeps the barcode
  and anything already typed, and values read from the label replace only what they cover.
  `TextField` takes `rows` for a text area.
- PR 2 (0.9.0): **Photo of label** in `LabelPanel` takes a photo or a picture from the
  library (`accept="image/*"`), and `labelReader.ts` reads it on the device with
  `tesseract.js` 7.0.0 (LSTM only, the SIMD core) and `@tesseract.js-data/eng` 1.0.0
  ("best int" English). The photo is scaled to at most 2000 pixels first. The recognized
  text goes into the text box, so a misread can be corrected and read again.
- Everything loads on first use from the app: the worker (111 kB), the SIMD core (3.9 MB,
  1.46 MB gzipped), and the English data (2.95 MB, already gzipped), about 4.4 MB to
  download if GitHub Pages compresses scripts (unverified). They stay out of the precache
  and a `CacheFirst` rule (`label-reader`) keeps them after first use. First-load
  JavaScript is 187.2 kB.
- tesseract.js 7.0.0 starts the engine with a passed-in language's data as its name, so
  language data can't be handed over directly. A plugin in `vite.config.ts` (approved by the
  user) copies it to `tessdata/eng-1.0.0/eng.traineddata.gz` in the build and serves it in
  `npm run dev`; the path carries the package version so the cache refreshes on a change.
- A browser without WebAssembly SIMD can't start the core; the panel then says the photo
  couldn't be read and offers pasting.
- `tesseract.js-core` 7.0.0 is pinned as a direct dependency, because the app loads its
  core file by path and it must match the worker. Closing the panel aborts a read in
  progress and stops the worker; the text box and photo button wait while a photo is read.
- The browser test draws a label on a canvas and runs real recognition on it in both
  projects, and checks no request leaves the machine.

## Phase 14 — Logging by weight, and built-in groceries everywhere

**Status:** Done (2026-11-22): deployed in 0.12.0, and the user's iPhone check of logging by weight passed

**Goal:** log what you actually ate by weight, and find everyday groceries and spices
wherever you pick a food.

**Scope:**
- **Log by weight.** A food whose serving has a weight (a "100 g" serving, or a unit such as
  "tsp (3 g)") can be logged and edited in grams or ml: 70 g of a 100 g serving is 0.7
  servings. The entry dialog gets **Amount (g)** linked to **Servings** and a live preview
  of kcal, protein, carbs, and fat before saving. Foods measured by weight (a serving in
  g or ml) open an amount step when picked, prefilled with one serving; count foods (1 roti,
  1 egg) still log in one tap. Log entries copy the food's serving size and unit when
  logged, so a later edit of the food never changes what an old entry's grams mean.
- **Built-in foods wherever you pick a food.** The recipe ingredient picker searches the
  built-in list as the meal picker does (picking copies the item into your foods), and the
  **Foods** screen gets **Add from built-in foods**. Search matches the start of words, so
  "hing" no longer finds "jhinga" (prawns).
- **Missing groceries.** Garam masala and chaat masala are added as estimates from their
  usual spices' USDA values, labelled as estimates. For hing, ajwain, kalonji, curry
  leaves, amchur, and black salt, Claude finds an openly licensed source and reports it to
  the user before adding any.

**Acceptance criteria:**
- [x] Logging 70 g of a 100 g food stores 0.7 servings and 70% of each value.
- [x] The entry dialog converts between grams and servings both ways, previews the four
  values before saving, and shows no grams for foods without a weight.
- [x] A weighed food asks for its amount when picked; a count food still logs in one tap.
- [x] Onion, tomato, and the spices can be added to a recipe without saving them first.
- [x] Garam masala (from CoFID, approved instead of an estimate) and chaat masala (marked
  as an estimate) are in the list; any single spice added has a recorded source the user
  approved.

**Plan** (approved by the user 2026-11-22, with the amount step for weighed foods only):
- PR 1 (0.10.0, one migration): `src/domain/portion.ts` (weight per serving, grams to
  servings), test first; nullable `serving_size` and `serving_unit` on `log_entries`
  (schema version 3, in `addedColumns`); the entry dialog's amount and preview; the
  picker's amount step for weighed foods. Decision 0031: the extra tap for weighed foods,
  against phase 3's two-tap criterion.
- PR 2 (0.11.0): built-in foods in the recipe ingredient picker and on the **Foods**
  screen; word-start search.
- PR 3 (0.12.0): garam masala and chaat masala estimates; single spices after the user
  approves their source.

**Implementation notes:**
- PR 1 (0.10.0, migration `20261122050000_log_entries_serving`): `src/domain/portion.ts`
  gives a serving's weight from a g, ml, kg, or l unit or a bracketed weight ("tsp (3 g)"),
  and converts amounts to servings (two decimals) and back (one decimal). Log entries copy
  the food's `serving_size` and `serving_unit` (nullable, set together, schema version 3,
  in `addedColumns`); recipes and older entries have none. `LoggedEntry` exposes `portion`
  and `perServing`. Dexie version 9 sets them null on stored entries and clears the
  `log_entries` pull cursor, since older versions dropped the columns from pulled rows.
- `AmountFields` keeps **Amount (g)** and **Servings** in step and previews the four values;
  the entry dialog and the picker's amount step use it. Recent picks of a weighed food
  open the step with the servings last logged. `logCatalogFood` takes servings.
- The phase 3 browser tests now use a "bowl (40 g)" unit, a piece with a weight, so they
  still log in one tap.
- PR 2 (0.11.0): `copyCatalogFood` (`src/data/foods.ts`) returns the copy made before,
  restores an archived one, or creates one; logging a built-in item uses it too. The
  recipe ingredient picker (`FoodPicker`) and the **Foods** screen (`CatalogList`'s new
  `extra` and `onSearch`) show `BuiltInMatches` under the search, loading the list on the
  first search. A pick in the recipe picker adds the copy as an ingredient; on the **Foods**
  screen it opens the copy in the editor. Both show the search even with no foods of your
  own. `searchCatalog` matches word starts (after any character that isn't a letter or
  digit): "chili powder" finds "Red chili powder", "hing" no longer finds "jhinga".
- The recipe picker remembers each copy until the foods query has it, so a new ingredient is
  named and counted at once. Like the meal picker, it restores an archived copy when its
  built-in item is picked; the **Foods** screen counts archived copies as added, so "Show
  archived" never lists an item twice. "No match" shows only when neither your foods nor
  the loaded built-in list match.
- PR 3 (0.12.0, decision 0032): garam masala comes from CoFID 2021 (food 13-829), which has
  literature values, rather than an estimate, with the user's approval of CoFID (Open
  Government Licence v3.0) on 2026-11-22. Curry leaves also come from CoFID (13-821); black
  salt takes USDA table salt's values; amchur, ajwain, kalonji, and chaat masala are named
  "(estimate)", from USDA values as `scripts/catalog/other.json` records. Hing is left out,
  as CoFID lacks its energy and carbs. `build-catalog.mjs --keep-usda` rebuilds without the
  USDA downloads. The picker's source line credits CoFID with the licence's statement.

## Phase 15 — A plate, and smarter suggestions

**Status:** In progress

**Goal:** log a whole meal in one go, with the foods you usually eat for it on top.

From the first MacroFactor pass (2026-11-22, phase 12's implementation notes). Kcal and
protein stay the only targets (decision 0025); carbs and fat show as totals throughout
phases 15 to 20.

**Scope:**
- **A plate.** Each row in the log picker gets an add button that puts the food or recipe on
  a plate without leaving the list; a tap on the row still logs it at once, as now. The plate
  shows each item with its amount (editable in servings, or in grams for a weighed food), the
  plate's total kcal and protein, and **Log all**, which writes every entry and its outbox
  entry in one Dexie transaction. Items can be removed. The plate lives only while the
  picker is open; closing it with items asks first.
- **Usual for this meal.** The picker, opened from a meal, lists the foods you most often log
  in that meal over the last 60 days, above **Recent**. Calorithm logs by meal rather than by
  the hour, so it ranks by meal, not by time of day. A pure function in `src/domain/`.
- **Grouped search.** Results come in three groups, in this order: foods and recipes you've
  logged before, your other foods and recipes, then built-in foods. Each group keeps the
  current ranking (most used, then name).

**Acceptance criteria:**
- [x] Three foods put on the plate, one changed to 150 g, log as three entries in that meal
  with the right values, in one transaction (a failed write logs none). (`logPlate` in
  `src/data/log.test.ts`, the picker tests, and `e2e/log.spec.ts`)
- [x] Closing the picker with a non-empty plate asks before discarding it.
  (`src/ui/log/log.test.tsx`, and `e2e/log.spec.ts` with axe)
- [x] The meal list ranks by count in that meal, ties by name; property tests cover it.
  (`src/domain/nutrition.test.ts`, `usualForMeal`)
- [x] Search groups appear in order, and a food never shows in two groups.
  (`src/ui/log/log.test.tsx`; the groups split one list by use score, and built-in items
  you've copied show only as yours)
- [x] Browser tests with axe cover the plate at 360 pixels in both themes.
  (`e2e/log.spec.ts`, phone and desktop projects)

**Plan** (2026-11-22, the user's "start phase 15"): two PRs.

1. **Meal suggestions and grouped search** (0.14.0): `usualForMeal` in
   `src/domain/nutrition.ts`, `QuickPicks.byMeal`, the **Usually for …** list above
   **Recent**, and search results grouped as **Logged before** (a use score in the last 180
   days) and **Your other foods and recipes**, with built-in foods after.
2. **The plate** (0.15.0): an add button on each row, the plate with editable amounts and
   totals, **Log all** in one transaction with `entryFits` checked, and a confirmation before
   closing with items on it.

**Implementation notes:**
- PR 1: the **Usually for …** list reads `QuickPicks.byMeal` (the last 60 days of each
  meal, up to 10); search splits your foods by use score into **Logged before** and **Your
  other foods and recipes**; with no search, **All foods and recipes** stays one list.
- PR 2: `logPlate` (`src/data/log.ts`) reads and checks every item with `entryFits` before
  writing any, copies built-in items only then, and logs each a millisecond apart so the meal
  keeps the plate's order. Each picker row has an add button named "Add … to the plate".
- Changed from the plan: while the plate has items, tapping a row adds it to the plate rather
  than logging it alone, since logging closes the picker and would drop the plate. After a
  scan or a label logs a new food, the picker returns to the list when a plate is waiting.
- The plate changes amounts in grams for any serving with a weight (a "bowl (40 g)" too), as
  the entry dialog does; it lists grams only for foods measured by weight.
- Picker tests match row buttons by the start of their name (`/^Oats/`), since each row's add
  button also contains the food's name.
- After `/code-review`: a built-in item you already copied is logged with your copy's values;
  a failed **Log all** names the item that stopped it; the plate can't change while it's
  being logged; Close asks from any view; a meal's list breaks ties by the current name.

## Phase 16 — Quick add, and recipes logged as ingredients

**Status:** Not started

**Goal:** log a one-off meal by its numbers, and adjust a recipe's ingredients for one
meal without editing the recipe.

**Scope:**
- **Quick add.** A picker panel with a name, kcal, protein, and optional carbs and fat logs
  an entry with no food or recipe behind it. It never shows in search or suggestions; it can
  be edited and copied like any entry.
- **Schema change in two releases** (`docs/architecture.md`, "Schema versions"): a migration
  replaces `log_entries_one_source` so an entry may have neither source (still never both),
  with pgTAP tests. Clients before this release drop such rows from the day view
  (`toEntry`), so their totals would be short: the second release raises `min_app_version`
  once every device runs the first.
- **Log as ingredients.** A recipe in the picker offers **Log as ingredients**: its
  ingredients go on the plate (phase 15), scaled to the servings chosen, to edit before
  logging.

**Acceptance criteria:**
- [ ] A quick add of 450 kcal and 30 g protein counts in the day and meal totals, syncs, and
  survives export and import.
- [ ] The database refuses an entry with both a food and a recipe, and accepts one with
  neither (pgTAP).
- [ ] A quick add never appears in search, **Recent**, or the meal list.
- [ ] Half a recipe of 4 servings logged as ingredients puts each ingredient on the plate at
  one eighth of its recipe amount.

**Implementation notes:** none yet.

## Phase 17 — Moving around and editing the log

**Status:** Not started

**Goal:** get to any day fast, see what's left, and fix several entries at once.

**Scope:**
- **Week strip.** The log screen shows the current week, Monday to Sunday, with each day's kcal
  against its target as a small ring; a tap opens that day. Swiping left or right moves a
  day. The date title still opens any day.
- **Eaten and left.** A toggle on the target bars switches kcal and protein between eaten and
  left (target minus eaten, shown as "over" past the target). The choice is remembered on the
  device.
- **Select entries.** A **Select** action on the log turns entries into checkboxes, with a
  toolbar: **Copy to…** (a day and meal), **Move to…** (a day and meal), **Remove**, and
  **Make a recipe** (food entries only, each at its logged servings; recipe and quick-add
  entries can't be ingredients, and the button says why).
- **Copy a day.** Copies every meal of a day to another day, like copying a meal.

**Acceptance criteria:**
- [ ] The strip marks today, and its rings match the day totals.
- [ ] Moving three entries to tomorrow's dinner keeps their values and order, in one
  transaction.
- [ ] **Make a recipe** from two food entries creates a recipe of those foods and servings.
- [ ] Copying a day copies each meal into the same meal on the other day.
- [ ] Swiping never fires while a dialog is open, and every action works without swiping.

**Implementation notes:** none yet.

## Phase 18 — Goal weight and maintenance mode

**Status:** Not started

**Goal:** aim at a weight, see when you'll reach it, then hold it there.

**Scope:**
- **Goal weight.** Losing or gaining takes a goal weight. The profile form shows, as you
  change the rate, the daily kcal it gives (from the latest maintenance estimate) and the
  projected date the trend reaches the goal weight. The check-in shows the projected date
  too.
- **Maintenance mode.** "Keep my weight" holds the trend inside a band around a target
  weight (by default the trend weight when chosen). Inside the band the rate is 0. When the
  trend leaves the band, the check-in sets a slow rate back toward it and says so; once back
  inside, the rate returns to 0. The band is plus or minus 1.5% of the target weight (the
  user's choice, 2026-11-22); the minimum width and the slow rate are settled at the phase's
  start in a decision record (proposal: at least 1 kg, and 0.25% of trend weight a week).
- **Reaching the goal.** When the trend reaches the goal weight, the check-in switches to
  maintenance mode at that weight and says so; you can change it in the profile.
- **Schema change:** `target_weight_kg` on `profile` (nullable, 20 to 400) and the check-in's
  mode on `checkins`, with pgTAP tests, shipped in two releases as the architecture requires.
- All calculations in `src/domain/` with property tests, including every safety limit that
  already applies (the 1% rate cap and the calorie floor).

**Acceptance criteria:**
- [ ] A synthetic history drifting 2 kg above the band gets a loss rate back toward it, then
  0 once inside, and the check-in explains each step.
- [ ] Inside the band, the targets equal maintenance (and the floor still applies).
- [ ] The projected date moves when the rate changes, and is absent while maintaining.
- [ ] Reaching the goal weight switches to maintenance mode at that weight.
- [ ] A device on the release before keeps syncing the profile without losing the goal
  weight.

**Implementation notes:** none yet.

## Phase 19 — Higher-calorie days

**Status:** Done (2026-11-22): deployed in 0.13.0, and the user's iPhone check passed

**Goal:** eat more on the days you choose, with the same weekly total.

**Scope:**
- The profile picks which weekdays get more kcal and how many more (a whole number). The other
  days get less, so the week's total stays seven times the daily target. Protein stays the
  same every day.
- The log screen, the week strip (phase 17), and the check-in show each day's own kcal
  target; the check-in shows the week's targets day by day.
- The calorie floor applies to every day: when a lower day would go below it, the app shows
  how much extra it can give the higher days, and limits the setting to that.
- **Schema change:** the chosen days and the extra amount on `profile`, with pgTAP tests. Both
  are nullable (not set) and listed in `addedColumns`, so older apps never clear them and one
  release is enough. The split is computed in `src/domain/`, so the database stores the
  choice, not each day's target (decision 0033).

**Acceptance criteria:**
- [x] For any choice of days and amount, the seven day targets add up to seven times the
  weekly daily target, within rounding to whole kcal (property test). (`src/domain/calorieDays.test.ts`)
- [x] No day goes below the calorie floor (property test). (`src/domain/calorieDays.test.ts`)
- [x] With no days chosen, every day's target equals today's single target.
  (`src/domain/calorieDays.test.ts`, and `src/ui/checkin/checkin.test.tsx` shows no week)

**Plan** (approved 2026-11-22): three PRs.

1. **Calculation:** decision 0033, `weekdayOf` in `src/domain/dates.ts`, and
   `src/domain/calorieDays.ts` with property tests.
2. **Schema:** `higher_kcal_days` (0 to 126: any weekdays but all seven) and
   `higher_kcal_extra` (0 to 5000 kcal), nullable and set together, on `profile`, pgTAP tests, generated types, profile schema version 2 with
   `addedColumns`, and export and import. Merged only after the user applies the migration to
   the hosted project.
3. **Screens:** the profile form (day checkboxes, the extra, and a week preview), today's own
   target on the log screen, and the week's targets on the check-in. Version 0.13.0.

**Implementation notes:**
- Each day's kcal target is worked out when shown (`dayTargets`, `weekPlan` in
  `src/data/checkins.ts`, and `useTargets(date)`), from the latest check-in's target and the
  higher of its floor and the profile's, the same floor the profile form checks. Check-ins
  and the maintenance estimate are unchanged. When the floor trims the extra, the log's
  target bars and the check-in say so.
- The columns are nullable (not set) rather than defaulting to 0, like carbs and fat
  (decision 0025), so a device that never had them can't clear another's setting; Dexie
  version 10 reads the profile again from the start, since older versions dropped the
  columns from the profile they pulled. No days chosen saves as `0` and `0`.
- The profile form refuses an extra above what the floor allows at the latest target, and
  says the most it can be. A later check-in that lowers the target trims the extra for that
  week, and the check-in says so; the saved setting stays.
- `src/data/limits.integration.test.ts` checks both ranges against the database.

## Phase 20 — Progress views

**Status:** Not started

**Goal:** see the week, the month, and your logging habits at a glance.

**Scope:**
- **This week.** Each day's kcal and protein against its targets, Monday to Sunday, with the
  week's average.
- **Intake against targets and maintenance.** The last 30 days of kcal as bars, with the
  target and the maintenance estimate as lines, and the average difference from each.
- **Habits.** The last 30 days as two grids: days with a weigh-in, and days marked
  complete, with "n of 7 this week" for each.
- **Weight ranges.** The weight chart gets 1 week, 1 month, 3 months, 6 months, 1 year, and
  all, replacing the 90-day switch, with the average and the change over the range.
- They live on a new **Progress** tab, the fifth (decided 2026-11-22: five tabs fit at 360
  pixels with 44-pixel targets, and the views need a screen of their own). Loaded on demand,
  within the bundle budget.

**Acceptance criteria:**
- [ ] Every number on these views comes from a tested function in `src/domain/`.
- [ ] Empty, partial, and full histories each show sensibly (no division by zero, no empty
  chart without a message).
- [ ] Charts have text alternatives, and axe passes in both themes at 360 pixels.

**Implementation notes:** none yet.
