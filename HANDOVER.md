# Handover

Updated at the end of every session. Read this first.

## Where things stand

- **Date:** 2026-11-19.
- **Phase:** planning done. Phase 1 hasn't started.
- **Repository:** the folder isn't a git repository yet, and no GitHub repository exists.
- **Written so far:** `PLAN.md`, `CLAUDE.md`, `README.md`, the `docs/` folder, the Claude Code
  hooks in `.claude/` (92 hook tests passing), `.gitignore`, and the PR template.
- **Hooks confirmed live:** a test command that read a `.env` file was blocked in this session.

## Next

1. Get the user's approval of `PLAN.md` and `docs/phases.md`.
2. Start phase 1 on `chore/scaffold`. Its first commit, on `main`, is these planning files.
3. Ask the user before installing dependencies; phase 1 lists them.

## Open questions

- Does Supabase's free plan include downloadable backups? The user checks in the dashboard.
- Exact rate limit of Supabase's built-in email sending. Matters only before friends join.

## Watch out for

- Hooks skip `npm run` checks until `package.json` exists, then require the `check:fast` and
  `check:full` scripts. Create both early in phase 1.
- The first commit on `main` is the only one the commit hook allows there.
