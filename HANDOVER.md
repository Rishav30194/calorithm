# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. Phase 3 PR 2 (calculations and storage) is built on `feature/food-storage`:
   `src/domain/nutrition.ts`, repositories in `src/data/foods.ts` and `src/data/log.ts`, day
   ids checked by the database (decision 0018), queued children (decision 0019), and two
   `log_entries` migrations (per-serving values and `logged_at`). `check:full` passed and
   `/code-review` findings are fixed. If no `/security-review` result is recorded in the
   PR description, run it, then ask the user before pushing and opening the PR.
2. Phase 3 PR 3: the foods and recipes screens, loaded on demand. They need hooks in
   `src/data/` over the repositories. Recipe items have no stored order, so the screen sorts
   them.
3. On a real iPhone, check that **Export changes** in the sign-out warning saves the file
   from the installed app.
4. Counts in `src/strings.ts` aren't formatted with `Intl`, which CLAUDE.md requires. Fix
   them all together in a small PR.
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
