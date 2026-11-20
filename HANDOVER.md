# Handover

Updated at the end of every session. Read this first.

## Where things stand

- **Date:** 2026-11-19.
- **Phase:** phase 1 (foundations) is built on `chore/scaffold` and passes `npm run check:full`
  locally.
- **GitHub:** private repository `Rishav30194/calorithm` created; `main` (plan, docs, and hooks)
  is pushed. `chore/scaffold` isn't: GitHub refuses a push that adds a workflow file until the
  GitHub CLI token has the `workflow` scope. The user runs
  `gh auth refresh -h github.com -s workflow`, then the branch is pushed and the PR opened.
- **Verified locally:** 20 unit tests, 24 pgTAP tests, the generated-types check, a 129.8 kB
  first load against the 200 kB budget, and 18 Playwright tests (sign-in, wrong password, tabs,
  refresh, sign-out, axe in light and dark, PWA install criteria) on phone and desktop sizes.
  The CI service set was also run locally and passes.

## Next

1. After the user refreshes the token, push `chore/scaffold` and open the phase 1 PR (both
   approved). Pushes use `git -c credential.helper='!gh auth git-credential'`, because git has
   no stored GitHub credentials and the global git config stays untouched.
2. Confirm CI passes on the PR; that closes the last open phase 1 criterion besides the manual
   PWA install.
3. Install the app from Chrome by hand once, then mark phase 1 done after the merge.
4. Start phase 2 (local database and sync) from `docs/phases.md`.

## Open questions

- Does Supabase's free plan include downloadable backups? The user checks in the dashboard.
- Exact rate limit of Supabase's built-in email sending. Matters only before friends join.

## Watch out for

- Local Supabase runs on ports 55320 to 55329. Start it with `npm run db:start` before
  `npm run dev`, `check:full`, or the e2e tests.
- The app and preview live under `/calorithm/`, also locally.
- npm 11 holds back `fsevents`'s install script; it's optional and not needed.
- 4 moderate `npm audit` findings sit in `vite-plugin-pwa`'s build-time dependencies (`glob`
  and `minimatch` through `workbox-build`). npm's only fix is a breaking downgrade. Shipped
  packages audit clean, and CI audits only those.
- Newer releases exist but are under 7 days old on 2026-11-19, so they stay pinned back:
  Biome 2.6.8, `@playwright/test` 1.65.1, `@supabase/supabase-js` 2.119.2, Testing Library
  `jest-dom` 8.0.0 (a major) and `user-event` 14.6.13, Vitest 5.1.1, fast-check 4.10.3, and the
  Supabase CLI 3.2.0. Recheck after 2026-11-26.
