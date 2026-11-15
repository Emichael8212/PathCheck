#!/usr/bin/env bash
# Session start: make sure deps are installed and the dev server is running,
# then print where things are. Safe to run repeatedly.
set -u
cd "$(dirname "$0")/.." || exit 1
echo "node $(node -v)  (CI uses Node $(cat .nvmrc))"
[ -d node_modules ] || npm ci
if ! curl -s -o /dev/null http://127.0.0.1:5173/; then
  nohup npm run dev > /tmp/pathcheck-dev.log 2>&1 &
  for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 1; done
fi
curl -s -o /dev/null -w "dev server: http://127.0.0.1:5173/ -> HTTP %{http_code}\n" http://127.0.0.1:5173/
echo "branch: $(git branch --show-current)  head: $(git rev-parse --short HEAD)"
node scripts/status.mjs
