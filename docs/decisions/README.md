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
