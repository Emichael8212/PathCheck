# PR Acceptance Test

## PR Information
- PR number: #4
- Title: Supabase auth, persistence and RLS security
- Commit SHA: `8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd`
- Test type: real local PostgreSQL/REST security and persistence
- Feature being verified: owner isolation, anonymous denial, revision conflicts, quota, recent-auth deletion and JSON integrity
- Human acceptance status: **NOT RUN**. Agent passes do not satisfy this checkpoint.
- Eligibility: local tools available; instructions ready after agent verification below.

## Before You Begin
Git, Node24–26/npm, Python3, Colima, Docker CLI and Supabase CLI on macOS. Verified
versions: Colima0.10.3, Docker29.9.3, SupabaseCLI3.1.0, PostgreSQL17. Tools are already
installed on this computer. For another Mac with Homebrew, install using
`brew install colima docker supabase/tap/supabase` before continuing. Use only the
dedicated synthetic test stack. No hosted project, production credentials or student
records are needed. PR#3 supplies local configuration; it is not production config.

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-human-acceptance
git worktree add /private/tmp/pathcheck-human-acceptance -b integration/human-acceptance e941539c4ae12ad6f6f3b07a51dc7394a06a3965
cd /private/tmp/pathcheck-human-acceptance
git merge --no-commit --no-ff 645111c43f65b21fc73b776a763360a8cbddb4a4 541ba01a62a163672b08483658d66794b7cc273b 8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd
git apply tests/e2e/integration/application.patch
npm ci
)
```

Stop if any command fails. Do not reuse an unknown existing directory or resolve a
merge conflict by guessing. Expected: merge stops before committing; npm installs
the lockfile. These commands never merge into main or push anything. If the
checkout was prepared by the lead and left for your test, verify its recorded SHAs
before reusing it; otherwise use the fresh procedure above. The Git history remains
at e941539 with the three pinned feature heads recorded in the linked worktree's merge-state file. To inspect it safely, run:

```sh
(
set -eu
cd /private/tmp/pathcheck-human-acceptance
git rev-parse HEAD
git rev-parse --git-path MERGE_HEAD
)
```

The second command prints the actual merge-state file path (`.git` is a file in a linked worktree). Open that path in your editor and confirm the three pinned SHAs above before reusing an existing prepared checkout.

## Step-by-Step Test
1. Start the dedicated VM and reuse/create its localhost-only network:
   ```sh
   (
   set -eu
   colima start pathcheck-test --cpu 2 --memory 4 --disk 30 --activate=false --ssh-config=false --mount /private/tmp/pathcheck-human-acceptance:w
   if ! docker --context colima-pathcheck-test network inspect pathcheck-local-only >/dev/null 2>&1; then
     docker --context colima-pathcheck-test network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 pathcheck-local-only
   fi
   )
   ```
2. Start Supabase. CLI startup prints local credentials, so keep its output in a
   private file and **never screenshot or share that file**:
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-human-acceptance
   umask 077
   DOCKER_CONTEXT=colima-pathcheck-test supabase start --network-id pathcheck-local-only --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > /private/tmp/pathcheck-human-local-start.log 2>&1
   docker --context colima-pathcheck-test ps --format '{{.Names}} {{.Ports}}'
   )
   ```
   Expect API55431, database55432 and test mail55434 mapped only to `127.0.0.1`.
   Do not proceed if published ports bind all interfaces or startup fails.
3. Reset **only this disposable local test database**, then run SQL assertions.
   This removes its synthetic test accounts/backups from the active database and
   reapplies the pinned migration; it never targets a hosted project. Do not use
   this dedicated project for real data. A restart alone can restore an older schema:
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-human-acceptance
   DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --local --network-id pathcheck-local-only
   DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only
   )
   ```
4. Run real two-user REST authorization, passing the local public key privately:
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-human-acceptance
   python3 - <<'PY'
   import json, os, re, subprocess
   stack_env = dict(os.environ, DOCKER_CONTEXT='colima-pathcheck-test')
   status = subprocess.run(['supabase','status','-o','json'], env=stack_env,
                           capture_output=True, text=True, check=True)
   local = json.loads(status.stdout)
   assert local['API_URL'] in ('http://127.0.0.1:55431','http://localhost:55431')
   test_env = dict(os.environ, PATHCHECK_LIVE_SUPABASE_URL=local['API_URL'],
                   PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY=local['ANON_KEY'])
   result = subprocess.run(['node','node_modules/vitest/vitest.mjs','run',
       'tests/persistence/live.supabase.test.ts','--reporter=verbose'],
       env=test_env, capture_output=True, text=True)
   output = result.stdout + result.stderr
   for name, value in local.items():
       if ('KEY' in name or 'SECRET' in name) and isinstance(value,str) and value:
           output = output.replace(value,'[REDACTED]')
   output = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED JWT]',output)
   print(output)
   raise SystemExit(result.returncode)
   PY
   )
   ```

## Expected Result
SQL: three files, **172 assertions**, `All tests successful`, `Result: PASS`.
REST: `enforces owner isolation, CAS and Save-as-new end to end` passes; **1 passed,
1 skipped**. The skipped case is the invalid-configuration guard, not authorization.
The test creates two synthetic users, rejects cross-owner reads/writes/deletes and
anonymous access, requires one winner in concurrent saves, and checks deletion.
SQL tests also reject missing/null required JSON fields and stale authentication.

## Screenshot Checkpoint
You capture the SQL command and172/PASS summary, then the sanitized REST test name
and1passed summary. Do not capture startup/status JSON, keys, mail inbox, shell env,
or private logs. The screenshots summarize assertions; the SQL and REST assertions
are the actual behavioral evidence.

## Pass/Fail Criteria
PASS requires localhost-only ports, SQL172 PASS and the real REST case passing.
A skipped REST authorization case, network error, missing tool, or unavailable VM is
BLOCKED. Any failed assertion is FAIL. Do not substitute mocked unit tests.
Report exact SHA, both summaries, result and your screenshots.

## Cleanup
```sh
(
set -eu
cd /private/tmp/pathcheck-human-acceptance
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
cd /Users/_eman5michael/PathCheck
git worktree remove --force /private/tmp/pathcheck-human-acceptance
git branch -D integration/human-acceptance
)
```
SQL fixtures roll back. Local REST accounts are disposable test data; stopping keeps
local backups for reproducibility. Do not delete or reset any hosted database.
Private startup logs may be deleted locally after troubleshooting; never commit them.

## Known Limitations
This verifies local DB/RPC security, not hosted production configuration, OTP/browser
lifecycle, concurrent guest-tab recovery, G admission storage or transcript privacy.
Those integration/release gates remain separate. PR#3 configuration is a reproducible
test dependency, not a requirement to deploy these settings. The mandatory local reset reapplies the pinned migration even when startup restores
a previous backup; do not silently test a different migration version.
