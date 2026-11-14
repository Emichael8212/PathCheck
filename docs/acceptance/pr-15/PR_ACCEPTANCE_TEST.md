# PR Information

- PR number/title: [#15 — Local PDF parsing isolation](https://github.com/Emichael8212/PathCheck/pull/15).
- Commit SHA: `eac711c8e727c8e7ed45e0951b8a5e4f5d005bba`; base main `ef6ba14`.
- Parser implementation remains byte-identical to reviewed/tested `ba2e325`; refresh only includes merged PR13.
- Test type: real container resource/security tests with synthetic PDF fixtures.
- Feature: enforced parser memory/CPU/wall/cancel boundaries and fail-closed cleanup.
- Human status: **PASS**. Status: **MERGED** personally as `8fab5bfae66d38b5970db4d601f8325655962922`.
- Prior implementation foundationCI43560174182 PASS; refreshed CI43562622863 PASS at eac711c. Independent local-scope review no blocker; no owned code changed in refresh.

# Before You Begin

Node24–26/npm, Docker CLI, and existing isolated Colima profile `pathcheck-test`.
No Supabase, Google request, key, real transcript or paid billing is required. Do not
stop a shared service. Pinned image/build inputs contain parser code, not repository
secrets or documents. Use a fresh worktree, not a checkout over ongoing work.

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-pr15-human
git worktree add /private/tmp/pathcheck-pr15-human \
  -b integration/pr15-human eac711c8e727c8e7ed45e0951b8a5e4f5d005bba
cd /private/tmp/pathcheck-pr15-human
npm ci --ignore-scripts
test "$(git rev-parse HEAD)" = eac711c8e727c8e7ed45e0951b8a5e4f5d005bba
printf 'PR15 pinned setup PASS — human parser tests NOT RUN\n'
)
```

Stage1 expected: exact pin and setup PASS; no services started.

**Stage2 — isolated runtime and code-only parser image:**

```sh
(
set -eu
cd /private/tmp/pathcheck-pr15-human
colima start pathcheck-test --activate=false --ssh-config=false
test "$(docker context inspect colima-pathcheck-test --format '{{.Endpoints.docker.Host}}')" = "unix://${HOME}/.colima/pathcheck-test/docker.sock"
docker --context colima-pathcheck-test info --format '{{.Name}}'
docker --context colima-pathcheck-test pull node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
node supabase/functions/extract-transcript/isolation/build.mjs
)
```

Expected: Docker socket check matches the dedicated profile, build completes and prints
`PATHCHECK_PDF_IMAGE=sha256:…` for the image just built. The verified agent image was
`sha256:2f739c92573e01372ef19d2f6b8b81a2da0f0e2db62f3c9e7003133a4b69fefd`; a fresh
Docker build may have a different image identity. The suite resolves and pins the
locally built image by its immutable ID, not by that historical value.
Missing runtime/image is BLOCKED, not a security PASS.

# Step-by-Step Test

**Stage3 — actual parser resource/security tests:**

```sh
cd /private/tmp/pathcheck-pr15-human
PATHCHECK_PDF_ISOLATION_LIVE=1 npm test -- tests/transcript/isolation.live.test.ts
```

This runs actual container memory/CPU/wall/cancellation, output and privacy checks,
including a compressed-object amplification PDF and clean-request recovery. The
handler ordering cases use actual containers with explicitly simulated store/provider;
they must prove the current request is cleaned up before settlement and no provider
dispatch occurs. Separate lead integration has passed real SQL+Google+browser success.

# Expected Result

**10 tests passed,0 failed,0 skipped** (approximately40seconds on the verified Mac).
All16 test containers are removed. Safe measurements are written to
`/private/tmp/pathcheck-pdf-isolation-evidence.json` with limits, timings, exit/OOM
and cleanup state; no document text or credentials. Default unit CI skips these ten
opt-in tests, so a default green test run does not replace this command.

# Screenshot Checkpoint

Capture the command and ten-test PASS summary. The JSON measurements and assertions
prove controls a screenshot cannot. Attach evidence directly to GitHub; do not share
private startup logs or environment files.

# Pass/Fail Criteria

PASS requires all ten actual tests and cleanup confirmations. Any skipped live case,
provider dispatch after failure, leaked content, unconfirmed cleanup treated as safe,
or surviving resource-stress container is FAIL/BLOCKED as applicable. Human PASS
requires your report, never the agent's equivalent run.

# Cleanup

The suite removes only its own containers and retains images for integration. If no
other test is using this VM, `colima stop pathcheck-test` safely stops it. Keep the
worktree and images; no Docker prune or project deletion is needed.

# Known Limitations

Approved for local synthetic testing under SEC-LOCAL-PDF-001. It does not establish
hosted Supabase isolation, public bot/gateway correctness, real-transcript terms,
production retention, deployment readiness or authorization. Full application
acceptance remains separate. See the module README for measured limits and review.

# Recorded human acceptance

Human reported pinned setup PASS at eac711c8e727c8e7ed45e0951b8a5e4f5d005bba,
image build matching2f739c92573e, actual isolation suite10 PASS/0failed/0skipped,
and successful Colima stop. Current head is unchanged; required foundation
CI43562622863 PASS, merge state CLEAN/MERGEABLE against main ef6ba14. Independent
local-scope code review has no remaining blocker; no unresolved GitHub review
threads. No formal GitHub approval is claimed. Agent does not merge.
