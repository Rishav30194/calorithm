# Calorithm plan

Calorithm is a personal calorie and protein tracker. It logs food and weight, and it estimates
maintenance calories each week from your intake and weight trend, then adjusts your targets.

It starts with one user, but it's built so friends, and later paying customers, can use it
without a rewrite. The work that's cheap now and hard to add later is in this plan's build
steps. The rest waits in the checklists under "Growth checklists".

## Defaults

- **Stack:** Vite, React, TypeScript, Tailwind v4, vite-plugin-pwa, and GitHub Pages. The app installs on a phone.
- **Storage:** IndexedDB on the device through Dexie is the source of truth. Supabase (Postgres)
  is the sync copy, so data reaches other devices. The free plan is enough for one user.
- **Sign-in:** email and password through Supabase Auth. Sign-ups are turned off after your
  account exists, and row-level security limits every table to its owner. No magic links: on
  iOS they open in Safari, which doesn't share storage with the installed app.
- **Development database:** local Supabase in Docker through the Supabase CLI, run with `npx`.
  Schema changes are SQL migrations in `supabase/migrations/`.
- **Food data:** you enter your own foods and recipes. No built-in food database or barcode
  scanner. A shared catalog is in the checklist for customers.
- **Units:** kilograms and kilocalories, with pounds available as a setting.
- **Text and formats:** all interface text lives in one file, and numbers and dates are
  formatted with `Intl`, so translation can be added later without touching every screen.
- **Accessibility:** every screen meets WCAG 2.2 AA, checked by axe in the browser tests.
- **Decisions:** each significant choice gets a short record in `docs/decisions/`.
- **Git:** work on `feature/` branches and merge through PRs.

## Front-end libraries

| Concern | Choice | Why |
|---|---|---|
| Local data | Dexie | A small, typed wrapper over IndexedDB, with live queries that refresh the screen on change. |
| Validation | Zod | Checks form input, JSON imports, and rows arriving from sync. |
| Dates | `date-fns` | Local calendar dates are the most common source of bugs in calorie apps. |
| Charts | Hand-written SVG | A trend line and dots don't justify a chart library's bundle size. |
| Routing | Bottom tabs with hash routes | GitHub Pages can't serve paths a single-page app creates, so plain paths break on refresh. |
| Lint and format | Biome | One fast tool instead of ESLint plus Prettier. |
| Accessibility checks | `@axe-core/playwright` | Runs an accessibility scan on each screen in the browser tests. |

TypeScript runs with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.

## Code layout

- **`src/domain/`:** the calculations and their rules (trend, maintenance, targets, safety
  limits). No React and no browser APIs, so a Supabase Edge Function (TypeScript on Deno), a
  native app, or a reports job can reuse the same code.
- **`src/data/`:** the Dexie database, the sync, and the Supabase client.
- **`src/ui/`:** React screens and components.
- **`src/strings.ts`:** all interface text.

## Local-first sync

The app reads and writes only the local Dexie database, so every screen works the same online
or offline. A background sync moves changes between Dexie and Supabase:

1. **Push:** each local write also adds a row to an outbox table. The sync sends outbox rows to
   Supabase as upserts and removes each one after Supabase confirms it.
2. **Pull:** the sync asks Supabase for rows whose `updated_at` is later than the saved pull
   position, minus one minute, in pages ordered by `updated_at` and then `id`. A trigger sets
   `updated_at` to the transaction's start time, so a slow transaction can commit after a pull
   has passed its timestamp; the overlap fetches it on the next pull. Upserts are idempotent,
   so a row fetched twice is harmless.
3. **Conflicts:** each row also carries `client_updated_at`, the device's time of the edit. A
   trigger ignores an incoming update older than the stored row, so the most recent edit wins
   even when an older one syncs later. With one user, conflicts are rare.
4. **When it runs:** on app start, when the connection returns, when the app comes back to the
   foreground, and after each local write.

Every row has an ID created on the device, so resending a row never makes a duplicate. On
start, the app calls `navigator.storage.persist()` so the browser doesn't evict the local data.

**One local database per user.** The Dexie database name includes the user ID, and signing out
deletes that user's local database. A second person signing in on the same phone never sees or
syncs the first person's data. Sign-out syncs first; if unsent changes remain, it warns that
they'll be lost and offers an export before going ahead.

**Long-offline devices.** Soft-deleted rows are removed for good after 90 days. A device whose
last pull is older than that pushes its outbox, clears its local tables, and pulls everything,
so it can't keep rows whose deletion it never saw.

**Schema versions.** A phone can stay offline for weeks and still hold outbox rows in an old
shape. To handle that:

- Each row the app sends carries a `schema_version`.
- Schema changes ship in two releases: the first adds the new columns and accepts both shapes,
  and the second removes the old columns once no client sends the old shape.
- An `app_config` table holds the minimum supported app version. An older app shows a
  required **Update** screen and stops syncing until it updates.

## Data model

| Table | Holds |
|---|---|
| `profile` | Height, birth date, sex, activity level, units, goal rate, protein g per kg, calorie floor. |
| `foods` | Name, serving size and unit, kcal and protein per serving, archived flag. |
| `recipes` and `recipe_items` | A recipe's name and serving count, and the foods and amounts in it. |
| `log_entries` | Date, meal, a food or recipe, servings, and kcal and protein copied at log time. |
| `days` | Date and a **day complete** flag, set when you've logged everything you ate that day. |
| `weights` | Date and weight in kg, one row per day. |
| `checkins` | Week start, maintenance estimate, the kcal and protein targets set, and the inputs used. |
| `app_config` | The minimum supported app version. Readable by everyone, written only by migrations. |

Log entries copy kcal and protein when you log them, so editing a food later doesn't rewrite
past days.

Rules every user table follows:

- **Keys:** a `uuid` primary key created on the device.
- **Owner:** a `user_id` column with a row-level security policy written as
  `user_id = (select auth.uid())`, so the check runs once per query, not once per row.
- **Sync columns:** `updated_at`, set by a trigger to server time and used for pulling;
  `client_updated_at`, set by the device and used for conflicts; `deleted_at` for soft
  deletes, so deletions reach other devices; and `schema_version`, the shape the device wrote.
- **Dates:** food and weight dates are `date` values from the device's local day, never
  `timestamptz`, so a snack at 00:30 or a log made while traveling lands on the right day.
- **Numbers:** kcal is `integer`, protein `numeric(6,1)`, and weight `numeric(5,2)`. No floats.
- **Uniqueness:** `weights` and `days` have a unique index on `(user_id, date)`.
- **Database checks:** `CHECK` constraints, `NOT NULL`, and foreign keys enforce the rules, so a
  modified client can't write bad data. For example: `kcal >= 0`, `protein >= 0`,
  `servings > 0`, and weight between 20 and 400 kg.

TypeScript types for every table come from `supabase gen types typescript`, and CI fails if
they don't match the migrations.

## Features

| Area | What it does |
|---|---|
| Food log | Add foods by kcal and protein per serving. Re-log with one tap from today's, yesterday's, and your most-used entries. Copy a whole meal from an earlier day. Mark a day complete. |
| Recipes | Build a recipe from foods and set how many servings it makes. Log a fraction of it. Totals come from the ingredients. |
| Weight | One weigh-in per day. The chart shows raw weigh-ins and a smoothed trend line. |
| Targets | Daily kcal and protein targets with progress bars. You set a goal rate, for example −0.5 kg a week, within the safety limits. |
| Weekly check-in | Every 7 days the app estimates maintenance calories, shows how the estimate changed, and updates your targets. Shows a reminder when the last export is more than 30 days old. |
| Export and import | Download all your data as JSON, as a backup that doesn't depend on Supabase, and restore it from that file. The file carries a format version, and a Zod schema checks it on import. |
| Delete account | Deletes every row you own, your local database, and your sign-in account, after you enter your password to confirm. GDPR and Apple's App Store both require this. |
| Updates | When a new version is deployed, the app shows an **Update available** prompt and never reloads on its own. Below the minimum supported version, the update is required. |

## How the numbers work

1. **Trend weight:** an exponential moving average. Each weigh-in moves the trend 10% of the
   way toward it. Days without a weigh-in carry the trend forward.
2. **Starting maintenance estimate:** the Mifflin-St Jeor formula from height, weight, age, and
   sex, times an activity factor. Used only until about 2 weeks of your own data exist.
3. **Weekly estimate:** average daily intake over the last 28 days, plus 7,700 kcal for each
   kilogram the trend fell (minus 7,700 kcal for each kilogram gained), spread across the days
   in the window. Only days marked complete count toward the intake average, because a
   partly logged day pulls the estimate down. A week with fewer than 4 complete days skips
   its update.
4. **Smoothing the update:** the new estimate is blended with the previous one and moves at
   most 150 kcal a week, so one off week doesn't swing your targets.
5. **Targets:** calories = maintenance + (goal rate in kg a week × 7,700 ÷ 7). Protein = a
   grams-per-kg setting (1.6 to 2.2) times trend weight.
6. **Safety limits:** the calorie target never goes below the calorie floor (1,200 kcal by
   default, adjustable in the profile), and the goal rate is capped at 1% of trend weight a
   week, for losing or gaining. When a limit changes a target, the check-in says so.

All calculations live in `src/domain/` as plain TypeScript functions. The database stores
inputs and results; it doesn't run the calculation.

## Testing

- **Unit tests:** Vitest for the calculations, the sync, and components.
- **Calculation tests:** made-up histories where the right answer is known, plus property tests
  with fast-check. For example: the estimate never moves more than 150 kcal in a week, a flat
  trend with steady intake gives maintenance equal to intake, a week with too few complete
  days changes nothing, and no input produces a target below the floor.
- **Sync tests:** offline writes reach Supabase once the connection returns, a resent row makes
  no duplicate, the most recent edit wins a conflict even when it syncs first, a soft delete
  reaches the other device, a row committed late is still pulled, a row in the previous schema
  version is accepted, and signing out leaves no local data behind. The full list is in
  `docs/testing.md`.
- **Database tests:** pgTAP for row-level security (one user can't read or write another
  user's rows), the `CHECK` constraints, and account deletion removing every owned row.
- **Browser tests:** Playwright for logging food, adding a weigh-in, the weekly check-in, and
  deleting an account, run against local Supabase. Each screen also gets an axe scan.
- **CI:** GitHub Actions runs typecheck, Biome, Vitest, `supabase test db`, Playwright with
  axe, the generated-types check, and a bundle size budget on every PR.

## Free-plan safeguards

- **Pausing:** a free Supabase project pauses after a week with no requests. The app keeps
  working from local data while it's paused, and sync resumes once you restore the project. A
  weekly GitHub Actions job that reads one row keeps the project awake.
- **Backups:** check in the Supabase dashboard whether the free plan gives you downloadable
  backups. Until that's confirmed, the JSON export and its reminder are the backup.

## Build order

Each phase's scope, acceptance criteria, status, and implementation notes are in
[the phase plan](docs/phases.md).

1. Set up the project, CI, `docs/decisions/`, local Supabase, the schema with sync columns,
   database checks, and row-level security, generated types, and sign-in.
2. The Dexie database per user and the sync (outbox push, pull with overlap, conflicts, soft
   deletes, schema versions, and the minimum version check).
3. Foods, recipes, and the daily log with quick re-logging and the day complete flag.
4. Weight entry and the trend chart.
5. Targets, the maintenance calculation with safety limits, and the weekly check-in.
6. JSON export and import, the export reminder, account deletion, and the update prompt.
7. Create the hosted Supabase project, add the keep-awake job, deploy to GitHub Pages, and check
   it on a phone: install, offline use, sync between two devices, and the update prompt.

## Related documents

| Document | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Layers, sync, auth, offline, and failure modes |
| [docs/decisions/](docs/decisions/) | Why each major choice was made |
| [docs/testing.md](docs/testing.md) | The required test cases for each layer |
| [docs/security.md](docs/security.md) | Threats, controls, and data handling |
| [docs/development.md](docs/development.md) | Commands, branches, PRs, and releases |
| [docs/ai-workflow.md](docs/ai-workflow.md) | How AI-assisted work is planned, checked, and reviewed |

## Before step 7

- Create the Supabase project in the Supabase dashboard. You do this step yourself.
- Set the project URL and publishable key as GitHub Actions secrets. You set these values yourself;
  they never go in the repository.

## Growth checklists

These aren't built now. Each one can be added without changing the data model.

### Before friends join

- [ ] **Invite-only sign-up:** an `invites` table of codes, checked by a Supabase Auth hook or
  Edge Function, replaces turning sign-ups off.
- [ ] **Email sending:** connect a custom SMTP provider such as Resend. Supabase's built-in
  email sends only a few messages an hour (exact limit unverified).
- [ ] **Password reset and email confirmation:** complete flows in the app, with Playwright
  tests.
- [ ] **Error tracking:** Sentry's free plan with source maps, with food names and weights
  removed from reports because they're health data.
- [ ] **Staging:** a second Supabase project. Migrations reach production only through CI
  (`supabase db push`), never by hand.
- [ ] **Dependency and security hygiene:** Dependabot PRs and a `SECURITY.md` file.

### Before customers

- [ ] **Paid Supabase plan:** daily backups and no pausing. The Pro plan was about $25 a month;
  check current pricing.
- [ ] **Hosting with security headers:** move from GitHub Pages to Cloudflare Pages or Vercel
  with a custom domain, so the app can send a Content Security Policy and other headers.
- [ ] **Privacy and legal:** diet and weight data likely count as health data, a special
  category under GDPR. Add a privacy policy, explicit consent, a data region choice, terms of
  service, a medical disclaimer, and an 18+ age check, reviewed by a lawyer.
- [ ] **Shared food catalog:** a read-only `catalog_foods` table filled from Open Food Facts or
  USDA data. Users' own foods stay in `foods`, and log entries already copy their values.
- [ ] **More sign-in options:** Sign in with Apple and Google, and Cloudflare Turnstile on
  sign-up.
- [ ] **Payments:** Stripe, with an `entitlements` table that an Edge Function updates from
  Stripe's webhooks.
- [ ] **App stores:** wrap the PWA with Capacitor. Local-first storage carries over unchanged.
- [ ] **Product analytics:** PostHog, opt-in only.

### Not planned until a real need appears

Teams, sharing between users, an admin panel, a feature-flag service, microservices, and a
custom backend. Supabase with Edge Functions handles thousands of users.

## Status

Plan updated 2026-11-19: Supabase chosen for storage; local-first sync, stricter types and
tests, iOS fixes, free-plan safeguards, and the day complete flag added; then built for growth
with one local database per user, schema versions in sync, database checks, safety limits,
account deletion, accessibility checks, and the growth checklists. Development guardrails
(Claude Code hooks), `CLAUDE.md`, `README.md`, `HANDOVER.md`, and `docs/` added the same day.
Waiting for approval before step 1.
