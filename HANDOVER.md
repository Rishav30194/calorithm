# Handover

Next steps, open questions, and warnings for the next session. Branch, push, PR, and CI state
aren't recorded here: the session-start hook prints them live. Phase status is in
`docs/phases.md`.

## Next

1. Phase 7 (production) PR 1 is merged as #27: the deploy and keep-awake workflows,
   `docs/production.md`, and decision 0024 (public repository). Next, the user follows
   `docs/production.md`: make the repository public, set **Pages** to **GitHub Actions**,
   create the hosted Supabase project, apply the migrations, set the two secrets, then run
   the six checks. Record each result in `docs/phases.md` and mark the phase done when all
   pass. Deploy runs after #27's merge fail at the secret check until the secrets are set;
   that's expected. Then run **Deploy** by hand from `main`.
   Done by the user on 2026-11-21: repository public, **Pages** source set to **GitHub
   Actions**, hosted project `calorithm` created, sign-ups off. Pending: **Secure password
   change** (inside the **Email** provider panel), **Site URL** (the dashboard refused the
   trailing-slash form; the guide now gives it without one), then migrations, secrets, and
   the checks.
   Migrations: all 14 applied to the hosted project on 2026-11-21 by Claude, with the
   user's one-off approval (the database password came from the user's macOS Keychain item
   `calorithm-supabase-db`; the pooler timed out while the user's VPN was on). The hosted
   project doesn't grant table privileges automatically, unlike local Supabase, and no
   migration granted them, so `anon` got "permission denied" on `app_config`. Migration
   `20261121090000_grant_table_privileges.sql` grants them, and local Supabase now runs with
   `auto_expose_new_tables = false` so it matches hosted. After that PR merges, the user
   applies it to the hosted project (`docs/production.md`, step 6; the hook blocks Claude
   from pushing), Claude reruns the read-only hosted checks, and the user deletes the
   Keychain item: `security delete-generic-password -s calorithm-supabase-db`. Sign-ups
   still read `disable_signup: false` although the dashboard shows them off; the user is
   sending a screenshot.
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

- `vite.config.ts` still says the **Update available** prompt "arrives (phase 6)". It's a
  comment in build config, which needs the user's approval to change; fix it with the next
  approved config change.

- `e2e/account.spec.ts` deletes `delete.me@calorithm.test`; `e2e/database.ts` puts it back
  first with `docker exec supabase_db_calorithm psql`. The container name comes from
  `project_id` in `supabase/config.toml`.

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
