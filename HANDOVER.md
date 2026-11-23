# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

Where things stand (session ended 2026-11-22): the app is live at
`https://rishav30194.github.io/calorithm/` as **0.12.1** (tag `v0.12.1`). Phases 1 to 11 are
done; phase 14 is done (the user's iPhone check passed, 2026-11-22); phase 13 is parked; phase 12
waits for the user's MacroFactor subscription. Foods from a barcode scan or a nutrition
label log one serving without the amount step (decision 0031); the user is fine with that,
since editing the entry's amount recalculates the totals. The hosted project has migrations through
`20261122050000`, and `min_app_version` is 0.3.0. The README matches 0.12.1 (2026-11-22);
update its features and status when a phase changes what users get.

1. **Phase 19 (higher-calorie days) is built, in three stacked branches:**
   `feature/phase-19-calorie-days` (calculation, decision 0033), `feature/phase-19-profile-columns`
   (migration `20261122060000_profile_higher_kcal_days.sql`, Dexie version 10), and
   `feature/phase-19-screens` (0.13.0), on top of `chore/plan-phases-15-to-20`. The migration
   must reach the hosted project (`docs/production.md`, step 6) before the columns PR merges,
   since every push to `main` deploys. `/code-review` found 8 issues: 7 are fixed, and the
   extra-kcal field keeps the numeric keypad of the calorie floor field. `/security-review`
   found nothing. After deploy: check on the iPhone that the profile saves weekend days and
   the log shows that day's target, then set phase 19 to Done.
2. **The other phases, 15 to 18 and 20** (added 2026-11-22 from MacroFactor's "Getting Started" video, the user's
   picks): a plate and meal suggestions, quick add, log navigation and selection, goal weight
   and maintenance mode, higher-calorie days, and progress views. Kcal and protein stay the
   only targets. Start with phase 15's plan when the user says so; phases 18 and 19 each
   begin with a decision record.
3. **Phase 13 (nutrition label photos) is parked** at the user's request. It works on the
   iPhone but needs a close photo and sometimes misses fat, carbs, protein, or the serving
   size. Plan when resumed: the user puts 5 to 10 failing photos in `~/Downloads/labels`
   (used locally only, never committed); measure each change on them and keep what helps:
   read at higher resolution and enlarge small text (the 2000-pixel downscale in
   `labelReader.ts` is the likely cause), grayscale and contrast, try two Tesseract table
   modes and keep the reading with more values, teach the parser real misreads (columns
   read separately, "g" read as "9"), show the read text beside the form with **Fix the
   text**, and maybe a crop step. Workaround meanwhile: crop to the table in Photos first.
   The first photo downloads about 4.5 MB (checked on the live site).
4. Optional iPhone check: **Export changes** in the sign-out warning. It shows only when
   signing out with changes that haven't synced (for example, log an entry offline, then
   sign out). **Export data** in settings and **Import data** passed on the user's iPhone
   (2026-11-22).
5. On or after 2026-11-26, recheck the held-back package versions under "Watch out for".
6. **Phase 12** (review against MacroFactor) stays on hold until the user has the
   subscription.

How the user works: macros only (kcal, protein, carbs, fat), no AI logging, no bulk food
database, Indian foods with no beef or pork. The user asks for push, PR, and merge
explicitly each time (usually "push, open the PR, and merge" in one message); the
permission check blocks a push they haven't asked for. Plans need approval before code; the
user usually picks the recommended option in a question.

How releases go: bump the version for each user-facing release (`docs/development.md`,
"Versions and tags"). A PR with a migration waits until the user applies it to the hosted
project (`docs/production.md`, step 6, VPN off; the user runs the commands Claude gives,
from the branch that holds the migration), because every push to `main` deploys at once
while CI is paused. After the user applies one, check the columns through the public API:
a missing column returns 42703 ("does not exist"), an existing one 42501 (permission
denied for anonymous requests); the URL and publishable key are in the live bundle.

The hosted test account (the user knows which) holds the user's phone entries and a few
test foods; never delete it or its data without the user's approval. If not yet done, the
user deletes the Keychain item: `security delete-generic-password -s calorithm-supabase-db`.

Pushes and fetches use `git -c credential.helper= -c 'credential.helper=!gh auth git-credential'`
(then `push` or `fetch`), because git has no stored GitHub credentials and the global git config stays untouched.

## Open questions

- Does a browser retry a failed dynamic import (the built-in food list) without a page
  reload? The picker's **Try again** resets the hook either way; check on the iPhone by
  searching offline before the list is cached, then online.
- Does Supabase's free plan include downloadable backups? The user checks in the dashboard.
- Exact rate limit of Supabase's built-in email sending. Matters only before friends join.
- Open Food Facts asks apps to name themselves in the User-Agent, which browsers can't set;
  the app sends `X-User-Agent` instead (decision 0029), which their API accepts from any
  origin but their docs don't mention. Their docs also ask apps to fill in a usage form;
  that's the user's call.
- How well Open Food Facts covers Indian brands isn't measured: the user's first real scans
  worked (2026-11-22), but no count of misses exists. If misses pile up, consider a note in
  the picker or another source.

## Watch out for

- CI is paused (2026-11-21, the user's request, to speed up feature work): `ci.yml` runs only
  by hand, and `deploy.yml` deploys every push to `main`. `npm run check:full` before each
  PR is the only gate, so never skip it. Turn CI back on when the app moves to maintenance:
  restore the triggers in `ci.yml` and the `workflow_run` trigger in `deploy.yml`.
- `e2e/account.spec.ts` deletes `delete.me@calorithm.test`; `e2e/database.ts` puts it back
  first with `docker exec supabase_db_calorithm psql`. The container name comes from
  `project_id` in `supabase/config.toml`.

- The camera tests (`e2e/camera.spec.ts`) run on the full Chromium build
  (`channel: 'chromium'`), because Playwright's headless shell has no camera capture. CI's
  `playwright install chromium` should install both; unverified while CI is paused.
- Open Food Facts allows 15 product reads a minute per IP address; probing it by hand during
  development hits that quickly.
- `vite.config.ts` copies the label reader's English data to `tessdata/eng-VERSION/`,
  because tesseract.js 7.0.0 can't take language data directly (it uses the data as the
  language's name). Recheck this when upgrading tesseract.js.
- Local Supabase runs on ports 55320 to 55329. Start it with `npm run db:start` before
  `npm run dev`, `check:full`, or the e2e tests.
- The app and preview live under `/calorithm/`, also locally.
- First-load JavaScript is 188.8 kB of the 200 kB budget (0.13.0, 2026-11-22); the log,
  food, and backup screens and the built-in food list load on demand. A new screen of any
  size, and the barcode scanner, should too.
- The built-in food list is rebuilt from USDA CSV downloads that aren't committed;
  `docs/catalog.md` explains it. The build refuses ambiguous portions and changed
  descriptions. Items USDA lacks (CoFID values and labelled estimates) live in
  `scripts/catalog/other.json`; `node scripts/build-catalog.mjs --keep-usda` rebuilds them
  without the downloads. CoFID's Open Government Licence needs its attribution statement
  wherever its values show; the picker and the food editor carry it.
- Built-in items hide once copied, so a browser test that picks one first removes the seed
  user's copy (`removeBuiltInCopies` in `e2e/database.ts`) and runs in the desktop project
  only.
- The browser tests run a production build, so React's development double-run isn't covered.
  After changing `DataProvider`, also check `npm run dev` for console errors. Another project's service worker
  at `localhost:4173/` can take over the page; use incognito or unregister it in DevTools.
- The phase 3 log browser tests use a "bowl (40 g)" unit, a piece with a weight, so they
  still log in one tap; a food with a g or ml unit opens the amount step (decision 0031).
- Two browser tests fail now and then: `e2e/weight.spec.ts` "switch without changing
  stored values" and `e2e/log.spec.ts` "a day is marked complete and stays so after a
  reload" (the third, in `sync.spec.ts`, is fixed; see its note). None failed in three full runs of the suite on 2026-11-22 (402
  passed each time). Local runs now keep a trace of every failure in `test-results/`
  (`playwright.config.ts`); when one recurs, open it with `npx playwright show-trace` and fix
  the cause from it, without weakening what the test asserts. Notes on each follow.
- `e2e/weight.spec.ts` "switch without changing stored values" failed once in a full local
  run (2026-11-22) and passed on its own and in later full runs.
- `e2e/log.spec.ts` "a day is marked complete and stays so after a reload" failed once in a
  full run (2026-11-22, desktop): the bottom navigation intercepted the click while the page
  scrolled, and the checkbox didn't change. It passed 16 of 16, then 30 of 30, on its own.
- End-to-end tests that write food or log rows use unique names and random far-future days,
  because the local database keeps rows between runs and both projects share users.
- The sign-out end-to-end tests change `second.user@calorithm.test`'s profile and skip the
  phone project, as `sync.spec.ts` does for the seed user.
- `e2e/sync.spec.ts` "a change made offline reaches the server" failed now and then since
  PR #11. Its first local trace (2026-11-22) showed the cause: the test read the units before
  the first pull reached the screen, so the unit it picked was already the server's and the
  check changed nothing. It now waits for "Everything is synced" first. If it fails again,
  read the new trace.
- An editor formatter reformatted the Markdown tables in `docs/architecture.md` outside
  any edit during PR 1; check `git diff` for unrelated doc changes before committing.
- Every new table needs explicit grants in its migration: neither local (since
  `auto_expose_new_tables = false`) nor hosted Supabase grants anything by default.
  `supabase/tests/privileges.test.sql` checks the exact set for each table; add new tables
  to it.
- Local Supabase accepts a wrong publishable key; hosted refuses it with `Invalid API key`
  (checked 2026-11-21). Test key handling against hosted, not local.
- Supabase CLI 3.x commands such as `db push` and `migration list` target the local
  database unless given `--remote`, even with a project linked. The first hosted push
  (2026-11-21) went to local Docker for this reason.
- `/security-review` needs `origin/HEAD`; in a fresh setup run `git remote set-head origin main`.
- npm 11 holds back `fsevents`'s install script; it's optional and not needed.
- 4 moderate `npm audit` findings sit in `vite-plugin-pwa`'s build-time dependencies (`glob`
  and `minimatch` through `workbox-build`). npm's only fix is a breaking downgrade. Shipped
  packages audit clean, and CI audits only those.
- Newer releases exist but were under 7 days old on 2026-11-19, so they stay pinned back:
  Biome 2.6.8, `@playwright/test` 1.65.1, `@supabase/supabase-js` 2.119.2, Testing Library
  `jest-dom` 8.0.0 (a major) and `user-event` 14.6.13, Vitest 5.1.1, fast-check 4.10.3, and the
  Supabase CLI 3.2.0. Recheck after 2026-11-26.
