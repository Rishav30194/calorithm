## What and why

<!-- The phase and acceptance criteria this PR covers, and what changed. -->

Phase:
Covers:

## How it was verified

<!-- Commands run and their results, and what was checked in the running app. -->

- [ ] `npm run check:full` passes
- [ ] Used the feature in the running app (both themes, 360-pixel width for screens)
- [ ] Offline behavior checked, if the change touches data

## Review

- [ ] `/code-review` run; findings fixed or listed under "Open items"
- [ ] `/security-review` run, if the change touches auth, row-level security, sync, import, or account deletion
- [ ] Tests changed with code in `src/domain/` and `src/data/sync/`
- [ ] pgTAP tests cover any new table, policy, or constraint
- [ ] No dependency added without approval
- [ ] Docs updated: phase status, implementation notes, decision record if a choice was made

## Database

- [ ] No migration
- [ ] New migration, compatible with the app version already deployed (see `docs/architecture.md`, "Schema versions")

## Open items

<!-- Anything skipped, unverified, or left for later. "None" if nothing. -->
