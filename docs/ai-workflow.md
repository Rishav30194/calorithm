# AI-assisted development

How Calorithm is built with Claude Code, and the controls that keep AI-written code at
production quality. `CLAUDE.md` holds the short rules; this document explains the system
behind them.

## Principles

1. **The person owns every decision.** Claude proposes plans, code, and records; the user
   approves scope, dependencies, merges, and anything that touches the hosted project.
2. **Rules that matter are enforced by code, not by instructions.** An instruction in
   `CLAUDE.md` can be missed in a long session. A hook can't. Every rule that is costly to
   break has a hook, a CI check, or a database constraint behind it.
3. **Evidence over claims.** Work is done when a check passes in this session, not when the
   code looks right.
4. **Small, reviewable changes.** A PR a person can read in one sitting gets a real review.
5. **Context lives in the repository.** Plans, decisions, and handovers are files, so any
   session, or any person, starts from the same facts.

## Layers of control

| Layer | When it runs | What it catches |
|---|---|---|
| `CLAUDE.md` and docs | Every session | Wrong approach, wrong layer, missing context |
| `session-context.sh` | Session start | Wrong date, wrong phase, guessed library versions |
| `guard-edit.sh` | Before each edit | Secrets, edits to applied migrations or generated files |
| `check-edit.sh` | After each edit | Lint and format errors, impure domain code |
| `check-stop.sh` | End of each turn | Claiming work is done while checks fail |
| `guard-bash.sh` | Before each command | Commits without tests or checks, pushes to `main`, force pushes, remote database changes, secret reads |
| Permission rules | Before each tool use | Dependency installs, file deletion, pushes, PRs, and edits to `.claude/` and CI ask the user first |
| Code review skills | Before each PR | Bugs, security issues, and broken rules a test didn't cover |
| CI | Every PR | Anything skipped locally; runs on a clean machine |
| Database | Every write | Bad values and access to other users' rows, even from a modified client |
| Human review | Every merge | Whether the change is the right change |

## The loop for a phase

1. **Start.** Read `HANDOVER.md`, the phase in `docs/phases.md`, and the parts of `PLAN.md` and
   `docs/architecture.md` it touches.
2. **Plan.** Claude writes a short plan: files, approach, tests, risks, and any decision that
   needs a record. The user approves or corrects it. Plan mode suits this step.
3. **Branch.** `feature/<phase-slug>` from `main`.
4. **Test first** for domain and sync code. Write the test, run it, and see it fail for the
   right reason. Then write the code until it passes.
5. **Build in small commits.** Each commit passes `check:fast`; the hook makes sure.
6. **Self-review.** Run `/code-review` on the branch. When the change touches auth,
   row-level security, sync, import, or account deletion, also run `/security-review`. Fix
   findings or explain them in the PR.
7. **Verify in the app.** Run the app and use the feature, not only the tests. For screens,
   check both themes and a 360-pixel-wide viewport.
8. **Open the PR** with the template, after the user approves. The hook runs `check:full`
   first.
9. **Human review and merge.** The user reads the diff, CI must be green, and the user
   squash-merges.
10. **Close out.** Update the phase's status and implementation notes, and `HANDOVER.md`.

## Writing good prompts for this repository

- **Name the phase and the acceptance criterion** the work is for.
- **Point to the files**, rather than describing them.
- **Say what's out of scope.** Claude otherwise tends to improve nearby code.
- **Ask for the plan first** for anything that changes the schema, sync, or calculations.

## Dependencies and supply chain

AI tools can suggest packages that don't exist, or that someone registered under a plausible
name. Every dependency:

- Needs the user's approval, with its purpose and bundle cost stated.
- Is checked on the registry for its maintainer, download count, and last release.
- Is installed at an exact version, with `package-lock.json` committed and `npm ci` in CI.
- Gets `npm audit` in CI. Dependabot comes with the "Before friends join" checklist.

## Data and privacy in prompts

- Use only synthetic data in tests, seeds, fixtures, and prompts.
- Never paste exported data, real logs, or database dumps into a session.
- `.env` files are blocked from both reading and writing; secrets reach the app only through
  local environment files and GitHub Actions secrets set by the user.

## Changing the guardrails

The hooks and permission rules are part of the codebase:

- Changes to `.claude/` need the user's approval, through a permission prompt.
- Every hook change comes with test cases in `.claude/hooks/test-hooks.sh`, and the suite must
  pass.
- Loosening a rule needs a decision record explaining why.

## Traceability

- Commits made with Claude carry a `Co-Authored-By` trailer.
- The PR template asks what was verified and how, and which review findings were left open.
- Decision records capture why, so later sessions don't undo deliberate choices.
