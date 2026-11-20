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

**Status:** Not started

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
- [ ] `npm run check:full` passes locally and in CI.
- [ ] Signing in with the seeded synthetic user shows the empty shell; a wrong password shows
  an error.
- [ ] pgTAP proves one user can't read or write another's `profile` row.
- [ ] axe reports no violations on the sign-in screen and the shell.
- [ ] The production build installs as a PWA in Chrome.

**Implementation notes:** none yet.

## Phase 2 — Local database and sync

**Status:** Not started

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
- [ ] A Playwright test writes offline, goes online, and finds the row in Supabase.
- [ ] Two browser contexts as the same user see each other's changes.
- [ ] After sign-out, IndexedDB holds no database for that user.

**Implementation notes:** none yet.

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
