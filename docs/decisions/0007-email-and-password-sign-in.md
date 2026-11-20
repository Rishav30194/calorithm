# 0007. Email and password sign-in

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

The app installs on iPhone as a home-screen app. On iOS, a link in an email opens in Safari,
which doesn't share storage with the installed app, so a magic link signs in the wrong place.

## Decision

Use email and password through Supabase Auth. Turn sign-ups off once the owner's account exists.

## Alternatives

| Option | Why not |
|---|---|
| Magic links | Open in Safari, not the installed app, on iOS |
| Email one-time codes | Workable; depends on email delivery, which Supabase limits without a custom email provider (exact limit unverified) |
| Sign in with Apple or Google | Needs developer accounts and setup; planned before customers |

## Consequences

- Sign-in works the same on every platform with no email sent.
- Password reset needs email, so it comes with the "Before friends join" checklist.
- Revisit when adding social sign-in or one-time codes for other users.
