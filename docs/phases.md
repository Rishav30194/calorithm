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

**Status:** In progress

**Goal:** you own your data and can leave with it.

**Scope:**
- Versioned JSON export with a Zod schema, and import that validates before writing.
- Export reminder on the check-in screen after 30 days.
- Delete account: password confirmation, an Edge Function or database function that removes
  every owned row and the auth user, then local data.
- **Update available** prompt.

**Acceptance criteria:**
- [x] Export then import into a fresh account reproduces every row (round-trip test).
- [x] A malformed or newer-version file is rejected with a clear message and writes nothing.
- [x] pgTAP proves account deletion leaves no rows for that user.
- [x] A new deployment shows the update prompt without reloading on its own.

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
  Chromium refuses a worker update whose script Playwright intercepts, hence the server.

## Phase 7 — Production

**Status:** Not started

**Goal:** the app runs on your phone against the hosted database.

**Scope:**
- The user creates the hosted Supabase project, turns off sign-ups, and sets the GitHub
  Actions secrets.
- The user applies migrations to the hosted project.
- Deploy workflow to GitHub Pages.
- Weekly keep-awake workflow.

**Acceptance criteria:**
- [ ] The live app installs on the phone and opens offline.
- [ ] An entry made on the phone appears on a laptop, and the reverse.
- [ ] A new deployment shows the update prompt on the phone.
- [ ] The keep-awake workflow has run successfully once.
- [ ] Export from the live app downloads a valid file.

**Implementation notes:** none yet.
