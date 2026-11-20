# Development

Commands, branches, commits, PRs, and releases. Phase 1 creates the scripts listed here.

## Prerequisites

- Node.js (the version in `.nvmrc`, which phase 1 adds)
- Docker, for local Supabase
- Git and the GitHub CLI (`gh`)
- `jq`, used by the Claude Code hooks

## Commands

| Command | Does |
|---|---|
| `npm ci` | Install exact dependency versions from the lockfile |
| `npm run dev` | Start the app against local Supabase |
| `npm run db:start` | Start local Supabase in Docker |
| `npm run db:stop` | Stop it |
| `npm run db:reset` | Rebuild the local database from migrations and `seed.sql` |
| `npm run db:types` | Regenerate `src/data/database.types.ts` |
| `npm run test` | Unit tests |
| `npm run test:db` | pgTAP database tests |
| `npm run test:e2e` | Playwright end-to-end tests with axe |
| `npm run check:fast` | Type check, `biome ci`, and unit tests: run before each commit |
| `npm run check:full` | Everything, plus the build and bundle size check: run before each PR |

## Adding a database change

1. Create the migration:

   ```sh
   npx supabase migration new WHAT_IT_DOES
   ```

   `WHAT_IT_DOES` is a short `snake_case` description, for example `add_days_table`.
2. Write the SQL: table, constraints, `updated_at` trigger, row-level security, and policy.
3. Write pgTAP tests in `supabase/tests/`.
4. Apply it locally:

   ```sh
   npm run db:reset
   ```

5. Regenerate the types:

   ```sh
   npm run db:types
   ```

6. Add the table to the Dexie schema with a new Dexie version and an upgrade test.

Never edit a migration that's on `main`. Fix it with a new one.

## Branches and commits

- Branch from `main` as `feature/`, `fix/`, or `chore/` plus a short slug.
- Commit messages are a short imperative sentence with no period, for example
  `Add pull overlap to sync`.
- Each commit passes `npm run check:fast`.

## Pull requests

- One PR is one phase or a clear part of one, ideally under 400 changed lines excluding
  generated files and lockfiles.
- Fill in `.github/pull_request_template.md`.
- CI must pass. The user reviews and squash-merges.

## Releases

- Every merge to `main` deploys to GitHub Pages (from phase 7).
- The user applies hosted migrations before merging a PR that needs them, and only migrations
  that work with the app version already deployed. See `docs/architecture.md`, "Schema
  versions".
- Raising `min_app_version` is a migration of its own, made after the new app version is live.

## Environment variables

| Variable | Holds | Where it's set |
|---|---|---|
| `VITE_SUPABASE_URL` | The Supabase project URL | `.env.local` for local work; GitHub Actions secret for deploys |
| `VITE_SUPABASE_ANON_KEY` | The anon key | Same |

`.env.example` lists the names with no values. The service-role key is never used by the app.
