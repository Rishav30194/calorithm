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

**Status:** In progress

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
- [ ] Every sync case in `docs/testing.md`, "Sync", has a passing test.
- [x] A Playwright test writes offline, goes online, and finds the row in Supabase. (A second
  device reads it back from Supabase: `e2e/sync.spec.ts`.)
- [x] Two browser contexts as the same user see each other's changes.
- [ ] After sign-out, IndexedDB holds no database for that user.

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

**Status:** Not started

**Goal:** logging a day's food takes seconds.

**Scope:**
- Migrations and pgTAP tests for `foods`, `recipes`, `recipe_items`, `log_entries`, and `days`.
- Food and recipe editors, archiving, recipe totals.
- Today's log by meal, with one-tap re-logging from today, yesterday, and most used.
- Copy a meal from an earlier day. Mark a day complete.
- Daily kcal and protein totals.

**Acceptance criteria:**
- [ ] Logging a saved food takes at most two taps from the log screen.
- [ ] Editing a food doesn't change any past log entry (unit and end-to-end tests).
- [ ] A log made at 00:30 lands on that calendar day.
- [ ] Constraints reject negative kcal, zero servings, and similar values (pgTAP).
- [ ] axe passes on every new screen.

**Implementation notes:** none yet.

## Phase 4 — Weight and the trend chart

**Status:** Not started

**Goal:** daily weigh-ins with a trend line you can trust.

**Scope:**
- `weights` migration and pgTAP tests.
- Weigh-in entry, one per day, in kg or lb.
- `src/domain/trend.ts` with example and property tests.
- SVG chart of weigh-ins and the trend, with an accessible text summary.

**Acceptance criteria:**
- [ ] Trend matches hand-computed values for the test histories.
- [ ] Property tests: the trend stays between the lowest and highest weigh-in, and missing days
  carry it forward.
- [ ] A second weigh-in on the same day replaces the first.
- [ ] Units switch without changing stored values.

**Implementation notes:** none yet.

## Phase 5 — Targets and the weekly check-in

**Status:** Not started

**Goal:** the app sets your targets from your own data each week.

**Scope:**
- `checkins` migration and pgTAP tests.
- `src/domain/maintenance.ts` and `src/domain/targets.ts`, including safety limits.
- Profile screen: height, birth date, sex, activity, goal rate, protein g per kg, calorie floor.
- Progress bars on the log screen.
- Weekly check-in screen: the estimate, how it changed, targets, and any limit applied.

**Acceptance criteria:**
- [ ] Every property listed in `docs/testing.md`, "Calculations", has a passing test.
- [ ] Synthetic 12-week histories give estimates within 50 kcal of their known maintenance.
- [ ] No input produces a target below the calorie floor or a rate above the cap.
- [ ] A week with fewer than 4 complete days leaves targets unchanged and says why.

**Implementation notes:** none yet.

## Phase 6 — Export, import, account deletion, and updates

**Status:** Not started

**Goal:** you own your data and can leave with it.

**Scope:**
- Versioned JSON export with a Zod schema, and import that validates before writing.
- Export reminder on the check-in screen after 30 days.
- Delete account: password confirmation, an Edge Function or database function that removes
  every owned row and the auth user, then local data.
- **Update available** prompt.

**Acceptance criteria:**
- [ ] Export then import into a fresh account reproduces every row (round-trip test).
- [ ] A malformed or newer-version file is rejected with a clear message and writes nothing.
- [ ] pgTAP proves account deletion leaves no rows for that user.
- [ ] A new deployment shows the update prompt without reloading on its own.

**Implementation notes:** none yet.

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
