# Isolated browser upload integration

This executable suite uses real U screens, G browser client/handler/parser/provider
validation, L RPC adapter and E normalization/planner, plus real local PostgreSQL
admission. Only Google and bot-verification transports are simulated. It never loads
the Gemini key or makes a Google request. Passing it is not live API accuracy or
human acceptance; the separate synthetic benchmark establishes measured extraction.

Dependencies: current L integration branch, U PR6, S PR7 retry RPC and G PR8.
Use the lead's uncommitted local integration candidate; never commit/push it.
Exact tested heads are recorded in IMPLEMENTATION_STATUS.md. Apply the existing
`tests/e2e/integration/application.patch` when reconstructing the combined snapshot.

After starting the dedicated local stack using
[local-security.md](../../../docs/testing/local-security.md), from the candidate:

```sh
DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only
DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only
bash supabase/tests/admission/concurrency.sh
node tests/e2e/upload/run.mjs
PATHCHECK_TEST_BUILD=1 npm run check
```

Expected:371 SQL assertions PASS, all race checks PASS with cleanup0, five browser
tests PASS. The browser launcher obtains only isolated local Supabase credentials
in a child environment, verifies the exact local URL and redacts output. HTTPS binds
127.0.0.1:5184; the generated local certificate key is0600 under/private/tmp, never
Git. No screenshots, videos or traces are captured. Test-only controls, synthetic
eligibility and fake bot proof are never part of the application build/public route.

Scenarios: proposal→explicit acceptance→real planner; two503s→one admission with
two consent/lease checks; retry exhaustion→manual-entry success; malformed output
withheld without retry; withdrawal duringbackoff→HTTP200 revocation and no new
egress or accepted rows. Counters measure RPC calls, not persisted-row counts;
SQL assertions separately verify reservation/quota invariants.

The composed-app smoke mode runs the existing actual-application test. Without
PATHCHECK_TEST_BUILD=1, the lead foundation build retains its scaffold smoke gate.
The upload suite requires local infrastructure and therefore is separate from that
default check; do not mark it passed merely because generic CI is green.

Stop the local services after verification:

```sh
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
```

No production or hosted project is touched. Test metadata remains only in the
dedicated local backup volume; no PDF bytes or extracted rows are stored in SQL.
Remaining gates: real gateway/bot attestation, runtime PDF resource isolation,
approved real-transcript terms/privacy, live browser extraction acceptance and
human PR review. The synthetic provider factory is not wired into a public bypass.
