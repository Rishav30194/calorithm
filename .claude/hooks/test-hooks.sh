#!/usr/bin/env bash
# Pipe-tests the hook scripts against a throwaway repository.
# Run after any change to a hook:  bash .claude/hooks/test-hooks.sh
#
# Invoke it by path, as above. A command line that spells out `git commit` or a `.env`
# read is itself inspected by guard-bash.sh, so keep such text inside this file.
set -uo pipefail

HOOKS="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d -t calorithm-hooktest.XXXXXX)"
SB="$WORK/sandbox"
mkdir -p "$SB"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

expect() { # expect <want-exit> <label> <hook> <json>
  local want="$1" label="$2" hook="$3" json="$4" got
  CLAUDE_PROJECT_DIR="$SB" bash "$HOOKS/$hook" <<<"$json" >"$WORK/stdout.txt" 2>"$WORK/stderr.txt"
  got=$?
  if [[ "$got" == "$want" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL [$label] want=$want got=$got :: $(head -c 300 "$WORK/stderr.txt")"
  fi
}

bash_json() { jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }
edit_json() { jq -nc --arg f "$1" '{tool_name:"Edit",tool_input:{file_path:$f}}'; }
b() { expect "$1" "$2" guard-bash.sh "$(bash_json "$3")"; }
e() { expect "$1" "$2" guard-edit.sh "$(edit_json "$3")"; }
p() { expect "$1" "$2" check-edit.sh "$(edit_json "$3")"; }
s() { expect "$1" "$2" check-stop.sh "$3"; }

set_scripts() { # set_scripts <fast-exit> <full-exit|none>
  if [[ "$2" == "none" ]]; then
    jq -n --arg f "exit $1" '{name:"sb",scripts:{"check:fast":$f}}' >"$SB/package.json"
  else
    jq -n --arg f "exit $1" --arg u "exit $2" \
      '{name:"sb",scripts:{"check:fast":$f,"check:full":$u}}' >"$SB/package.json"
  fi
}

make_dirs() { mkdir -p "$SB/src/domain" "$SB/src/data/sync" "$SB/src/ui" "$SB/supabase/migrations" "$SB/supabase/tests"; }
reset_index() {
  git -C "$SB" reset -q 2>/dev/null
  git -C "$SB" clean -qfd -e package.json 2>/dev/null
  make_dirs
}

echo "== secrets guard =="
b 0 "plain ls" 'ls -la'
b 2 "cat .env" 'cat .env'
b 0 "cat .env.example" 'cat .env.example'
b 0 "copy example to .env" 'cp .env.example .env'
b 2 "grep .env.local" 'grep KEY .env.local'
b 2 "source .env" 'source .env && npm run dev'
b 2 "dot-source .env" '. ./.env'
b 2 "cat nested .env" 'cd app && cat supabase/.env.production'
b 0 "env.ts" 'cat src/env.ts'
b 0 "environment word" 'echo hi > notes.environment'
b 2 "redirect into .env" 'echo KEY=1 > .env'
b 2 "append into nested .env" 'echo KEY=1 >> supabase/.env.local'
b 0 "redirect into .env.example" 'echo KEY= > .env.example'
b 0 "stderr redirect" 'npm run build 2>&1'

echo "== remote database guard =="
b 2 "db push linked" 'npx supabase db push --linked'
b 2 "db reset linked" 'supabase db reset --linked'
b 2 "db push db-url" 'supabase db push --db-url postgres://x'
b 0 "local db reset" 'npx supabase db reset'

echo "== commit gate: no repository, no package.json =="
b 0 "commit before scaffold" 'git commit -m "x"'

echo "== commit gate: new repository on main =="
git -C "$SB" init -q -b main
git -C "$SB" config user.email t@example.com
git -C "$SB" config user.name t
set_scripts 0 none
b 0 "first commit on main allowed" 'git commit -m "init"'
git -C "$SB" add -A && git -C "$SB" commit -q -m init
b 2 "second commit on main blocked" 'git commit -m "x"'
b 2 "push from main blocked" 'git push origin main'

echo "== commit gate: feature branch =="
git -C "$SB" checkout -q -b feature/x
b 0 "commit, checks pass" 'git commit -m "x"'
b 0 "commit -am, checks pass" 'git commit -am "add thing"'
b 2 "--no-verify" 'git commit --no-verify -m "x"'
b 2 "-n" 'git commit -n -m "x"'
b 0 "the word commit earlier, sed -n before the commit" 'echo "commit" > notes && sed -n 1p notes && git commit -m "x"'
b 0 "sed -n after the commit" 'git commit -m "x" && sed -n 1p notes'
b 2 "-n after git add" 'git add -A && git commit -n -m "x"'
b 2 "--no-verify with git -C" 'git -C /tmp/somewhere commit --no-verify -m "x"'
b 2 "-n in a second commit" 'git commit -m "x" && git commit -n -m "y"'
b 0 "push feature branch" 'git push -u origin feature/x'
b 2 "force push" 'git push --force origin feature/x'
b 2 "force-with-lease push" 'git push --force-with-lease'
b 2 "-f push" 'git push -f origin feature/x'
b 2 "plus refspec push" 'git push origin +feature/x'
set_scripts 1 none
b 2 "commit, checks fail" 'git commit -m "x"'
b 2 "chained commit, checks fail" 'git add -A && git commit -m "x"'
b 0 "git log untouched" 'git log --oneline -5'
set_scripts 0 none

echo "== commit gate: file rules =="
make_dirs
echo "export const a = 1" >"$SB/src/domain/trend.ts"
git -C "$SB" add src/domain/trend.ts
b 2 "domain code without test (staged)" 'git commit -m "x"'
reset_index
echo "export const a = 1" >"$SB/src/domain/trend.ts"
b 2 "domain code without test (add in command)" 'git add -A && git commit -m "x"'
b 0 "unstaged domain code, message says add" 'git commit -m "fix and add notes"'
b 0 "unstaged domain code, -m before -a word" 'git commit -m "x -a y"'
b 2 "domain code without test (commit -am)" 'git commit -am "x"'
echo "test" >"$SB/src/domain/trend.test.ts"
b 0 "domain code with test" 'git add -A && git commit -m "x"'
reset_index
echo "export const s = 1" >"$SB/src/data/sync/push.ts"
b 2 "sync code without test" 'git add -A && git commit -m "x"'
echo "test" >"$SB/src/data/sync/push.test.ts"
b 0 "sync code with test" 'git add -A && git commit -m "x"'
reset_index
echo "export const u = 1" >"$SB/src/ui/Log.tsx"
b 0 "ui code without test" 'git add -A && git commit -m "x"'
reset_index
echo "create table foods (id uuid);" >"$SB/supabase/migrations/20261119000000_foods.sql"
b 2 "create table without pgTAP" 'git add -A && git commit -m "x"'
echo "select plan(1);" >"$SB/supabase/tests/foods.test.sql"
b 0 "create table with pgTAP" 'git add -A && git commit -m "x"'
reset_index
echo "alter table foods add column x int;" >"$SB/supabase/migrations/20261119000001_x.sql"
b 0 "alter table without pgTAP" 'git add -A && git commit -m "x"'
reset_index
echo "KEY=1" >"$SB/.env"
git -C "$SB" add -f .env
b 2 "commit with .env staged" 'git commit -m "x"'
reset_index
rm -f "$SB/.env"
echo "KEY=" >"$SB/.env.example"
b 0 "commit with .env.example" 'git add -A && git commit -m "x"'
reset_index

echo "== PR gate =="
b 2 "pr create, no check:full script" 'gh pr create --title "x" --body "y"'
set_scripts 0 1
b 2 "pr create, full fails" 'gh pr create --title "x" --body "y"'
set_scripts 0 0
b 0 "pr create, full passes" 'gh pr create --title "x" --body "y"'
b 0 "pr view untouched" 'gh pr view 3'

echo "== edit guard =="
e 2 ".env" "$SB/.env"
e 2 ".env.local" "$SB/.env.local"
e 2 "nested .env" "$SB/supabase/.env"
e 0 ".env.example" "$SB/.env.example"
e 0 "source file" "$SB/src/domain/trend.ts"
e 2 "generated types" "$SB/src/data/database.types.ts"
e 2 "package-lock.json" "$SB/package-lock.json"
echo "select 1;" >"$SB/supabase/migrations/20261119000002_init.sql"
e 0 "new migration on branch" "$SB/supabase/migrations/20261119000002_init.sql"
git -C "$SB" add -A && git -C "$SB" commit -q -m mig
git -C "$SB" checkout -q main && git -C "$SB" merge -q feature/x && git -C "$SB" checkout -q feature/x
e 2 "migration already on main" "$SB/supabase/migrations/20261119000002_init.sql"
e 0 "brand-new migration" "$SB/supabase/migrations/20261119000003_next.sql"

echo "== post-edit check: domain rules =="
printf 'export const f = (x: number) => x * 2\n' >"$SB/src/domain/pure.ts"
p 0 "pure domain file" "$SB/src/domain/pure.ts"
printf 'import { useState } from "react"\n' >"$SB/src/domain/bad.ts"
p 2 "react in domain" "$SB/src/domain/bad.ts"
printf "import Dexie from 'dexie'\n" >"$SB/src/domain/bad.ts"
p 2 "dexie in domain" "$SB/src/domain/bad.ts"
printf 'import { createClient } from "@supabase/supabase-js"\n' >"$SB/src/domain/bad.ts"
p 2 "supabase in domain" "$SB/src/domain/bad.ts"
printf 'import { db } from "../data/db"\n' >"$SB/src/domain/bad.ts"
p 2 "data layer in domain" "$SB/src/domain/bad.ts"
printf 'export const t = () => Date.now()\n' >"$SB/src/domain/bad.ts"
p 2 "clock read in domain" "$SB/src/domain/bad.ts"
printf 'export const t = () => new Date()\n' >"$SB/src/domain/bad.ts"
p 2 "new Date() in domain" "$SB/src/domain/bad.ts"
printf 'export const t = (s: string) => new Date(s)\n' >"$SB/src/domain/ok.ts"
p 0 "new Date(arg) in domain" "$SB/src/domain/ok.ts"
printf 'import "dexie"\n' >"$SB/src/domain/bad.ts"
p 2 "side-effect import in domain" "$SB/src/domain/bad.ts"
printf 'const m = await import("@supabase/supabase-js")\n' >"$SB/src/domain/bad.ts"
p 2 "dynamic import in domain" "$SB/src/domain/bad.ts"
mkdir -p "$SB/src/domain/sub"
printf 'import { db } from "../../data/db"\n' >"$SB/src/domain/sub/bad.ts"
p 2 "deep data import in domain" "$SB/src/domain/sub/bad.ts"
printf 'import { Log } from "@/ui/Log"\n' >"$SB/src/domain/bad.ts"
p 2 "alias ui import in domain" "$SB/src/domain/bad.ts"
printf 'import { round } from "./numbers"\n' >"$SB/src/domain/ok.ts"
p 0 "sibling import in domain" "$SB/src/domain/ok.ts"
printf 'export const r = () => Math.random()\n' >"$SB/src/domain/bad.ts"
p 2 "randomness in domain" "$SB/src/domain/bad.ts"
printf 'export const w = () => window.innerWidth\n' >"$SB/src/domain/bad.ts"
p 2 "window in domain" "$SB/src/domain/bad.ts"
printf '// never call Date.now() here\nexport const a = 1\n' >"$SB/src/domain/commented.ts"
p 0 "forbidden text in a comment" "$SB/src/domain/commented.ts"
printf 'const now = new Date()\n' >"$SB/src/domain/trend.test.ts"
p 0 "clock read in a domain test" "$SB/src/domain/trend.test.ts"
printf 'import { useState } from "react"\n' >"$SB/src/ui/Log.tsx"
p 0 "react in ui" "$SB/src/ui/Log.tsx"

echo "== post-edit check: Biome =="
p 0 "no node_modules" "$SB/src/ui/Log.tsx"
mkdir -p "$SB/node_modules/.bin"
printf '#!/bin/sh\necho "lint/suspicious/noExplicitAny"; exit 1\n' >"$SB/node_modules/.bin/biome"
chmod +x "$SB/node_modules/.bin/biome"
p 2 "biome fails" "$SB/src/ui/Log.tsx"
printf '#!/bin/sh\nexit 0\n' >"$SB/node_modules/.bin/biome"
p 0 "biome passes" "$SB/src/ui/Log.tsx"
p 0 "markdown skipped" "$SB/README.md"
p 0 "file outside project" "/tmp/elsewhere.ts"
p 0 "missing file" "$SB/src/missing.ts"

echo "== stop check =="
git -C "$SB" add -A && git -C "$SB" commit -q -m wip
s 0 "clean tree" '{"stop_hook_active":false}'
echo "export const z = 1" >"$SB/src/ui/New.tsx"
set_scripts 1 0
s 2 "code changed, checks fail" '{"stop_hook_active":false}'
s 0 "already blocked once" '{"stop_hook_active":true}'
set_scripts 0 0
s 0 "code changed, checks pass" '{"stop_hook_active":false}'
rm -f "$SB/src/ui/New.tsx"
set_scripts 1 0
git -C "$SB" add package.json && git -C "$SB" commit -q -m scripts
echo "notes" >"$SB/NOTES.md"
s 0 "docs-only change" '{"stop_hook_active":false}'

echo "== stop check: handover =="
past="$(($(date +%s) - 7200))"
old_commit() { GIT_AUTHOR_DATE="@$past" GIT_COMMITTER_DATE="@$past" git -C "$SB" commit -q -m "$1"; }
s 0 "no handover file" '{"stop_hook_active":false}'
echo "# Handover" >"$SB/HANDOVER.md"
git -C "$SB" add HANDOVER.md && old_commit handover
s 0 "handover is the latest commit" '{"stop_hook_active":false}'
echo "work" >"$SB/work.txt"
git -C "$SB" add work.txt && git -C "$SB" commit -q -m work
s 2 "commit after the handover" '{"stop_hook_active":false}'
s 0 "commit after the handover, already blocked once" '{"stop_hook_active":true}'
echo "next step" >>"$SB/HANDOVER.md"
s 0 "handover being edited this turn" '{"stop_hook_active":false}'
git -C "$SB" add HANDOVER.md && old_commit "update handover"
s 0 "handover updated after the commit" '{"stop_hook_active":false}'
git init -q --bare "$WORK/remote.git"
git -C "$SB" remote add origin "$WORK/remote.git"
git -C "$SB" push -q -u origin feature/x 2>/dev/null
s 0 "push that includes the handover" '{"stop_hook_active":false}'
git -C "$SB" push -q origin main 2>/dev/null
s 2 "push of commits the handover predates" '{"stop_hook_active":false}'

echo "== session context =="
expect_out() { # expect_out <label> <pattern>
  if grep -Eq -- "$2" "$WORK/stdout.txt"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL [$1] output lacks /$2/ :: $(head -c 300 "$WORK/stdout.txt")"
  fi
}
# Keep these cases off the network: no gh calls without a GitHub remote.
git -C "$SB" remote remove origin
expect 0 "session context runs" session-context.sh '{}'
expect_out "shows the branch" 'branch feature/x'
expect_out "shows commits ahead of main" '[0-9]+ commit\(s\) ahead of main'
expect_out "shows a branch was never pushed" 'feature/x has never been pushed'
expect_out "shows the handover age" 'HANDOVER.md last changed in [0-9a-f]+, 0 commit\(s\) ago'
expect_out "shows the date" 'Today is'

echo "== session context: PR and CI lines =="
# A stand-in gh that applies the hook's own --jq filter to fixture JSON, so the filters are
# tested without the network. The remote URL is never contacted.
mkdir -p "$WORK/bin"
cat >"$WORK/bin/gh" <<'STUB'
#!/usr/bin/env bash
sub="$1 $2"; filter="."
while (($#)); do [[ "$1" == "--jq" ]] && { filter="$2"; shift; }; shift; done
case "$sub" in
  "pr view") fixture="$GH_PR_FIXTURE" ;;
  "run list") fixture="$GH_RUN_FIXTURE" ;;
  *) exit 1 ;;
esac
jq -r "$filter" <<<"$fixture"
STUB
chmod +x "$WORK/bin/gh"
git -C "$SB" remote add origin https://example.invalid/calorithm.git
ctx() { PATH="$WORK/bin:$PATH" expect 0 "$1" session-context.sh '{}'; }

export GH_PR_FIXTURE='{"number":7,"state":"OPEN","url":"u","statusCheckRollup":[{"status":"IN_PROGRESS","conclusion":""}]}'
export GH_RUN_FIXTURE='[{"workflowName":"CI","status":"in_progress","conclusion":"","headSha":"abcdef123"}]'
ctx "session context with CI running"
expect_out "a running check shows its status" 'checks: 1 in_progress'
expect_out "a running CI run shows its status" 'CI on abcdef1: in_progress'

export GH_PR_FIXTURE='{"number":7,"state":"OPEN","url":"u","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"},{"state":"PENDING"}]}'
export GH_RUN_FIXTURE='[{"workflowName":"CI","status":"completed","conclusion":"success","headSha":"abcdef123"}]'
ctx "session context with CI finished"
expect_out "finished and pending checks are counted" 'checks: 1 pending, 1 success'
expect_out "a finished CI run shows its result" 'CI on abcdef1: success'

export GH_PR_FIXTURE='{"number":7,"state":"OPEN","url":"u","statusCheckRollup":[]}'
export GH_RUN_FIXTURE='[]'
ctx "session context with no checks or runs"
expect_out "no checks says none" 'checks: none'
expect_out "no runs says none" 'Latest CI run on feature/x: none\.'
unset GH_PR_FIXTURE GH_RUN_FIXTURE

echo "passed=$pass failed=$fail"
[[ "$fail" == 0 ]]
