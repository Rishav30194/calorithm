# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. Phase 2 PR 3 (session) is built on `feature/session`: sign-out that syncs, warns with a
   JSON export of unsent changes, deletes the local database, then signs out (decision 0017);
   `storage.persist()` on start; cases 1, 14, 15, and 17 tested. `check:full` passed and
   `/code-review` findings are fixed. `/security-review` was running when the session ended;
   rerun it if no result is recorded in the PR description, then ask the user before pushing
   and opening the PR.
2. PR description must explain two review findings left as they are: the warning's count and
   export are a snapshot taken when the dialog opens (a later sync can send some of them), and
   counts in `src/strings.ts` aren't formatted with `Intl` (the existing sync strings do the
   same; fix all of them together).
3. When the PR merges, mark phase 2 done in `docs/phases.md`. Both acceptance criteria are
   already ticked.
4. On a real iPhone, check that **Export changes** saves the file from the installed app.
   The Safari workaround (link attached, URL revoked after 40 seconds) is untested on a device.
5. On or after 2026-11-26, recheck the held-back package versions under "Watch out for".

Pushes and fetches use `git -c credential.helper= -c 'credential.helper=!gh auth git-credential'`
(then `push` or `fetch`), because git has no stored GitHub credentials and the global git config stays untouched.

## Open questions

- Does Supabase's free plan include downloadable backups? The user checks in the dashboard.
- Exact rate limit of Supabase's built-in email sending. Matters only before friends join.

## Watch out for

- Local Supabase runs on ports 55320 to 55329. Start it with `npm run db:start` before
  `npm run dev`, `check:full`, or the e2e tests.
- The app and preview live under `/calorithm/`, also locally.
- First-load JavaScript is 172.1 kB of the 200 kB budget. Phase 3 will likely need to load
  screens on demand.
- The browser tests run a production build, so React's development double-run isn't covered.
  After changing `DataProvider`, also check `npm run dev` for console errors. Another project's service worker
  at `localhost:4173/` can take over the page; use incognito or unregister it in DevTools.
- The sign-out end-to-end tests change `second.user@calorithm.test`'s profile and skip the
  phone project, as `sync.spec.ts` does for the seed user.
- `/security-review` needs `origin/HEAD`; in a fresh setup run `git remote set-head origin main`.
- npm 11 holds back `fsevents`'s install script; it's optional and not needed.
- 4 moderate `npm audit` findings sit in `vite-plugin-pwa`'s build-time dependencies (`glob`
  and `minimatch` through `workbox-build`). npm's only fix is a breaking downgrade. Shipped
  packages audit clean, and CI audits only those.
- Newer releases exist but were under 7 days old on 2026-11-19, so they stay pinned back:
  Biome 2.6.8, `@playwright/test` 1.65.1, `@supabase/supabase-js` 2.119.2, Testing Library
  `jest-dom` 8.0.0 (a major) and `user-event` 14.6.13, Vitest 5.1.1, fast-check 4.10.3, and the
  Supabase CLI 3.2.0. Recheck after 2026-11-26.
