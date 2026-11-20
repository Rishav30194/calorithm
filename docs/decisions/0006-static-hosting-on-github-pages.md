# 0006. Static hosting on GitHub Pages with hash routes

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

The app is a static build. `daily`, `ten`, and `life-admin` already deploy to GitHub Pages
from GitHub Actions.

## Decision

Deploy to GitHub Pages under `/calorithm/`, with hash routes (`#/log`), so a refresh on any
screen loads the app.

## Alternatives

| Option | Why not, for now |
|---|---|
| Cloudflare Pages or Vercel | Better: custom headers, preview deploys. Not needed for one user |
| Path routes with the `404.html` workaround | Returns a 404 status first, and is fragile |

## Consequences

- Free and familiar, with no further account.
- No custom response headers, so no Content Security Policy header.
- Revisit before customers: the growth checklist moves hosting to Cloudflare Pages or Vercel.
