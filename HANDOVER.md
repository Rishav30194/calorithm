# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. Phase 2 PR 1 (engine) is merged. Build PR 2 (live wiring) on `feature/sync-wiring`,
   test first, from the plan in `docs/phases.md`. The Supabase adapter must:
   - make `upsert` return the stored rows (`.select()`); rows skipped as older are missing
     from the result, and push depends on that
   - implement `getRows` by id
   - map errors to `network`, `auth`, and `rejected` per decision 0014
   - validate the cursor before building PostgREST `or()` filters: a UUID pattern for `id`,
     and the `normalize()` timestamp check for `updated_at` (from the PR 1 security review)
2. On or after 2026-11-26, recheck the held-back package versions under "Watch out for".

Pushes use `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`,
because git has no stored GitHub credentials and the global git config stays untouched.

## Open questions

- Does Supabase's free plan include downloadable backups? The user checks in the dashboard.
- Exact rate limit of Supabase's built-in email sending. Matters only before friends join.

## Watch out for

- Local Supabase runs on ports 55320 to 55329. Start it with `npm run db:start` before
  `npm run dev`, `check:full`, or the e2e tests.
- The app and preview live under `/calorithm/`, also locally. Another project's service worker
  at `localhost:4173/` can take over the page; use incognito or unregister it in DevTools.
- `/security-review` needs `origin/HEAD`; in a fresh setup run `git remote set-head origin main`.
- npm 11 holds back `fsevents`'s install script; it's optional and not needed.
- 4 moderate `npm audit` findings sit in `vite-plugin-pwa`'s build-time dependencies (`glob`
  and `minimatch` through `workbox-build`). npm's only fix is a breaking downgrade. Shipped
  packages audit clean, and CI audits only those.
- Newer releases exist but were under 7 days old on 2026-11-19, so they stay pinned back:
  Biome 2.6.8, `@playwright/test` 1.65.1, `@supabase/supabase-js` 2.119.2, Testing Library
  `jest-dom` 8.0.0 (a major) and `user-event` 14.6.13, Vitest 5.1.1, fast-check 4.10.3, and the
  Supabase CLI 3.2.0. Recheck after 2026-11-26.
