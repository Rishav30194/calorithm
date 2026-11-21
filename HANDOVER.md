# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. Phase 6 PR 1 (export format and import, `src/data/backup/`, decision 0022) is on
   `feature/phase-6-export-format`. `/code-review` ran and all seven findings are fixed
   (deleted parents still in use are exported, the export reads in one transaction, column
   scales and far-future edit times are refused, edit times compare to the microsecond, birth
   dates check against the earlier of the local and UTC days, and the unproven casts are
   gone). `/security-review` found nothing at confidence 8 or higher. PR #22 waits for the
   user's review and squash-merge. PR 2 next: settings
   screen export and import, the last export date (`docs/architecture.md` says `sync_state`;
   its `SyncState` type doesn't fit, so decide the store there), and the check-in's 30-day
   reminder. End-to-end tests that look for a status message should scope it to a region: the
   settings screen has two. Plan for PRs 3 to 5: account deletion through `delete_account()`
   checking a recent password sign-in in the JWT's `amr` claim (verify its format locally
   first) plus a `delete.me@calorithm.test` seed user; the **Update available** banner; mark
   the phase done.
2. If the outbox query fails, `useOutbox` throws during render and the signed-in shell has
   no error state with a retry for it (found in the review of PR #15). Fix it in a small PR.
3. On a real iPhone, check that **Export changes** in the sign-out warning saves the file
   from the installed app.
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

## Watch out for

- Local Supabase runs on ports 55320 to 55329. Start it with `npm run db:start` before
  `npm run dev`, `check:full`, or the e2e tests.
- The app and preview live under `/calorithm/`, also locally.
- First-load JavaScript is 181.2 kB of the 200 kB budget (phase 5 PR 4); the log and food screens load as
  their own chunks. Phase 3 will likely need to load
  screens on demand.
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
- `/security-review` needs `origin/HEAD`; in a fresh setup run `git remote set-head origin main`.
- npm 11 holds back `fsevents`'s install script; it's optional and not needed.
- 4 moderate `npm audit` findings sit in `vite-plugin-pwa`'s build-time dependencies (`glob`
  and `minimatch` through `workbox-build`). npm's only fix is a breaking downgrade. Shipped
  packages audit clean, and CI audits only those.
- Newer releases exist but were under 7 days old on 2026-11-19, so they stay pinned back:
  Biome 2.6.8, `@playwright/test` 1.65.1, `@supabase/supabase-js` 2.119.2, Testing Library
  `jest-dom` 8.0.0 (a major) and `user-event` 14.6.13, Vitest 5.1.1, fast-check 4.10.3, and the
  Supabase CLI 3.2.0. Recheck after 2026-11-26.
