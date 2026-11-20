# 0010. Guardrails for AI-assisted development

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes:** none

## Context

Claude Code writes most of the code. Instructions in `CLAUDE.md` guide it, but they can be
missed in a long session or after context is compacted. Mistakes that matter most here are
silent: a calculation that drifts, a sync that loses a write, or a policy that leaks a row.

## Decision

Enforce the rules that matter with Claude Code hooks, permission rules, CI, and database
constraints, rather than instructions alone. The hooks and their tests are in
`.claude/hooks/`; `docs/ai-workflow.md` describes the system.

## Alternatives

| Option | Why not |
|---|---|
| Instructions only | Not enforced; breaches show up late, if at all |
| Git hooks only (for example Lefthook) | Don't see edits or turns, only commits; Claude can't get feedback mid-task |
| CI only | Feedback arrives after the PR, when fixes cost more |

## Consequences

- Rule breaches are caught at the edit, the commit, or the end of the turn.
- Hooks are code to maintain, with their own test suite.
- A person committing outside Claude Code isn't covered until CI; Git hooks can be added in
  phase 1 if wanted.
- Loosening a guardrail needs a new decision record.
