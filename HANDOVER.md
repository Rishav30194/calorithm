# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. Phases 1 to 7 are done; phase 7 finished 2026-11-21. The app is live at
   `https://rishav30194.github.io/calorithm/` as version 0.2.0 (tag `v0.2.0`) against the
   hosted project. Phases 8 to 12 were added 2026-11-21 at the user's request: carbs and
   fat, recent and frequent foods, built-in Indian and gym foods, barcode scanning, then a
   review against MacroFactor once the user subscribes. The user wants macros only (kcal,
   protein, carbs, fat), no AI logging, and no bulk food database.
   Phase 8 is in progress (plan and decisions in `docs/phases.md` and decision 0025). PR 1
   (nullable columns, sync, Dexie version 6) is built and reviewed on its branch; both
   reviews' findings are fixed. **Before PR 1 merges, the user applies migration
   `20261122010000_carbs_and_fat.sql` to the hosted project** (`docs/production.md`, step
   6): every push to `main` deploys at once while CI is paused, and the new app sends
   carbs and fat columns the hosted database doesn't have yet. Next: PR 2 (totals, food
   form, recipes, log, copy and repeat; version 0.3.0), then PR 3 (export version 2). Bump the version
   for each release (`docs/development.md`, "Versions and tags"), and apply hosted
   migrations before merging the PR that needs them.
   The hosted test account (the user knows which) holds the user's phone entries; never
   delete it or its data without the user's approval. If not yet done, the user deletes the
   Keychain item: `security delete-generic-password -s calorithm-supabase-db`.
2. If the outbox query fails, `useOutbox` throws during render and the signed-in shell has
   no error state with a retry for it (found in the review of PR #15). Fix it in a small PR.
3. On a real iPhone, check that **Export changes** in the sign-out warning and **Export
   data** in settings save the file from the installed app, and that **Import data** opens
   the Files picker.
4. Counts in `src/strings.ts` aren't formatted with `Intl`, which CLAUDE.md requires. Fix
   them all together in a small PR.
5. `daysSpec` and `logEntriesSpec` accept dates before 2000-01-01, which the database refuses,
   so such a change would fail on every push. The screens never offer those dates. Weigh-ins
   are already checked (phase 4 PR 2); fix the other two together in a small PR.
6. On or after 2026-11-26, recheck the held-back package versions under "Watch out for".

Pushes and fetches use `git -c credential.helper= -c 'credential.helper=!gh auth git-credential'`
(then `push` or `fetch`), because git has no stored GitHub credentials and the global git config stays untouched.

## Open questions

- Does Supabase's free plan include downloadable backups? The user checks in the dashboard.
- Exact rate limit of Supabase's built-in email sending. Matters only before friends join.
- No hosted Supabase project exists yet (checked 2026-11-21: the user's account has only an
  unrelated project, which must not be linked). Phase 7's scope lists the hosted checks,
  including account deletion with a throwaway account.

## Watch out for

- CI is paused (2026-11-21, the user's request, to speed up feature work): `ci.yml` runs only
  by hand, and `deploy.yml` deploys every push to `main`. `npm run check:full` before each
  PR is the only gate, so never skip it. Turn CI back on when the app moves to maintenance:
  restore the triggers in `ci.yml` and the `workflow_run` trigger in `deploy.yml`.
- `e2e/account.spec.ts` deletes `delete.me@calorithm.test`; `e2e/database.ts` puts it back
  first with `docker exec supabase_db_calorithm psql`. The container name comes from
  `project_id` in `supabase/config.toml`.

- Local Supabase runs on ports 55320 to 55329. Start it with `npm run db:start` before
  `npm run dev`, `check:full`, or the e2e tests.
- The app and preview live under `/calorithm/`, also locally.
- First-load JavaScript is 183.8 kB of the 200 kB budget (CI on `main`, 2026-11-21); the
  log, food, and backup screens load on demand. A new screen of any size should too.
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
