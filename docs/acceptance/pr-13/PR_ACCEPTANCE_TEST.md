# PR Information

- PR number/title: [#13 — S: race-safe cross-tab guest recovery snapshots](https://github.com/Emichael8212/PathCheck/pull/13).
- Commit SHA: `a7fa58d67e386ffe54b1e13bf37991de4713d86b`.
- Implementation SHA: `de92df67b1393a7feead99dca64dd801d74f4160`; current head changes only its header comment.
- Base: main `c6ab714bf5004bcc99d0c47e123e5c4750cfc09e`; no feature dependency.
- Test type: actual two-tab Chromium storage races plus persistence contract tests.
- Feature: preserve concurrent guest drafts, scoped cleanup and explicit recovery selection.
- Human status: **NOT RUN**. Eligibility: **HUMAN ACCEPTANCE REQUIRED**.
- Current-head CI: foundation43559926987 PASS. Independent static review: no remaining S-code blocker; code/test source unchanged by final comment correction.

# Before You Begin

Mac prerequisites: Git/GitHub CLI authentication, Node24–26 (repository .nvmrc24), npm,
and Playwright Chromium. Only synthetic fixtures and temporary browser contexts are
used. No Supabase/Colima, API key, transcript or hosted service is needed for these tests.
Do not check out another branch in an existing worktree.

**Stage1 — pinned setup:**

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-pr13-human
git worktree add /private/tmp/pathcheck-pr13-human \
  -b integration/pr13-human a7fa58d67e386ffe54b1e13bf37991de4713d86b
cd /private/tmp/pathcheck-pr13-human
npm ci --ignore-scripts
node node_modules/@playwright/test/cli.js install chromium
test "$(git rev-parse HEAD)" = a7fa58d67e386ffe54b1e13bf37991de4713d86b
printf 'PR13 pinned setup PASS — human recovery tests NOT RUN\n'
)
```

Expected: dependency/browser installation succeeds, exact pinned SHA matches and
that final setup message appears. Stop on any failure; preserve existing worktrees.

# Step-by-Step Test

**Stage2 — actual two-tab race behavior:**

```sh
cd /private/tmp/pathcheck-pr13-human
node node_modules/vitest/vitest.mjs run tests/persistence/recoveryTwoTab.test.ts --reporter=verbose
```

Require **10 passed,0 failed**. These real Chromium cases test simultaneous different
drafts and same-ID revisions (40 trials each), successive revisions, expiry/save
cleanup racing a new write, slow opt-in, three old-format writer races, and explicit
selection after multiple-draft conflict. Widened races assert that the other tab's
write actually occurred during the blocked operation; they do not merely sequence calls.

**Stage3 — persistence and choice contracts:**

```sh
cd /private/tmp/pathcheck-pr13-human
env -u PATHCHECK_LIVE_SUPABASE_URL -u PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY \
  -u PATHCHECK_LIVE_ALLOW_REMOTE_TEST_PROJECT \
  node node_modules/vitest/vitest.mjs run tests/persistence --reporter=verbose
```

Require **148 passed,2 skipped,0 failed**. The two skips are the explicitly separate
live-Supabase cases without configured credentials. This PR changes no SQL or REST
policy; prior human database acceptance is retained. This command includes the seven
explicit-choice contract tests, expiry/privacy/cleanup regressions and the ten actual
browser cases. Do not replace the actual two-tab suite with mocks.

# Expected Result

Concurrent snapshots survive; ambiguous recovery returns conflict rather than choosing
a winner. Explicit selection validates current content, expiry and schema without
deleting the other drafts. Automatic cleanup cannot delete a newer old-format value.
Old-format cleanup reports failure until explicit whole-scope deletion; it never lies
that consent withdrawal/cleanup succeeded.

# Screenshot Checkpoint

You capture the Stage2 ten-case/PASS summary and Stage3 148/2 summary, with relevant
test names visible, and attach them directly to GitHub. No screenshot paths are needed.
Output contains synthetic test names/counts, no secrets or real student records.
Assertions and CI supplement screenshots; screenshot evidence alone is insufficient.

# Pass/Fail Criteria

PASS requires both stages' assertions/counts with no failures. Missing Chromium or
an unavailable local browser environment is BLOCKED. A lost/replaced draft, false
successful cleanup, stale selection, or failed assertion is FAIL. Only your reported
execution changes human status to PASS/FAIL; agent executions are separate evidence.

# Cleanup

The test runner closes its temporary browser contexts and local test server. No
database or cloud service is started. Keep the worktree; no deletion/reset/prune is
needed. Test result artifacts and node_modules remain ignored local files.

# Known Limitations

This accepts S's recovery module, not the final composed application. PR11 must finish
and test the recovery-choice UI; PR12 composes actual accounts. A true scoped-cleanup
result means no matching copy is visible to this tab now, not that a concurrent write
is globally impossible. Unknown university policies and real-transcript/hosted release
gates remain separate. No merge, deployment or complete-application approval is implied.
