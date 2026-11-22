# 0024. Public repository for GitHub Pages

- **Status:** Accepted
- **Date:** 2026-11-21
- **Supersedes:** none

## Context

`PLAN.md` hosts the app on GitHub Pages. The repository was private, and the owner's account
is on GitHub's Free plan, where Pages serves only public repositories.

## Decision

Make the repository public and keep GitHub Pages, deployed from Actions after CI passes on
`main`.

## Alternatives

| Option | Why not |
|---|---|
| GitHub Pro, repository stays private | A monthly cost for a one-person app whose code holds no secrets |
| Cloudflare Pages | Another account and an API token secret; the move is already planned for security headers before friends join, and can happen then |

## Consequences

- Hosting stays free, and the deploy uses only GitHub's own actions.
- The code, docs, and commit author emails are public. The publishable key ships in the app
  anyway; row-level security, not secrecy, protects the data. Tests and seeds use only
  synthetic data, and the hooks block `.env` files from commits.
- The seed users' password in `supabase/seed.sql` is public, so the seed must never reach the
  hosted project (`docs/production.md`).
- Revisit when moving to a host that sends security headers (`PLAN.md`, growth checklists).
