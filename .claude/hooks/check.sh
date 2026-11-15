#!/usr/bin/env bash
# Stop hook: Claude may not finish its turn while lint, typecheck or unit tests fail.
# Exit 2 + stderr tells Claude why and it keeps working.
# - Skips when nothing relevant changed since the last passing check.
# - Never loops forever: after 3 identical failures on unchanged code (for example a
#   missing tool or no network), it lets Claude stop and warns the human instead.
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f package.json ] || exit 0
[ -t 0 ] || cat >/dev/null 2>&1   # hook input JSON is not needed; drain stdin

paths=(src tests scripts netlify docs/curriculum features.json index.html package.json package-lock.json tsconfig.json tsconfig.*.json vite.config.ts vitest.config.ts eslint.config.js)
h() { shasum | cut -c1-12; }
tracked=$(git diff HEAD -- "${paths[@]}" 2>/dev/null | h)
untracked=$(git ls-files -o --exclude-standard -z -- "${paths[@]}" 2>/dev/null | xargs -0 shasum 2>/dev/null | h)
current="$(git rev-parse HEAD 2>/dev/null) $tracked $untracked"

pass=".claude/.last-passing-check"
fail=".claude/.last-failed-check"
[ -f "$pass" ] && [ "$(cat "$pass")" = "$current" ] && exit 0

failed=""; names=""
for s in lint typecheck test; do
  out=$(npm run -s "$s" 2>&1) || names+=" $s" failed+=$'\n'"--- npm run $s FAILED ---"$'\n'"$(printf '%s\n' "$out" | tail -n 40)"
done

if [ -z "$failed" ]; then
  printf '%s' "$current" > "$pass"
  rm -f "$fail"
  exit 0
fi

# Signature = code state + which scripts failed (not their output: vitest prints timestamps).
sig="$current$names"
count=1
if [ -f "$fail" ] && [ "$(sed -n 1p "$fail")" = "$sig" ]; then
  count=$(( $(sed -n 2p "$fail") + 1 ))
fi
printf '%s\n%s\n' "$sig" "$count" > "$fail"

if [ "$count" -ge 3 ]; then
  printf '{"systemMessage":"PathCheck checks still fail after 3 identical attempts on unchanged code; letting Claude stop. Likely an external blocker (missing tool, network). Run npm run lint, npm run typecheck and npm test to see it."}\n'
  exit 0
fi
printf 'Checks are failing (attempt %s of 3 on unchanged code). Fix them before stopping; if the cause is external (missing tool, network), say so plainly in your reply:%s\n' "$count" "$failed" >&2
exit 2
