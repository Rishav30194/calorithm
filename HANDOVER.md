# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. **Phase 14 is built**: PR 1 (0.10.0, logging by weight, #45) and PR 2 (0.11.0, built-in
   foods in recipes and on the Foods screen, #46) are deployed; PR 3 (0.12.0, spices from
   CoFID and labelled estimates, decision 0032) is on `feature/spice-gaps` with
   `check:full` done, no migration; push and open its PR when the user asks, then mark
   phase 14 done once the user has tried logging by weight on the iPhone. The hosted
   project has migrations through `20261122050000`; Dexie version 9 rereads each device's
   log entries once. Follow-up: route foods saved from a barcode scan or a label through
   the amount step.
2. **Phase 13 (nutrition label) is deployed as 0.9.0** (#43, with 0.8.0 and the phase 11
   close-out), ahead of phase 12, which waits for the user's MacroFactor subscription. Live
   check 2026-11-22: GitHub Pages serves the photo reader gzipped, so the first photo
   downloads about 4.5 MB (core 1.48 MB, worker 0.03 MB, English data 2.95 MB). The user
   tried it on the iPhone (2026-11-22): it works, but needs a close photo and sometimes
   misses fat, carbs, protein, or the serving size. **Improving it is parked** at the
   user's request. The plan when resumed: the user puts 5 to 10 failing photos in
   `~/Downloads/labels` (used locally only, never committed); measure each change on them,
   keeping what helps: read at higher resolution and enlarge small text (the 2000-pixel
   downscale in `labelReader.ts` is the likely cause of needing close photos), grayscale and
   contrast, try two Tesseract table modes and keep the reading with more values, teach the
   parser real misreads (columns read separately, "g" read as "9"), show the read text
   beside the form with **Fix the text**, and maybe a crop step. Phase 13 stays open until
   then; the workaround is cropping to the table in Photos first.
   Where things stand: phases 1 to 11 are done. The app is live at
   `https://rishav30194.github.io/calorithm/` as 0.11.0 (tag `v0.11.0`), with logging
   by weight, nutrition labels, barcode scanning, built-in foods, recent and frequent foods, and carbs and fat. The hosted
   project has migrations through `20261122040000`, and `min_app_version` is 0.3.0. The
   user's phone ran 0.7.0 before this deploy.
   The user wants macros only (kcal, protein, carbs, fat), no AI logging, no bulk food
   database, and Indian foods with no beef or pork.
   How releases go: bump the version for each user-facing release (`docs/development.md`,
   "Versions and tags"). A PR with a migration waits until the user applies it to the
   hosted project (`docs/production.md`, step 6, VPN off), because every push to `main`
   deploys at once while CI is paused. The user asks for push, PR, and merge explicitly
   each time; the permission check blocks a push they haven't asked for.
   The hosted test account (the user knows which) holds the user's phone entries and a few
   test foods; never delete it or its data without the user's approval. If not yet done,
   the user deletes the Keychain item: `security delete-generic-password -s
   calorithm-supabase-db`.
3. On a real iPhone, check that **Export changes** in the sign-out warning and **Export
   data** in settings save the file from the installed app, and that **Import data** opens
   the Files picker.
4. On or after 2026-11-26, recheck the held-back package versions under "Watch out for".

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

- A logged total past the database's range (for example 200 servings of an 80 g-carbs food:
  16000 g, over 10000) saves locally, then fails on sync as a refused change. This was
  already so for kcal and protein; the log picker could refuse such servings instead.
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
- First-load JavaScript is 187.2 kB of the 200 kB budget (0.9.0, 2026-11-22); the log,
  food, and backup screens and the built-in food list load on demand. A new screen of any
  size, and the barcode scanner, should too.
- The built-in food list is rebuilt from USDA CSV downloads that aren't committed;
  `docs/catalog.md` explains it. The build refuses ambiguous portions and changed
  descriptions.
- Built-in items hide once copied, so a browser test that picks one first removes the seed
  user's copy (`removeBuiltInCopies` in `e2e/database.ts`) and runs in the desktop project
  only.
- The browser tests run a production build, so React's development double-run isn't covered.
  After changing `DataProvider`, also check `npm run dev` for console errors. Another project's service worker
  at `localhost:4173/` can take over the page; use incognito or unregister it in DevTools.
- End-to-end tests that write food or log rows use unique names and random far-future days,
  because the local database keeps rows between runs and both projects share users.
- The sign-out end-to-end tests change `second.user@calorithm.test`'s profile and skip the
  phone project, as `sync.spec.ts` does for the seed user.
- `e2e/sync.spec.ts:52` (an offline change reaches the server, desktop) failed once and passed
  on retry in CI on PRs #11 to #15. It predates phase 4, and the `useOutbox` loading fix
  (PR #15) didn't stop it. Read the trace CI records on the first retry before changing it.
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
