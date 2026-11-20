# Calorithm

A calorie and protein tracker with a weekly maintenance estimate. One person uses it now, but
it's built to production standards so friends, and later paying customers, can use it without
a rewrite. It holds health data, so correctness and privacy come before speed of delivery.

## Read first

1. `HANDOVER.md`: where the work stands and what comes next.
2. `docs/phases.md`: the current phase, its scope, and its acceptance criteria.
3. `PLAN.md`: product scope, data model, and how the numbers work.
4. `docs/architecture.md`: how the app is built. Read it before touching sync or the schema.

This file holds the rules for how the work is done. Where a rule here and a document conflict,
this file wins; fix the document in the same PR.

At the end of every session, update `HANDOVER.md` and the phase status in `docs/phases.md`.

## Workflow

Follow `docs/ai-workflow.md`. In short:

1. **Plan before code.** For any change beyond a typo, state the files to touch, the approach,
   and the tests, then wait for approval. A direct instruction such as "do phase 2" is approval
   for that phase's written scope, not for changes outside it.
2. **Test first** in `src/domain/` and `src/data/sync/`: write the failing test, run it, see it
   fail, then write the code. A hook blocks commits that change code there without a test.
3. **Small steps.** One PR is one phase or one part of a phase. Commit each working step.
4. **Prove it.** Claim a result only after running it in this session. Report failing,
   skipped, and unfinished work without being asked.
5. **Review before the PR.** Run `/code-review` on the branch and `/security-review` when the
   change touches auth, row-level security, sync, or import. Fix or explain every finding in
   the PR description.
6. **Record decisions.** A choice between real alternatives gets a record in
   `docs/decisions/`, in the same PR.

## Grounding

- Never invent an API, option, or command. Check the installed version's type definitions in
  `node_modules`, or the official documentation for that version. The session-start hook
  prints the installed versions.
- When a fact is unverified, say so in the code comment, PR, or reply.
- Use only synthetic data in tests, seeds, fixtures, and prompts. Never paste real food logs or
  weights into anything.

## Guardrails

Hooks in `.claude/hooks/` enforce these rules mechanically; `.claude/settings.json` wires them
up. Never bypass, disable, or weaken a hook, and never use `--no-verify`. When a hook blocks
something that looks right, stop and tell the user.

| Hook | Enforces |
|---|---|
| `guard-bash.sh` | No `.env` reads or redirects into `.env` files. Commits: not on `main`, no `.env` file, tests change with `src/domain/` and `src/data/sync/` code, a pgTAP test changes with any migration that creates a table, and `npm run check:fast` passes. Pushes: not from `main`, never forced. `gh pr create`: `npm run check:full` passes. No reset or push to a linked database. |
| `guard-edit.sh` | No `.env` writes. Migrations on `main` are append-only. `src/data/database.types.ts` and `package-lock.json` are never edited by hand. |
| `check-edit.sh` | After each edit: Biome formats and lints the file, and `src/domain/` stays free of React, Dexie, Supabase, the data and UI layers, browser APIs, clock reads, and randomness. |
| `check-stop.sh` | A turn can't end with uncommitted code that fails `npm run check:fast` unless the failure is reported. |
| `session-context.sh` | Prints the date, git state, current phase, and installed versions at session start. |

After changing any hook, run `bash .claude/hooks/test-hooks.sh`; every case must pass.
Changes to `.claude/` and `.github/workflows/` need the user's approval.

## Needs the user's approval

- Adding, removing, or upgrading a dependency. State what it's for and its bundle cost.
- Deleting or renaming files.
- Changing `package.json` scripts, build config, CI, or anything in `.claude/`.
- Pushing, opening or merging a PR.
- Anything against the hosted Supabase project: `supabase link`, `db push`, or dashboard
  settings. Claude never runs these; the user does.

## Commands

Phase 1 creates these `package.json` scripts. Their names are a contract: the hooks and CI call
them.

| Script | Runs |
|---|---|
| `npm run dev` | The app against local Supabase |
| `npm run check:fast` | Type check, `biome ci`, unit tests |
| `npm run check:full` | `check:fast`, database tests, generated-types check, end-to-end tests with axe, production build, bundle size check |
| `npm run test` | Vitest |
| `npm run test:db` | pgTAP tests against local Supabase |
| `npm run test:e2e` | Playwright against a local build |
| `npm run db:start`, `npm run db:stop` | Start and stop local Supabase in Docker |
| `npm run db:reset` | Rebuild the local database from migrations and seed data |
| `npm run db:types` | Regenerate `src/data/database.types.ts` from the local schema |

## Layout

```
src/
  domain/       calculations and rules; no React, Dexie, Supabase, or browser APIs
  data/         Dexie database, repositories, Supabase client, generated types
    sync/       outbox push, pull, conflicts, schema versions
  ui/           screens and components, one folder per feature
  strings.ts    all interface text
supabase/
  migrations/   schema, policies, constraints (append-only)
  tests/        pgTAP tests
  seed.sql      synthetic local data
e2e/            Playwright tests
docs/           architecture, phases, decisions, workflow
```

## Architecture rules

- **The local database is the app's source of truth.** Screens read and write Dexie only.
  Only `src/data/sync/` talks to Supabase for data; only `src/data/auth.ts` talks to it for
  sign-in.
- **The hosted database is the authority on rules.** Ownership, ranges, and uniqueness live in
  Postgres as row-level security, `CHECK` constraints, and unique indexes. The app repeats a
  rule only for faster feedback.
- **Components never touch Dexie directly.** A screen calls a hook from `src/data/`, which
  calls a repository function.
- **Domain code is pure.** `src/domain/` functions take data and today's date as arguments and
  return values. They never read the clock, storage, or network.
- **Every write goes through the outbox.** A repository writes the row and its outbox entry in
  one Dexie transaction.
- **Dates are local calendar days.** Food and weight dates are `YYYY-MM-DD` strings from the
  device's local day. Never store them as moments.
- **No floats for stored quantities.** kcal is an integer; protein has one decimal and weight
  two, rounded at the boundary.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are on.
- No `any`, no non-null `!`, no `@ts-ignore`. An `as` cast is allowed only after a Zod parse or
  a type guard has proved the shape.
- Parse every value that crosses a boundary with Zod: form input, rows from sync, imported
  JSON, and URL parameters.
- Database rows use the generated types. Never hand-write a type for a table.
- Named exports only. Model a fixed set of states as a union and handle it with an exhaustive
  `switch`.
- An expected failure returns a typed result. Throw only for bugs.

## Interface

- Every screen handles loading, empty, error with a retry, and loaded.
- No user-facing text in components; it lives in `src/strings.ts`. Format numbers and dates
  with `Intl`.
- Design for a 360-pixel-wide screen first. Touch targets are at least 44 pixels, input text
  at least 16 pixels so iPhone doesn't zoom, and numeric fields use `inputmode="decimal"`.
- Accessibility is a requirement: a label on every input, a name on every icon button, visible
  focus, and 4.5 to 1 text contrast. The end-to-end tests run axe on every screen.
- Light and dark themes follow the system setting through theme tokens, never fixed colors.

## Database

- **Migrations are append-only.** A migration on `main` is never edited; fix it with a new one.
- One logical change per migration, named `YYYYMMDDHHMMSS_what_it_does.sql`.
- Every user table has a device-created `uuid` key, `user_id`, `updated_at` set by trigger,
  `client_updated_at` with the trigger that skips older updates, `deleted_at`,
  `schema_version`, row-level security enabled in the creating migration, and the policy
  `user_id = (select auth.uid())`. See `docs/architecture.md`, "Sync".
- Schema changes that clients see ship in two releases: add and accept both shapes, then
  remove the old shape once no client sends it. See `docs/architecture.md`, "Schema versions".
- Every table and policy gets pgTAP tests in the same PR.

## Tests

- `src/domain/`: example tests plus fast-check property tests for every calculation.
- `src/data/sync/`: tests for every case in `docs/testing.md`, "Sync".
- Tests live next to the code as `*.test.ts`. End-to-end tests live in `e2e/`.
- Never delete, skip, or weaken a failing test to make a check pass. Fix the code, or stop and
  explain why the test is wrong.

## Git

- Branches: `feature/`, `fix/`, or `chore/`. Never commit to `main`.
- Commit messages: a short imperative sentence, no period.
- PRs use `.github/pull_request_template.md` and are squash-merged by the user.

## Secrets

- Never read, print, or write `.env` files. The only committed one is `.env.example`.
- The Supabase service-role key never appears in the app, the repository, or a prompt. The app
  uses only the anon key, and row-level security protects the data.
- If a task needs a key, tell the user which one to set and where.
