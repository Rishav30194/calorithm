# Handover

Updated at the end of every session. Read this first.

## Where things stand

- **Date:** 2026-11-19.
- **Phase:** phase 1 (foundations) is built on `chore/scaffold` and passes `npm run check:full`
  locally. It isn't pushed: no GitHub repository exists yet.
- **`main`:** one commit with the plan, docs, and hooks.
- **Verified locally:** 20 unit tests, 24 pgTAP tests, the generated-types check, a 129.8 kB
  first load against the 200 kB budget, and 18 Playwright tests (sign-in, wrong password, tabs,
  refresh, sign-out, axe in light and dark, PWA install criteria) on phone and desktop sizes.
  The CI service set was also run locally and passes.

## Next

1. Create the GitHub repository, push `main` and `chore/scaffold`, and open the phase 1 PR.
   All three need the user's approval.
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
- Supabase CLI 3.2.0 is out; the project stays on 3.1.0 until 3.2.0 is at least 7 days old.
