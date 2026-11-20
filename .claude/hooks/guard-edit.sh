#!/usr/bin/env bash
# PreToolUse hook for Edit and Write.
# Exit 2 blocks the edit and returns stderr to Claude; exit 0 lets it run.
#
# Gates:
#   .env files                 -> never written by Claude
#   supabase/migrations/*.sql  -> append-only once the file is on main
#   src/data/database.types.ts -> generated; regenerate with `npm run db:types`
#   package-lock.json          -> written only by npm
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
input="$(cat)"

if ! file="$(jq -r '.tool_input.file_path // ""' <<<"$input" 2>/dev/null)"; then
  echo "guard-edit: cannot parse hook input" >&2
  exit 2
fi
[[ -n "$file" ]] || exit 0

block() {
  echo "BLOCKED: $*" >&2
  exit 2
}

rel="${file#"$root"/}"
name="$(basename "$file")"

case "$name" in
  .env.example) ;;
  .env | .env.*)
    block ".env files are off-limits (see CLAUDE.md, Secrets). Tell the user which key to set."
    ;;
  package-lock.json)
    block "package-lock.json is written only by npm. Dependency changes need the user's approval."
    ;;
esac

case "$rel" in
  src/data/database.types.ts)
    block "$rel is generated. Change the migration, then run npm run db:types."
    ;;
  supabase/migrations/*.sql)
    for ref in origin/main main; do
      # A migration that reached main may already be applied to the hosted database.
      if git -C "$root" cat-file -e "$ref:$rel" 2>/dev/null; then
        block "$rel is already on $ref. Migrations are append-only: add a new migration file."
      fi
    done
    ;;
esac

exit 0
