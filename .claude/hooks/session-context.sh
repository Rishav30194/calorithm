#!/usr/bin/env bash
# SessionStart hook.
# Prints the facts Claude must not guess: today's date, the git state, the current phase,
# and the installed versions of the direct dependencies. Claude Code adds this output to
# the session's context at startup, on resume, after /clear, and after compaction.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "Calorithm session facts, from .claude/hooks/session-context.sh:"
echo "- Today is $(date '+%A, %Y-%m-%d'). Use this date; don't assume another."

if git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null || echo detached)"
  count="$(git -C "$root" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  last="$(git -C "$root" log -1 --format='%h %s' 2>/dev/null || echo 'none')"
  echo "- Git: branch $branch, $count uncommitted file(s), last commit: ${last:-none}."
else
  echo "- Git: not a repository yet. Phase 1 runs git init."
fi

# The first phase in docs/phases.md whose status isn't Done.
if [[ -f "$root/docs/phases.md" ]]; then
  phase="$(awk '
    /^## Phase / { heading = substr($0, 4) }
    /^\*\*Status:\*\*/ && heading != "" {
      status = $0; sub(/^\*\*Status:\*\*[[:space:]]*/, "", status)
      if (status !~ /^Done/) { print heading " (" status ")"; exit }
      heading = ""
    }' "$root/docs/phases.md")"
  echo "- Current phase: ${phase:-all phases done}. Read HANDOVER.md before starting."
fi

if [[ -f "$root/package.json" ]]; then
  versions="$(cd "$root" && node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const out = names.map((n) => {
      try { return `${n} ${JSON.parse(fs.readFileSync(`node_modules/${n}/package.json`, "utf8")).version}`; }
      catch { return `${n} not installed`; }
    });
    console.log(out.join(", "));
  ' 2>/dev/null)"
  echo "- Installed versions: ${versions:-unreadable; run npm ci}."
  echo "- Check library APIs against these versions, not memory: read the type definitions in node_modules."
fi

echo "- Follow CLAUDE.md: plan before non-trivial work, test first in src/domain/ and src/data/sync/,"
echo "  and claim a result only after running it in this session."
exit 0
