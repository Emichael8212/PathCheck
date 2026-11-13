# PR Acceptance Test

## PR Information
- PR number: #4
- Title: Supabase auth, persistence and RLS security
- Commit SHA: `8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd`
- Merged baseline: `2bb6b3f8e36039a243ea3af389380019256357b7` (human merge of PR #3)
- Test type: real local PostgreSQL/REST security and persistence
- Feature being verified: owner isolation, anonymous denial, revision conflicts, quota, recent-auth deletion and JSON integrity
- Human acceptance status: **PASS (human-executed, 2026-11-13)** for the pinned baseline and PR head. SQL172 PASS; real REST1 PASS with1 expected configuration-guard skip.
- Eligibility: **READY TO MERGE** at aeaee0b after human recovery PASS. Historical database acceptance remains PASS; current CI and independent review pass. Human alone performs the merge.

## Before You Begin
Git, Node24–26/npm, Python3, Colima, Docker CLI and Supabase CLI on macOS. Verified
versions: Colima0.10.3, Docker29.9.3, SupabaseCLI3.1.0, PostgreSQL17. Tools are already
installed on this computer. For another Mac with Homebrew, install using
`brew install colima docker supabase/tap/supabase` before continuing. Use only the
dedicated synthetic test stack. No hosted project, production credentials or student
records are needed. Merged PR#3 supplies local configuration; it is not production config. Only PR#4 is
combined with this baseline; frontend, engine and application.patch are unnecessary.
Run one stage at a time. Setup success is not security-test PASS.

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-pr4-human
git worktree add /private/tmp/pathcheck-pr4-human -b integration/pr4-human 2bb6b3f8e36039a243ea3af389380019256357b7
cd /private/tmp/pathcheck-pr4-human
git merge --no-commit --no-ff 8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd
npm ci
test "$(git rev-parse HEAD)" = 2bb6b3f8e36039a243ea3af389380019256357b7
test "$(git rev-parse MERGE_HEAD)" = 8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd
test ! -e supabase/.temp/project-ref
printf "Stage 1 setup PASS — security tests NOT RUN\n"
)
```

Stop if any command fails. Do not reuse an unknown existing directory or resolve a
merge conflict by guessing. Expected: merge stops before committing; npm installs
the lockfile. These commands never merge into main or push anything. If the
checkout was prepared by the lead and left for your test, verify its recorded SHAs
before reusing it; otherwise use the fresh procedure above. The Git history remains
at 2bb6b3f with the single pinned PR#4 head recorded in the linked worktree's merge-state file. To inspect it safely, run:

```sh
(
set -eu
cd /private/tmp/pathcheck-pr4-human
git rev-parse HEAD
git rev-parse --git-path MERGE_HEAD
)
```

The second command prints the actual merge-state file path (`.git` is a file in a linked worktree). Open that path in your editor and confirm the pinned PR#4 SHA above before reusing an existing prepared checkout.

## Step-by-Step Test
1. Start the dedicated VM and reuse/create its localhost-only network:
   ```sh
   (
   set -eu
   colima start pathcheck-test --cpus 2 --memory 4 --disk 30 --activate=false --ssh-config=false --mount /private/tmp/pathcheck-pr4-human:w
   if ! docker context inspect colima-pathcheck-test >/dev/null 2>&1; then
     docker context create colima-pathcheck-test --docker "host=unix://${HOME}/.colima/pathcheck-test/docker.sock"
   fi
   test "$(docker context inspect colima-pathcheck-test --format '{{.Endpoints.docker.Host}}')" = "unix://${HOME}/.colima/pathcheck-test/docker.sock"
   docker --context colima-pathcheck-test info --format '{{.ServerVersion}}'
   if ! docker --context colima-pathcheck-test network inspect pathcheck-local-only >/dev/null 2>&1; then
     docker --context colima-pathcheck-test network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 pathcheck-local-only
   fi
   test "$(docker --context colima-pathcheck-test network inspect pathcheck-local-only --format '{{.Driver}}')" = bridge
   test "$(docker --context colima-pathcheck-test network inspect pathcheck-local-only --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}')" = 127.0.0.1
   )
   ```
2. Start Supabase. CLI startup prints local credentials, so keep its output in a
   private file and **never screenshot or share that file**:
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-pr4-human
   test ! -e supabase/.temp/project-ref
   umask 077
   chmod 600 /private/tmp/pathcheck-human-local-start.log 2>/dev/null || true
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
   cd /private/tmp/pathcheck-pr4-human
   test ! -e supabase/.temp/project-ref
   DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only
   DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only
   )
   ```
4. Run real two-user REST authorization, passing the local public key privately:
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-pr4-human
   python3 - <<'PY'
   import json, os, re, subprocess
   stack_env = dict(os.environ, DOCKER_CONTEXT='colima-pathcheck-test')
   status = subprocess.run(['supabase','status','-o','json'], env=stack_env,
                           capture_output=True, text=True, check=True)
   local = json.loads(status.stdout)
   assert local['API_URL'] in ('http://127.0.0.1:55431','http://localhost:55431')
   test_env = dict(os.environ, PATHCHECK_LIVE_ALLOW_REMOTE_TEST_PROJECT='0', PATHCHECK_LIVE_SUPABASE_URL=local['API_URL'],
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
Report exact SHA, both summaries and result. Attach your own screenshots directly to GitHub.

## Cleanup
```sh
(
set -eu
cd /private/tmp/pathcheck-pr4-human
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
cd /Users/_eman5michael/PathCheck
git worktree remove --force /private/tmp/pathcheck-pr4-human
git branch -D integration/pr4-human
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


## Preparation verification — 2026-11-13
Merged main + pinned PR#4 combine cleanly without frontend/engine branches. Installed
CLI help confirms the commands/flags: Colima0.10.3 (`--cpus`), Docker29.9.3 and
Supabase3.1.0. Supabase3.1.0 reset/test target local by default; no `--remote`,
linked project or remote URL is used. The previous `--local` reset spelling is removed.
The dedicated Colima VM is stopped; its Docker context was absent at inspection,
so stage2 creates it only if absent and verifies its exact local socket. Existing
networks must have the required loopback binding; mismatches stop instead of weakening
isolation. This preparation does not start services, reset databases, or execute
SQL/REST acceptance. Prior agent SQL172/REST1 evidence remains historical; human
acceptance remains NOT RUN until reported by the user.


## Human result — 2026-11-13
User completed setup, dedicated VM/network checks, localhost-only published-port
inspection, local reset, SQL172/3files PASS and real REST owner-isolation/CAS/Save-as-new
PASS (231ms;1passed/1configuration-guard skipped). These are human-supplied execution
results, not an agent-run test. The test ran on main2bb6b3f plus PR4 head8d28602.
Human manages screenshot evidence on GitHub. This does not certify production or
pending OTP/browser/Gemini integration gates.

Cleanup confirmed by the human: Supabase containers and the dedicated Colima VM
stopped successfully; local backup volumes retained. No screenshot path requested.
The later coverage audit found a separate in-memory save/recovery defect outside
this SQL/REST scenario; it does not invalidate the reported security assertions.

## Recovery correction acceptance — PASS

The historical database acceptance above remains PASS for unchanged SQL/REST code.
The new recovery behavior at `aeaee0bfb245bf1d5ef16c0ae6d9a31395e9992e`
requires a separate human test; no database or Colima is needed. Independent review
and current CI must pass before the lead presents this checkpoint.

From the existing S worktree, verify the exact head and run only synthetic in-memory
regressions (no checkout/reset, account, credentials or student data):

```sh
(
set -eu
cd /Users/_eman5michael/pathcheck-supabase
test "$(git rev-parse HEAD)" = aeaee0bfb245bf1d5ef16c0ae6d9a31395e9992e
npm ci --ignore-scripts
node node_modules/vitest/vitest.mjs run tests/persistence/saveFlows.test.ts tests/persistence/guestRecovery.test.ts --reporter=verbose
)
```

Expected: **2 test files passed, 70 tests passed**. In the A4 scoped-cleanup group,
saving A must preserve unrelated B byte-for-byte, preserve newer same-ID edits,
and report cleanup failures truthfully. The tests exercise actual save/recovery
modules; only HTTP/storage infrastructure uses deterministic in-memory fixtures.
PASS requires all assertions passing at the pinned head. Any failure is FAIL;
head mismatch means stop and ask for updated instructions. Screenshot checkpoint:
the A/B preservation test and final passing summary; all data are synthetic.
The human attaches evidence directly to GitHub. No screenshot paths needed.
Cleanup: the process exits automatically; no services or persistent test data exist.
Limitations: this does not prove simultaneous browser-tab atomicity or live auth;
those retain their separate integration gates.

Human reported the expected result for the pinned recovery procedure on 2026-11-13:
2 files /70 tests passed. Recovery acceptance **PASS** at
`aeaee0bfb245bf1d5ef16c0ae6d9a31395e9992e`. GitHub head unchanged, foundation CI
43473452035 SUCCESS and merge state CLEAN verified after the report. No screenshot
paths requested. Independent review found no blocking defect; browser auth/reopen
and simultaneous-tab integration remain separate pending gates.
