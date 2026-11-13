# Combined PR #6 / PR #8 / PR #9 Human Acceptance Test

## PR Information

- PR #6: Frontend UX — three screens, transcript controls, planner and PDF export.
  Head `52a72dac5844e471c2957305105f4f344402abec`.
- PR #8: Secure transcript extraction transport and bounded retries.
  Head `6e29425404a7a53bf7e7a6da19d477b49e89469a`.
- PR #9: Transcript admission and live synthetic upload integration.
  Implementation `f1b03b4f456d81d281f0cd3dd3aeafe29da0d6ba`.
  Later documentation-only commits do not change this tested implementation.
- Authoritative main/admission baseline: human PR #7 merge
  `1c0b8d3bb3af6a1fcc2184d5f8a5c94e87dc25bc`.
- Test type: real Chrome → HTTPS local endpoint → local PostgreSQL admission →
  real Gemini 3.5 Flash-Lite → deterministic normalization → explicit acceptance → planner.
- Human status: **NOT RUN for this combined procedure**. Agent live run PASS is separate.
- Eligibility: **READY for human verification**: pinned-head CI and independent reviews pass.
  This does not approve public deployment, real transcripts or the entire MVP.

| PR | Requirements verified by this procedure |
|---|---|
| 6 | F04 consent/file selection, raw summary and optional review; F01/F03 explicit Accept and continue; planner controls and feedback |
| 8 | Actual PDF extraction through the real provider, raw-row validation and failure-safe boundary; one-use admission and final consent/lease check |
| 9 | Real SQL adapter, private server key, full G→L→E composition, current analysis fingerprints and validated preview/apply/undo |

One explicitly reported combined PASS can satisfy these scoped assertions for all
three pinned revisions. Earlier manual-entry/PDF-export acceptance remains valid;
this procedure does not ask for those accepted tests again. Simulated 503/revocation
regressions and live SQL tests remain separate automated evidence.

## Before You Begin

Tools: Git, Node 24–26/npm, Chrome, OpenSSL, Colima, Docker CLI, Supabase CLI 3.1.0.
Use this Mac's existing private server configuration:
`/Users/_eman5michael/pathcheck-lead/supabase/functions/.env`.
The key is already configured; do not print it, copy it into the new worktree, or
paste it into chat. No new credential or billing setup is needed.

Only the generated `live-upload-syn101-v1.pdf` is accepted. It contains no personal
information and uses an explicitly synthetic academic catalog, not ASU policy.
Fixture SHA256:
`c078a421891a21be6b8391a7ddfbebafdcd3856fd5fe7c70dc8f0db4712d2dd9`.
The existing 18-case benchmark is not rerun. This procedure makes one new user
extraction request; 503 retries, if necessary, remain within that admission.

## Step-by-Step Test

### Stage 1 — Reconstruct the pinned checkout

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-upload-human
git worktree add /private/tmp/pathcheck-upload-human \
  -b integration/upload-human \
  1c0b8d3bb3af6a1fcc2184d5f8a5c94e87dc25bc
cd /private/tmp/pathcheck-upload-human
git merge --no-commit --no-ff \
  f1b03b4f456d81d281f0cd3dd3aeafe29da0d6ba \
  6e29425404a7a53bf7e7a6da19d477b49e89469a \
  52a72dac5844e471c2957305105f4f344402abec
npm ci --ignore-scripts
test "$(git rev-parse HEAD)" = 1c0b8d3bb3af6a1fcc2184d5f8a5c94e87dc25bc
test ! -e supabase/.temp/project-ref
printf 'Pinned upload setup PASS — human upload NOT RUN\n'
)
```

Expected: clean noncommitting merge, dependencies installed, final setup PASS line.
Do not commit or push this temporary integration branch. A conflict, existing path
or other failure means stop; preserve the worktree for inspection.

### Stage 2 — Start isolated local services

PR #7 acceptance already established these tools. Start them for the upload test:

```sh
(
set -eu
cd /private/tmp/pathcheck-upload-human
colima start pathcheck-test --cpus 2 --memory 4 --disk 30 \
  --activate=false --ssh-config=false \
  --mount /private/tmp/pathcheck-upload-human:w
if ! docker context inspect colima-pathcheck-test >/dev/null 2>&1; then
  docker context create colima-pathcheck-test \
    --docker "host=unix://${HOME}/.colima/pathcheck-test/docker.sock"
fi
test "$(docker context inspect colima-pathcheck-test --format '{{.Endpoints.docker.Host}}')" = "unix://${HOME}/.colima/pathcheck-test/docker.sock"
if ! docker --context colima-pathcheck-test network inspect pathcheck-local-only >/dev/null 2>&1; then
  docker --context colima-pathcheck-test network create --driver bridge \
    --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 pathcheck-local-only
fi
test "$(docker --context colima-pathcheck-test network inspect pathcheck-local-only --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}')" = 127.0.0.1
test ! -e supabase/.temp/project-ref
umask 077
touch /private/tmp/pathcheck-upload-human-start.log
chmod 600 /private/tmp/pathcheck-upload-human-start.log
DOCKER_CONTEXT=colima-pathcheck-test supabase start \
  --network-id pathcheck-local-only \
  --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  > /private/tmp/pathcheck-upload-human-start.log 2>&1
docker --context colima-pathcheck-test ps \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
)
```

Require API 55431, DB 55432 and mail 55434 bound only to 127.0.0.1. Never share the
startup log or status JSON; they can contain local keys. Stop on wildcard bindings.
Then initialize this disposable database, so earlier simulated cost reservations
cannot interfere. This resets synthetic local data only; it does not reset Google
usage or repeat your accepted PR #7 human tests:

```sh
(
set -eu
cd /private/tmp/pathcheck-upload-human
test ! -e supabase/.temp/project-ref
DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only
)
```

### Stage 3 — Start the live synthetic server

```sh
(
set -eu
cd /private/tmp/pathcheck-upload-human
test -f /Users/_eman5michael/pathcheck-lead/supabase/functions/.env
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u PATHCHECK_GEMINI_MODEL \
  PATHCHECK_GEMINI_FREE_TIER_CONFIRMED=1 \
  node --env-file=/Users/_eman5michael/pathcheck-lead/supabase/functions/.env \
  tests/e2e/upload/runLive.mjs --serve
)
```

The process-only free-tier confirmation uses your existing explicit approval; the
saved environment file is unchanged. Expected console lines include:

```text
Local synthetic upload ready: https://127.0.0.1:5185/tests/e2e/upload/live.html
Only generated fixture accepted: /private/tmp/pathcheck-live-upload/live-upload-syn101-v1.pdf
Real Gemini 3.5 Flash-Lite / local SQL; free synthetic only. No public bot or real-data approval.
Keep this terminal open. Stop with Ctrl-C after the human test.
```

A missing configuration, existing benchmark lock, exhausted quota or startup error
is BLOCKED. Do not delete the quota ledger or bypass its lock. No automatic paid
fallback exists. Keep this terminal running for the browser steps.

### Stage 4 — Upload and accept the actual extraction in Chrome

1. Open `https://127.0.0.1:5185/tests/e2e/upload/live.html` in Chrome. The local
   self-signed certificate may require Advanced → Proceed for this exact loopback
   address. Do not disable Chrome security globally.
2. Confirm the banner says local synthetic acceptance. Click **Download the
   supported synthetic PDF**. Do not use a personal transcript or another PDF.
3. Select the explicitly synthetic university/program option and target **Fall 2027**.
   Click **Continue as guest**.
4. On Academic Record, confirm PDF selection is disabled before consent. Read the
   disclosure; select **I consent to sending this PDF to Google Gemini for course extraction.**
5. Select the downloaded `live-upload-syn101-v1.pdf` (or the exact generated path
   printed above), then click **Send for extraction** once.
6. Expect **1 proposed row(s) of 1 detected**, with review/uncertainty information.
   Click **Show all proposed rows**. Confirm `SYN 101`, `Fall 2026`, earned/attempted
   `3/3`, grade `B`. The PDF prints completion status `completed` and the row title
   `Synthetic Foundations`; automated assertions also verify those raw fields and
   null institution. Capture checkpoint A. No record should have been automatically accepted.
7. Click **Accept and continue** once. Expect **Record accepted** and the real
   Graduation Planner. Unverified extraction information must not become a
   university approval or guaranteed graduation claim.

### Stage 5 — Verify real engine behavior after upload

1. Click **I already selected courses**.
2. Add `SYN 201` in **Spring 2027**, then `SYN 301` in **Spring 2027**.
3. Expect a prerequisite warning: SYN 301 requires SYN 201 in a prior term.
4. Open the first recommended change. Its preview moves SYN 301 to **Fall 2027**;
   the active timeline must stay unchanged until Apply.
5. Read and acknowledge the assumptions, then click **Apply**. Expect **Change
   applied**, SYN 201 in spring and SYN 301 in fall. Other evidence gaps can remain.
   Capture checkpoint B; no verified-graduation guarantee is expected.
6. Click **Undo**. Expect **Undone**, both placements back in spring and the
   prerequisite conflict restored. Capture checkpoint C.
7. In a second tab, open `https://127.0.0.1:5185/__live/evidence`. It contains safe
   counts/statuses, no keys or raw coursework. Expect one issue/admit/dispatch/finish,
   at least one provider attempt with final status 200, and
   `rpc.retry == quotaReservations == providerAttempts.length` (1 on the agent's
   successful run). The field `retry` counts the final authorization check on
   EVERY egress, including the first; it does not imply another user admission.
   Expect `evidenceWriteFailed:false`. Capture checkpoint D if useful.

## Expected Result

The actual provider extracts exactly one course attempt. G validates raw rows;
E alone maps SYN 101 to the synthetic catalog; explicit acceptance updates the
record and current analysis. E identifies same-term SYN 201/SYN 301 as invalid prior-
term ordering, and L's validated commands preserve preview/apply/undo consistency.
No hardcoded provider response is used by this live server. Provider 503 recovery,
revocation, malformed responses and manual fallback are separately automated tests;
this successful live run does not prove a live 503 or live cancellation occurred.

## Screenshot Checkpoint

You capture screenshots and attach them directly to GitHub: A proposed raw-row
summary, B applied timeline and uncertainties, C restored warning after Undo,
D optional sanitized server evidence. Screenshots do not replace automated assertions.
Do not capture the env file, startup/status logs, cookies or authorization headers.
No agent captures screenshots or asks for screenshot paths.

## Pass/Fail Criteria

PASS requires all expected actual extraction, explicit acceptance and planner
interactions, no extra/missing course row, correct critical values, and evidence of
real Google 200 under one admission. Any wrong/omitted course, silent acceptance,
incorrect planning mutation or stale results is FAIL. Provider exhaustion or a
missing service is BLOCKED; never substitute simulated responses for human PASS.
Report **combined upload PASS/FAIL/BLOCKED** for these pinned revisions, including
which step failed if applicable. Separate PR #6/8/9 human statuses remain NOT RUN until
that report. This does not approve unrelated pending account/cloud or release gates.

## Cleanup

Press Ctrl-C in the server terminal. Then:

```sh
(
set -eu
cd /private/tmp/pathcheck-upload-human
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
printf 'Combined upload cleanup PASS\n'
)
```

Keep worktrees and the usage ledger. Local backups contain synthetic test data only;
no original transcript or extracted text is stored by this server. The generated
fixture is deliberately retained outside Git. Reports retain counters/digests/statuses
only. Do not reset or delete any hosted data.

## Known Limitations

- This is a local fixture-only composition of real application modules, not a public
  production deployment. The ordinary production transcript endpoint remains disabled.
- Local one-use capabilities are not public Turnstile verification. Public trusted
  gateway/bot enforcement and resource-isolated PDF processing remain mandatory gates.
- The free tier is authorized only for synthetic fixtures. Real transcripts remain
  disabled pending suitable data-handling terms and separate approval.
- This synthetic catalog does not establish ASU prerequisite, repeat or transfer policy.
- Full cloud-account composition and the rest of the application/release checklist
  remain separate; this acceptance is not a declaration that the entire MVP is done.
- External Google 503/429 can make the human run temporarily BLOCKED. Retries are bounded;
  other clients' use of this Google project remains outside the local ledger's knowledge.
