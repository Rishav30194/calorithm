#!/usr/bin/env bash
# PostToolUse hook for Edit and Write.
# Checks the edited file right away. Exit 2 returns the problems to Claude, so they are
# fixed in the same turn instead of piling up until the commit gate.
#
# Checks:
#   src/domain/**     -> no React, Dexie, Supabase, data or UI layers, browser APIs,
#                        clock reads, or randomness
#   code and config   -> Biome formats and lints the file
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
input="$(cat)"

file="$(jq -r '.tool_input.file_path // .tool_response.filePath // ""' <<<"$input" 2>/dev/null)" || exit 0
[[ -n "$file" && -f "$file" ]] || exit 0

# Only files inside this project, and never dependencies or build output.
case "$file" in
  "$root"/node_modules/* | "$root"/dist/* | "$root"/coverage/*) exit 0 ;;
  "$root"/*) ;;
  *) exit 0 ;;
esac
rel="${file#"$root"/}"

# The domain module must run anywhere: an Edge Function, a native app, or a test.
# Tests may build fixtures with dates, so only non-test files are checked.
if [[ "$rel" == src/domain/*.ts && "$rel" != *.test.ts ]]; then
  q='["'"'"']'
  # Static, side-effect, dynamic, and require imports, at any folder depth or through `@/`.
  imp="(from|import|require)[[:space:]]*\(?[[:space:]]*$q"
  forbidden="$imp(react|react-dom|dexie|@supabase/[^\"']*)$q|$imp((\.\./)+|@/)(data|ui)(/|$q)|\b(window|document|navigator|localStorage|sessionStorage|indexedDB)\.|\bfetch\(|Date\.now\(|new Date\(\)|Math\.random\(|performance\.now\("
  if hits="$(grep -nE "$forbidden" "$file" | grep -vE '^[0-9]+:[[:space:]]*(//|\*)')"; then
    {
      echo "$rel breaks the domain rules (CLAUDE.md, Architecture rules):"
      echo "$hits"
      echo "Domain code takes data, the current date, and any IDs as arguments. Move I/O to src/data/ or src/ui/."
    } >&2
    exit 2
  fi
fi

biome="$root/node_modules/.bin/biome"
[[ -x "$biome" ]] || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.json | *.jsonc | *.css)
    if ! out="$(cd "$root" && "$biome" check --write --no-errors-on-unmatched "$file" 2>&1)"; then
      {
        echo "Biome failed for $rel. Fix these before moving on:"
        echo "$out"
      } >&2
      exit 2
    fi
    ;;
esac

exit 0
