# Security and privacy

What Calorithm protects, from whom, and how. Review this document whenever a change touches
auth, row-level security, sync, import, export, or account deletion.

## What's sensitive

Food logs, weights, height, birth date, and sex are health and personal data. Under GDPR, diet
and weight data likely count as health data, a special category. Treat every user row as
sensitive.

## Threats and controls

| Threat | Control |
|---|---|
| One user reads or changes another's data | Row-level security on every table, `user_id = (select auth.uid())`; pgTAP tests per table |
| A modified client writes bad or oversized values | `CHECK` constraints, `NOT NULL`, foreign keys, and unique indexes in Postgres |
| A leaked anon key | The anon key is public by design; without a user's token, row-level security returns nothing |
| A leaked service-role key | Never used by the app, never committed, never in a prompt |
| A second person on a shared device | Local database per user, deleted on sign-out |
| Malicious import file | Zod validates the whole file before any write; unknown versions are rejected |
| Cross-site scripting | React escapes output; no `dangerouslySetInnerHTML`; a Content Security Policy comes with the move off GitHub Pages |
| Compromised dependency | Approval for each dependency, exact versions, lockfile, `npm ci`, and `npm audit` in CI |
| Secrets in the repository | `.env` files gitignored, blocked from Claude by hooks, and rejected by the commit hook |
| Account takeover | Supabase Auth password rules; sign-ups off while there's one user |
| Health data in error reports | Error tracking, when added, strips food names, weights, and profile fields |

## Data handling

- **Collected:** only what the features need. No analytics while there's one user.
- **Stored:** in the device's IndexedDB and the Supabase project's Postgres.
- **Exported:** on request, as a JSON file the user downloads.
- **Deleted:** on request, every row and the auth account, from the server and the device.
  Soft-deleted rows are removed for good by the cleanup job.
- **Backups:** the JSON export. Supabase's free-plan backups are unconfirmed.

## Before other people use it

Covered by the growth checklists in `PLAN.md`: invite codes, real email sending, error
tracking with scrubbing, staging, Dependabot, a privacy policy, consent, terms, a medical
disclaimer, an age check, a data region choice, and security headers.

## Reporting a vulnerability

Until a `SECURITY.md` exists, report security problems privately to the repository owner
through GitHub, not in a public issue.
