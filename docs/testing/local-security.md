# Disposable local security verification

Use only synthetic accounts and a dedicated local stack. No hosted project link,
production key, or production database is needed. The lead verified this procedure
with Colima 0.10.3, Docker CLI 29.9.3, Supabase CLI 3.1.0 and PostgreSQL 17.
The committed configuration is test-only: local email confirmation is disabled.
Do not reuse these auth settings for deployment.

For current pinned commits, context checks and redacted human-test output, use
[the canonical PR#4 acceptance guide](../acceptance/pr-4/PR_ACCEPTANCE_TEST.md).
Supabase3.1.0 targets local by default; never add `--remote` to this procedure.

From a scratch integration worktree containing PR #4 migrations/tests and PR #3
configuration, install the local tools if needed, then start a dedicated VM:

```sh
brew install colima docker supabase/tap/supabase
colima start pathcheck-test --cpus 2 --memory 4 --disk 30 --activate=false --ssh-config=false --mount /private/tmp/pathcheck-verification:w
docker --context colima-pathcheck-test network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 pathcheck-local-only
```

Reuse an existing dedicated VM/network rather than recreating it. Adjust the mount
path to the scratch worktree. Capture startup output privately because the CLI
prints local keys. Do not commit this output.

```sh
umask 077
DOCKER_CONTEXT=colima-pathcheck-test supabase start --network-id pathcheck-local-only --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > /private/tmp/pathcheck-local-start.log 2>&1
DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only
```

The explicit network flag is required on the test command too. First startup
applies migrations. If migration SQL changes, reset **only this disposable local
stack** with `DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only`
and rerun tests. Confirm published ports are localhost-only:

```sh
docker --context colima-pathcheck-test ps --format '{{.Names}} {{.Ports}}'
```

API: `http://127.0.0.1:55431`; PostgreSQL: port 55432; local test mail: port 55434.
Run the real REST test without printing or saving its key:

```sh
python3 - <<'PY'
import json, os, subprocess
stack_env = dict(os.environ, DOCKER_CONTEXT='colima-pathcheck-test')
status = subprocess.run(['supabase', 'status', '-o', 'json'], env=stack_env,
                        capture_output=True, text=True, check=True)
local = json.loads(status.stdout)
assert local['API_URL'] in ('http://127.0.0.1:55431', 'http://localhost:55431')
test_env = dict(os.environ,
    PATHCHECK_LIVE_SUPABASE_URL=local['API_URL'],
    PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY=local['ANON_KEY'])
raise SystemExit(subprocess.call(['node', 'node_modules/vitest/vitest.mjs', 'run',
    'tests/persistence/live.supabase.test.ts'], env=test_env))
PY
```

Expected: pgTAP `Result: PASS`, every planned assertion executed; live authorization case one
pass (the separate invalid-configuration guard is intentionally skipped for a valid
environment). Run the invalid-configuration guard separately with a deliberately
fake remote URL and fake key; expect a nonzero exit and one failed test, never a
silently skipped authorization run. Missing configuration, a skipped test, or a failing assertion
is not live-security acceptance. These tests do not establish production readiness,
OTP/browser lifecycle integration, or real-transcript privacy approval.

After evidence is recorded, stop the test stack/VM:

```sh
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
```

References: [Supabase local development](https://supabase.com/docs/guides/local-development),
[Colima](https://github.com/abiosoft/colima). No default Docker context switch or
background login service is required.
