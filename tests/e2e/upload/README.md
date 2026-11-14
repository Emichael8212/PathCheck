# Isolated browser upload integration

This executable suite uses real U screens, G browser client/handler/parser/provider
validation, L RPC adapter and E normalization/planner, plus real local PostgreSQL
admission. Only Google and bot-verification transports are simulated. It never loads
the Gemini key or makes a Google request. Passing it is not live API accuracy or
human acceptance; the separate synthetic benchmark establishes measured extraction.

Dependencies: current L integration branch, U PR6, S PR7 retry RPC and G PR8.
PR6/7/8 are now merged; use the current PR9 checkout. Exact tested heads are
recorded in IMPLEMENTATION_STATUS.md. The ordinary app wiring is committed in PR9;
do not apply the historical `application.patch` to this version.

After starting the dedicated local stack using
[local-security.md](../../../docs/testing/local-security.md), from the candidate:

```sh
DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only
DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only
bash supabase/tests/admission/concurrency.sh
node tests/e2e/upload/run.mjs
npm run check
```

Expected:371 SQL assertions PASS, all race checks PASS with cleanup0, seven browser
tests PASS. The browser launcher obtains only isolated local Supabase credentials
in a child environment, verifies the exact local URL and redacts output. HTTPS binds
127.0.0.1:5184; the generated local certificate key is0600 under/private/tmp, never
Git. No screenshots, videos or traces are captured. Test-only controls, synthetic
eligibility and fake bot proof are never part of the application build/public route.

The two CIS300 cases upload a fictional generated PDF through the real handler,
local SQL and G→L→E normalization against the actual current and historical catalogs.
Google responses are simulated: current matches CIS-300, historical remains unmatched;
neither case invents a CIS304 equivalency or a governing catalog year. The separate
live Google fixture remains SYN101, so these cases do not establish live CIS300
extraction accuracy.

Scenarios: proposal→explicit acceptance→real planner; two503s→one admission with
two consent/lease checks; retry exhaustion→manual-entry success; malformed output
withheld without retry; withdrawal duringbackoff→HTTP200 revocation and no new
egress or accepted rows. Counters measure RPC calls, not persisted-row counts;
SQL assertions separately verify reservation/quota invariants.

The default smoke gate now tests the actual application, manual record acceptance
and uncertainty-preserving PDF export.
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
approved real-transcript terms/privacy and final application/account composition.
Live synthetic browser extraction and its human acceptance have passed at the
recorded pins; preserve their evidence and revalidate affected changes. The synthetic provider factory is not wired into a public bypass.
