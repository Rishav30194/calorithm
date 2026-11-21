# Decision records

Each file records one significant choice: the context, the decision, the alternatives, and the
consequences. Records are never edited after they're accepted, except for status and links. To
change a decision, write a new record that supersedes the old one.

## When to write one

- Choosing between real alternatives: a library, a protocol, a data shape, a host.
- Loosening a rule in `CLAUDE.md` or a hook.
- Accepting a known risk.

## How

1. Copy `template.md` to `NNNN-short-title.md`, using the next number.
2. Fill it in, with status `Proposed`.
3. Merge it in the PR that implements it; the status becomes `Accepted`.

## Index

| Number | Decision | Status |
|---|---|---|
| [0001](0001-record-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-supabase-for-sync-and-auth.md) | Supabase for sync and sign-in | Accepted |
| [0003](0003-local-first-with-dexie.md) | Local-first storage with Dexie | Accepted |
| [0004](0004-sync-protocol.md) | Sync with an outbox, last write wins, and pull overlap | Accepted |
| [0005](0005-calculations-in-a-pure-domain-module.md) | Calculations in a pure domain module | Accepted |
| [0006](0006-static-hosting-on-github-pages.md) | Static hosting on GitHub Pages with hash routes | Accepted |
| [0007](0007-email-and-password-sign-in.md) | Email and password sign-in | Accepted |
| [0008](0008-biome-for-lint-and-format.md) | Biome for lint and format | Accepted |
| [0009](0009-safety-limits-on-targets.md) | Safety limits on targets | Accepted |
| [0010](0010-ai-development-guardrails.md) | Guardrails for AI-assisted development | Accepted |
| [0011](0011-typescript-7.md) | TypeScript 7 | Accepted |
| [0012](0012-publishable-api-key.md) | Publishable API key | Accepted |
| [0013](0013-pull-cursor-as-postgres-text.md) | Pull cursor kept as Postgres's timestamp text | Accepted |
| [0014](0014-push-error-classes.md) | Push error classes and shared backoff | Accepted |
| [0015](0015-resync-pulls-before-removing.md) | Full resync pulls before removing anything | Accepted |
| [0016](0016-one-retry-policy.md) | One retry policy: the sync engine's | Accepted |
| [0017](0017-delete-local-data-before-signing-out.md) | Delete the local database before signing out | Accepted |
| [0018](0018-day-ids-from-user-and-date.md) | Day ids derived from the user and date, checked by the database | Accepted |
| [0019](0019-hold-children-of-failed-parents.md) | Hold rows whose parent has a failed change | Accepted |
| [0020](0020-weight-ids-from-user-and-date.md) | Weigh-in ids derived from the user and date | Accepted |
| [0021](0021-weekly-check-in-rules.md) | Weekly check-in rules | Accepted |
| [0022](0022-export-file-and-import-merge.md) | Export file format and how import merges | Accepted |
