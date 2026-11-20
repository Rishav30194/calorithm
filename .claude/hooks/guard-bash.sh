#!/usr/bin/env bash
# PreToolUse hook for Bash.
# Exit 2 blocks the command and returns stderr to Claude; exit 0 lets it run.
#
# Gates:
#   shell readers  -> may not open .env files
#   git commit     -> not on main, no --no-verify, no .env file in the change,
#                     code changes in src/domain/ or src/data/sync/ need a test change there,
#                     a migration that creates a table needs a database test change,
#                     `npm run check:fast` must pass
#   git push       -> not from main, never forced
#   gh pr create   -> `npm run check:full` must pass
#   supabase       -> no reset or push against a linked or remote database
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
input="$(cat)"

if ! cmd="$(jq -r '.tool_input.command // ""' <<<"$input" 2>/dev/null)"; then
  echo "guard-bash: cannot parse hook input" >&2
  exit 2
fi

block() {
  echo "BLOCKED: $*" >&2
  exit 2
}

# True when the command runs `git <subcommand>`, allowing global options such as -C.
runs_git() {
  grep -Eq "(^|[^[:alnum:]_./-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+$1([[:space:]]|\$)" <<<"$cmd"
}

current_branch() {
  git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null || true
}

run_checks() {
  local script="$1"
  if [[ ! -f "$root/package.json" ]]; then
    # Only true before phase 1 creates the project.
    echo "guard-bash: no package.json yet, skipping $script" >&2
    return 0
  fi
  if ! jq -e --arg s "$script" '.scripts[$s]' "$root/package.json" >/dev/null 2>&1; then
    block "package.json has no \"$script\" script. CLAUDE.md requires it. Add it, then retry."
  fi
  local log
  log="$(mktemp -t calorithm-check.XXXXXX)"
  if ! (cd "$root" && npm run --silent "$script") >"$log" 2>&1; then
    {
      echo "BLOCKED: npm run $script failed. Fix the failures, then retry. Do not bypass this gate."
      echo "Last 80 lines:"
      tail -n 80 "$log"
      echo "Full log: $log"
    } >&2
    exit 2
  fi
  rm -f "$log"
}

# Files the commit is about to include. A command such as `git add -A && git commit`
# stages files after this hook runs, so count working-tree changes when it stages. This
# can over-count when only some files are added; the cost is a block that asks for a test.
commit_files() {
  git -C "$root" diff --cached --name-only 2>/dev/null
  if runs_git add || grep -Eq 'commit[[:space:]]+(.*[[:space:]])?(-[[:alpha:]]*a[[:alpha:]]*|--all)([[:space:]]|$)' <<<"${cmd%%-m*}"; then
    git -C "$root" status --porcelain --untracked-files=all 2>/dev/null | sed -E 's/^.. //; s/.* -> //'
  fi
}

# Secrets: block shell commands that print or load .env files. .env.example is fine.
stripped="${cmd//.env.example/}"
readers='cat|less|more|head|tail|bat|grep|rg|awk|sed|cut|sort|strings|xxd|base64|source|open|code'
if grep -Eq "(^|[[:space:];|&(])($readers|\.)[[:space:]]([^;|&]*[^[:alnum:]_-])?\.env(\.[[:alnum:]_-]+)*([^[:alnum:]_.-]|\$)" <<<"$stripped"; then
  block ".env files are off-limits (see CLAUDE.md, Secrets). Ask the user to set or check the value."
fi
# Redirects into a .env file would overwrite the user's secrets.
if grep -Eq ">[[:space:]]*([^[:space:];|&]*/)?\.env(\.[[:alnum:]_-]+)*([^[:alnum:]_.-]|\$)" <<<"$stripped"; then
  block "Writing to .env files is off-limits. Tell the user which key to set."
fi

if grep -Eq '(^|[^[:alnum:]_./-])supabase[[:space:]]+db[[:space:]]+(reset|push)([[:space:]].*)?--(linked|db-url)' <<<"$cmd"; then
  block "supabase db reset or push against a linked or remote database is never run by Claude. Ask the user."
fi

if runs_git commit; then
  # Only each git commit's own arguments, up to the next &&, ;, |, or line end, so an
  # unrelated `sed -n` elsewhere in the command doesn't count. Heredoc message lines are
  # excluded too, since grep reads line by line.
  commit_args="$(grep -oE "git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]][^;&|]*)?" <<<"$cmd" | sed -E 's/^.*[[:space:]]commit//')"
  if grep -Eq -- '--no-verify|(^|[[:space:]])-[[:alpha:]]*n[[:alpha:]]*([[:space:]]|$)' <<<"$commit_args"; then
    block "git commit --no-verify (or -n) skips validation. Commit without it."
  fi
  if git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
    branch="$(current_branch)"
    # The first commit of a new repository is the only one allowed on main.
    if [[ "$branch" == "main" || "$branch" == "master" ]] &&
      git -C "$root" rev-parse -q --verify HEAD >/dev/null 2>&1; then
      block "Never commit to $branch. Create a feature/, fix/, or chore/ branch first."
    fi

    files="$(commit_files | sort -u)"

    if grep -Eq '(^|/)\.env(\.[[:alnum:]_-]+)?$' <<<"$(grep -v '\.env\.example$' <<<"$files")"; then
      block "The commit includes a .env file. Unstage it and check .gitignore."
    fi

    # The calculations and the sync are where a silent bug costs the most.
    for area in src/domain src/data/sync; do
      code="$(grep -E "^$area/.*\.ts$" <<<"$files" | grep -Ev '\.test\.ts$' || true)"
      tests="$(grep -E "^$area/.*\.test\.ts$" <<<"$files" || true)"
      if [[ -n "$code" && -z "$tests" ]]; then
        block "Code in $area changed without a test change there: ${code//$'\n'/, }. Add or update the test first (CLAUDE.md, Tests)."
      fi
    done

    db_tests="$(grep -E '^supabase/tests/.*\.sql$' <<<"$files" || true)"
    while IFS= read -r mig; do
      [[ -n "$mig" && -f "$root/$mig" ]] || continue
      if grep -Eiq 'create[[:space:]]+table' "$root/$mig" && [[ -z "$db_tests" ]]; then
        block "$mig creates a table but no pgTAP test changed. Add row-level security and constraint tests in supabase/tests/."
      fi
    done < <(grep -E '^supabase/migrations/.*\.sql$' <<<"$files" || true)
  fi
  run_checks check:fast
fi

if runs_git push; then
  after_push="${cmd#*push}"
  if grep -Eq -- '--force|--force-with-lease|(^|[[:space:]])-[[:alpha:]]*f[[:alpha:]]*([[:space:]]|$)|[[:space:]]\+[^[:space:]]' <<<"$after_push"; then
    block "Force pushes are never run by Claude. Ask the user."
  fi
  branch="$(current_branch)"
  if [[ "$branch" == "main" || "$branch" == "master" ]]; then
    block "Never push from $branch. Push a feature/, fix/, or chore/ branch and open a PR."
  fi
fi

if grep -Eq '(^|[^[:alnum:]_./-])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' <<<"$cmd"; then
  run_checks check:full
fi

exit 0
