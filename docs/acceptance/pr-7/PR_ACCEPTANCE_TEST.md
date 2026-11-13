# PR Information

- PR number:7 — [server-only transcript admission store + retry check](https://github.com/Emichael8212/PathCheck/pull/7)
- Commit SHA:`c394241922a7513b9101561426d2979a0f1c0a17`
- Test type:live local PostgreSQL security and concurrency.
- Feature:one-use tickets, consent, quotas, cost/lease accounting and retry authorization without another admission.
- Human status:**NOT RUN**. Agent SQL371/race results are not human acceptance.

## Before You Begin

Required:Git, Bash, Colima, Docker CLI, Supabase CLI3.1.0 on this Mac. All data is
synthetic and local. No Gemini key, production credential, hosted link or billing.
The test changes only the dedicated `pathcheck-test` local database; reset removes
its disposable test rows. The existing PR4 human PASS remains historical evidence,
not approval of this new admission/retry behavior.

## Step-by-Step Test

1. Prepare the exact isolated checkout (fail if this path/branch already exists):

   ```sh
   (
   set -eu
   cd /Users/_eman5michael/PathCheck
   git fetch origin
   test "$(git rev-parse origin/feat/transcript-admission)" = c394241922a7513b9101561426d2979a0f1c0a17
   test ! -e /private/tmp/pathcheck-pr7-human
   git worktree add /private/tmp/pathcheck-pr7-human -b integration/pr7-human c394241922a7513b9101561426d2979a0f1c0a17
   cd /private/tmp/pathcheck-pr7-human
   test ! -e supabase/.temp/project-ref
   printf 'PR7 pinned setup PASS — human security tests NOT RUN\n'
   )
   ```

2. Start the dedicated VM and verify the existing network isolation:

   ```sh
   colima start pathcheck-test --cpus 2 --memory 4 --disk 30 --activate=false --ssh-config=false --mount /private/tmp/pathcheck-pr7-human:w
   (
   set -eu
   if ! docker --context colima-pathcheck-test network inspect pathcheck-local-only >/dev/null 2>&1; then
     docker --context colima-pathcheck-test network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 pathcheck-local-only
   fi
   test "$(docker --context colima-pathcheck-test network inspect pathcheck-local-only --format '{{.Driver}}')" = bridge
   test "$(docker --context colima-pathcheck-test network inspect pathcheck-local-only --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}')" = 127.0.0.1
   printf 'Local network isolation PASS\n'
   )
   ```

3. Start local Supabase; keep its credential-bearing startup output private:

   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-pr7-human
   test ! -e supabase/.temp/project-ref
   umask 077
   DOCKER_CONTEXT=colima-pathcheck-test supabase start --network-id pathcheck-local-only --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > /private/tmp/pathcheck-pr7-local-start.log 2>&1
   docker --context colima-pathcheck-test ps --format '{{.Names}} {{.Ports}}'
   )
   ```

   Require published ports55431/55432/55434 on127.0.0.1 only. Do not proceed on
   wildcard bindings or startup failure. Never share the private startup log.

4. Apply the pinned migrations and execute real database assertions:

   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-pr7-human
   test ! -e supabase/.temp/project-ref
   DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only
   DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only
   )
   ```

5. Execute genuine concurrent transactions against the same local database:

   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-pr7-human
   bash -n supabase/tests/admission/concurrency.sh
   bash supabase/tests/admission/concurrency.sh
   )
   ```

## Expected Result

SQL:`Files=5, Tests=371`, `All tests successful`, `Result: PASS`.
The62 new assertions cover retry ownership, live lease, dispatched state,
revocation, service-role grants and unchanged tickets/reservations/quota/cost.
Earlier assertions still verify owner isolation and authorization.

Race tests:12 workers actually queued behind the shared lock; allowed winners
1 replay,1 session,3 network,5 budget. Both dispatch/revoke and retry/revoke test
6 pairs with12 queued workers; ordering counts may vary. Expect22 reservations,
cleanup0 rows remaining and final`Result: PASS`.

## Screenshot Checkpoint

You capture SQL371/PASS and the race summary including retry/revoke and cleanup.
These outputs contain synthetic IDs/counts, not keys. Do not capture startup/status
JSON, private logs or environment variables. Attach screenshots directly to GitHub;
no screenshot paths are needed by agents.

## Pass/Fail Criteria

PASS requires localhost isolation, every371 assertion and every race invariant
passing. FAIL includes any denied expected operation, unauthorized success, changed
quota/lease during a retry check, nonzero cleanup or missing contention. Missing
infrastructure is BLOCKED, never a mocked PASS. Report human outcome against the
pinned SHA before a merge recommendation.

## Cleanup

```sh
cd /private/tmp/pathcheck-pr7-human
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
```

Keep the worktree for follow-up; no deletion of real work is required. SQL fixtures
roll back, concurrency fixtures clean themselves, and only synthetic local backups remain.

## Known Limitations

This accepts the database infrastructure, not Google accuracy, browser bot protection,
real-transcript privacy, hosted security or deployment. The agent verified these
commands on the composed local candidate and confirmed the four SQL/race files
exactly match this PR head; the final static-test-only correction changes no SQL.
