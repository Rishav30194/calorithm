#!/usr/bin/env bash
# Stop hook. Two checks before Claude ends a turn:
#   1. Uncommitted code must pass `npm run check:fast`.
#   2. HANDOVER.md must not be older than the latest commit or push.
# On a problem, exit 2 sends the report back: Claude must fix it, or tell the user why not,
# and can't describe the work as done. It blocks at most once per turn (`stop_hook_active`),
# so a check that can't pass never traps the session.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
input="$(cat)"

[[ "$(jq -r '.stop_hook_active // false' <<<"$input" 2>/dev/null)" == "true" ]] && exit 0

g() { git -C "$root" "$@" 2>/dev/null; }
g rev-parse --git-dir >/dev/null || exit 0

report=""

check_code() {
  [[ -f "$root/package.json" ]] || return 0
  jq -e '.scripts["check:fast"]' "$root/package.json" >/dev/null 2>&1 || return 0
  local changed log
  changed="$(g status --porcelain --untracked-files=all |
    sed -E 's/^.. //; s/.* -> //' |
    grep -E '\.(ts|tsx|js|mjs|cjs|css|json|jsonc|sql|html)$' || true)"
  [[ -n "$changed" ]] || return 0
  log="$(mktemp -t calorithm-stop.XXXXXX)"
  if (cd "$root" && npm run --silent check:fast) >"$log" 2>&1; then
    rm -f "$log"
    return 0
  fi
  report+="The uncommitted changes fail npm run check:fast. Fix them, or tell the user exactly
which checks fail and why. Don't describe the work as done.
Last 60 lines:
$(tail -n 60 "$log")
Full log: $log
"
}

# HANDOVER.md holds the next steps, so a commit or push that it predates may have made it wrong.
check_handover() {
  local file=HANDOVER.md
  g ls-files --error-unmatch "$file" >/dev/null || return 0
  # An uncommitted edit means the handover is being updated in this turn.
  [[ -z "$(g status --porcelain -- "$file")" ]] || return 0

  local commit time newer reasons=() ref when
  commit="$(g log -1 --format=%H -- "$file")"
  time="$(g log -1 --format=%ct -- "$file")"
  [[ -n "$commit" && -n "$time" ]] || return 0

  newer="$(g rev-list --count "$commit..HEAD")"
  if ((newer > 0)); then
    reasons+=("$newer commit(s) on this branch since HANDOVER.md last changed")
  fi

  # A remote branch updated after the handover, holding commits the handover predates,
  # means a push or fetch changed what the handover's next steps assume.
  while IFS= read -r ref; do
    when="$(g reflog show -1 --date=unix --format=%gd "$ref" | sed -nE 's/.*@\{([0-9]+)\}$/\1/p')"
    [[ "$when" =~ ^[0-9]+$ ]] || continue
    if ((when > time)) && ! g merge-base --is-ancestor "$commit" "$ref"; then
      reasons+=("${ref#refs/remotes/} was pushed or fetched after HANDOVER.md last changed")
    fi
  done < <(g for-each-ref --format='%(refname)' refs/remotes | grep -v '/HEAD$')

  ((${#reasons[@]} > 0)) || return 0
  report+="HANDOVER.md may be out of date:
$(printf -- '- %s\n' "${reasons[@]}")
Update its next steps, open questions, and warnings for what changed, or tell the user why it
still holds. Live git and GitHub state doesn't belong in it; the session-start hook prints that.
"
}

check_code
check_handover

[[ -z "$report" ]] && exit 0
printf '%s' "$report" >&2
exit 2
