#!/usr/bin/env bash
# Stop hook.
# Before Claude ends a turn with uncommitted code changes, runs `npm run check:fast`.
# On failure, exit 2 sends the result back: Claude must fix it, or tell the user which
# checks fail, and can't describe the work as done. It blocks at most once per turn
# (`stop_hook_active`), so a check that can't pass never traps the session.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
input="$(cat)"

[[ "$(jq -r '.stop_hook_active // false' <<<"$input" 2>/dev/null)" == "true" ]] && exit 0
[[ -f "$root/package.json" ]] || exit 0
git -C "$root" rev-parse --git-dir >/dev/null 2>&1 || exit 0
jq -e '.scripts["check:fast"]' "$root/package.json" >/dev/null 2>&1 || exit 0

changed="$(git -C "$root" status --porcelain --untracked-files=all 2>/dev/null |
  sed -E 's/^.. //; s/.* -> //' |
  grep -E '\.(ts|tsx|js|mjs|cjs|css|json|jsonc|sql|html)$' || true)"
[[ -n "$changed" ]] || exit 0

log="$(mktemp -t calorithm-stop.XXXXXX)"
if (cd "$root" && npm run --silent check:fast) >"$log" 2>&1; then
  rm -f "$log"
  exit 0
fi

{
  echo "The uncommitted changes fail npm run check:fast. Fix them before you end the turn,"
  echo "or tell the user exactly which checks fail and why. Don't describe the work as done."
  echo "Last 60 lines:"
  tail -n 60 "$log"
  echo "Full log: $log"
} >&2
exit 2
