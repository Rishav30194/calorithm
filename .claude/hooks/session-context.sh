#!/usr/bin/env bash
# SessionStart hook.
# Prints the facts Claude must not guess: today's date, the local and remote git state, the
# open PR and its CI result, the current phase, and the installed versions of the direct
# dependencies. These facts are read live, so HANDOVER.md never needs to record them.
# Claude Code adds this output to the session's context at startup, on resume, after
# /clear, and after compaction.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

g() { git -C "$root" "$@" 2>/dev/null; }

# Runs a command with a time limit, so a slow network never stalls the session start.
# macOS has no `timeout` command; perl's alarm does the same job.
limited() { perl -e 'alarm shift; exec @ARGV' "$@"; }

echo "Calorithm session facts, from .claude/hooks/session-context.sh:"
echo "- Today is $(date '+%A, %Y-%m-%d'). Use this date; don't assume another."

if g rev-parse --git-dir >/dev/null; then
  branch="$(g symbolic-ref --short -q HEAD || echo detached)"
  count="$(g status --porcelain | wc -l | tr -d ' ')"
  last="$(g log -1 --format='%h %s')"
  echo "- Git: branch $branch, $count uncommitted file(s), last commit: ${last:-none}."

  if [[ "$branch" != "main" ]] && g rev-parse -q --verify main >/dev/null; then
    echo "- Branch: $(g rev-list --count main..HEAD) commit(s) ahead of main."
  fi

  if upstream="$(g rev-parse --abbrev-ref --symbolic-full-name '@{u}')" && [[ -n "$upstream" ]]; then
    read -r behind ahead <<<"$(g rev-list --left-right --count '@{u}...HEAD')"
    echo "- Remote: tracks $upstream; $ahead commit(s) not pushed, $behind not pulled (as of the last fetch)."
  else
    echo "- Remote: $branch has never been pushed."
  fi

  if g remote get-url origin >/dev/null && command -v gh >/dev/null; then
    # GitHub reports an unfinished check's conclusion as "", which jq's // doesn't skip, so
    # an empty conclusion falls back to the status (in_progress, queued) explicitly.
    if pr="$(cd "$root" && limited 8 gh pr view --json number,state,url,statusCheckRollup --jq '
      "#\(.number) \(.state | ascii_downcase) \(.url); checks: " +
      ([.statusCheckRollup[]?
        | (if (.conclusion // "") != "" then .conclusion else (.status // .state // "pending") end)
        | ascii_downcase]
       | if length == 0 then "none" else (group_by(.) | map("\(length) \(.[0])") | join(", ")) end)
    ' 2>&1)"; then
      echo "- PR for $branch: $pr."
    elif grep -qi 'no pull requests found' <<<"$pr"; then
      echo "- PR for $branch: none."
    else
      echo "- PR for $branch: unknown; GitHub didn't answer. Check with gh pr view."
    fi
    if run="$(cd "$root" && limited 8 gh run list --branch "$branch" --limit 1 \
      --json workflowName,status,conclusion,headSha \
      --jq '.[0] | select(.) | "\(.workflowName) on \(.headSha[0:7]): \(if (.conclusion // "") != "" then .conclusion else .status end)"' 2>/dev/null)"; then
      echo "- Latest CI run on $branch: ${run:-none}."
    else
      echo "- Latest CI run on $branch: unknown; GitHub didn't answer. Check with gh run list."
    fi
  fi

  if hc="$(g log -1 --format=%h -- HANDOVER.md)" && [[ -n "$hc" ]]; then
    echo "- HANDOVER.md last changed in $hc, $(g rev-list --count "$hc"..HEAD) commit(s) ago."
  fi
else
  echo "- Git: not a repository yet."
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
