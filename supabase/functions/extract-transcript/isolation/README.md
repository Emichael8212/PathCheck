# Local isolated PDF inspection

Implements approved `SEC-LOCAL-PDF-001` for local synthetic testing. This is not a
hosted Supabase worker, public service, or real-transcript processing approval.

`createDockerPdfInspector({ imageId, onEvidence? })` returns the existing
`PdfInspector`. The lead creates one instance per local endpoint and injects it as
`pdf` into `createLocalSyntheticTranscriptRuntime` or the actual handler. Only
already-admitted, digest-checked PDF bytes reach this boundary. No admission,
ticket, consent, provider, cost, or academic contract changes.

## Enforced limits

| Control | Fixed local value |
|---|---|
| Input/pages | Existing 10 MiB / 20 pages |
| Memory | 256 MiB cgroup hard limit; memory+swap equal, so no swap |
| CPU | 0.5 CPU rate plus 3 CPU-second hard process limit |
| Wall | In-container `timeout` SIGKILL at 10 seconds; parent run deadline 12 seconds |
| Docker control calls | 5 seconds each; create/run/inspect/remove worst-case 27 seconds |
| Output | Maximum 1024 bytes; strict page-summary/fixed-failure schema |
| Local capacity | 2 in flight per reused inspector; never substitutes for SQL quotas |
| Identity | Immutable image SHA256, generated container name, fixed local Docker context |
| Privileges | Nonroot, all capabilities dropped, no-new-privileges, default seccomp |
| Privacy | No network, host mounts, PDF files, persistent container logs or core dumps; read-only root |

The parser receives bytes on stdin and returns only the bounded summary on stdout.
Its image contains bundled parser code, never the repository, secrets or fixtures.
The Docker daemon remains a trusted local development prerequisite. Memory controls
cover native buffers as well as the JS heap; Node's 160 MiB old-space setting is an
additional guard, not the security boundary. Filesystem policy permits only the
runtime's ephemeral device memory; no PDF is written there or elsewhere.

Cancellation kills the attached CLI **and explicitly removes the exact container**.
The handler waits for bounded inspector completion before settlement. Inspection
failure prevents provider dispatch; a killed worker never requests another ticket.
If removal cannot be confirmed, the inspector is quarantined and rejects later
calls. Do not recreate it to clear quarantine until the operator has reconciled
the specifically identified container. No broad Docker prune/reset is appropriate.

Sources: [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)
and [docker run controls](https://docs.docker.com/reference/cli/docker/container/run/).

## Reproduction and human acceptance preparation

Prerequisites: this PR's exact checkout, locked npm dependencies installed, Docker
CLI, and the already-approved `colima-pathcheck-test` context running. Do not stop
or reset a shared Supabase stack. No API key, private environment file or Google
request is required. A missing Docker context/image is a failed prerequisite,
never a successful security result.

```sh
npm ci --ignore-scripts
docker --context colima-pathcheck-test pull node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
node supabase/functions/extract-transcript/isolation/build.mjs
PATHCHECK_PDF_ISOLATION_LIVE=1 npm test -- tests/transcript/isolation.live.test.ts
npm run check
```

The build reports `PATHCHECK_PDF_IMAGE=sha256:...`; use that exact ID when composing
the local endpoint. Build context is an ephemeral directory containing only the
bundled code and Dockerfile; it is removed afterward. The pinned base-image pull is
the only required image download. The build performs no network operation in its
build steps. A separate synthetic probe image tests CPU loops, native allocation
and denied capabilities; no probe mode exists in the actual parser image.

Expected live result: **10 tests passed**. Default `npm run check` skips those ten
opt-in Docker cases; it is not a replacement for the explicit live command. The
live suite writes non-sensitive measurements to
`/private/tmp/pathcheck-pdf-isolation-evidence.json` (image IDs, limits, elapsed time,
exit/OOM state, cleanup confirmations; no PDF, course rows, tokens or credentials).
For a human screenshot, capture the terminal's 10-test PASS summary. The assertions
and measurement JSON supply evidence screenshots cannot establish. Human status
remains **NOT RUN** until the human reports their result; lead owns the pinned PR
acceptance guide and final integration acceptance.

All test containers are individually removed. Images are retained for subsequent
integration; no cleanup command deletes project work or touches Supabase services.

## Executed checkpoint

- Image: `sha256:2f739c92573e01372ef19d2f6b8b81a2da0f0e2db62f3c9e7003133a4b69fefd`.
- Actual Docker suite: **10/10 PASS**, 40.15 seconds; all 16 containers removed.
- Exact 20-page, 10 MiB PDF: PASS in 262 ms. Oversize/21-page cases rejected.
- Native-buffer cgroup OOM: 362 ms. Actual compressed object stream expanding to
  512 MiB: OOM in 555 ms; next clean PDF PASS in 133 ms.
- CPU probe: kernel SIGKILL at 6.053 seconds wall under 0.5 CPU / 3 CPU-second
  limit; sampled 1.065 CPU seconds before termination. Idle wall probe: 10.202 s.
- Actual cancellation: 134 ms; excessive output killed; filesystem/network/secret/
  log/mount/capability assertions PASS. Concurrent good parse survived bad parses.
- Real handler used actual containers; memory/cancel failures consumed one
  admission and settled zero cost only after cleanup, with no provider dispatch.
  The store/provider in these handler tests are explicitly simulated. Lead must
  still verify this new boundary against actual SQL and the integrated upload.
- Independent review identified cleanup uncertainty releasing a local slot; fixed
  with quarantine and a deterministic regression. The cleanup-order regression was
  also strengthened to require this request's evidence, never a prior test's entry.
  Independent final static re-review: no remaining blocker in this local scope;
  reviewer did not run the reported tests.
- `npm run check` PASS: 680 unit tests, 43 benchmark checks, nine upload guards,
  lint/TypeScript/build and three Chromium tests. Twelve explicit skips comprise
  ten opt-in Docker tests separately passed above and two live-database cases.

Remaining gates: actual SQL/browser integration of this inspector, human acceptance,
public Edge entry/module resolution, trusted public gateway/bot configuration,
equivalent hosted isolation, approved real-transcript terms/retention and explicit
deployment authorization. Accepted local synthetic extraction does not waive them.
