# PR Information

- PR:[#9 — transcript admission and resumable extraction integration](https://github.com/Emichael8212/PathCheck/pull/9)
- Implementation SHA:`b4573d4a5cc012a56d9928eb50660c30fdbcbfbd` (later documentation-only commits do not change this implementation).
- Dependencies:U`29c387caef967990abd6db06ab7696c05c416f36`,S`c394241922a7513b9101561426d2979a0f1c0a17`,G`75aa73ee912186670c4256189db48a4a238f7fcd`.
- Test type:integrated student workflow and upload security.
- Human status:**NOT RUN**; full live-upload eligibility:**BLOCKED**.

## Before You Begin

The completed automated local browser suite uses real frontend/engine/database
components but explicitly simulates Google/bot responses. It is useful engineering
evidence, not a substitute for the required human live-upload workflow. No API key
or real transcript should be supplied to that simulated test.

## Step-by-Step Test

The full human live-upload procedure is pending the same local runtime dependency
as PR8. Reproducible automated preparation is documented in
[the upload suite](../../../tests/e2e/upload/README.md); from the already composed,
isolated candidate with the dedicated database running:

```sh
cd /private/tmp/pathcheck-upload-verified
npm ci --ignore-scripts
node tests/e2e/upload/run.mjs
PATHCHECK_TEST_BUILD=1 npm run check
```

These preparation commands do not establish human PASS. The lead will provide the
exact Chrome upload/accept/planner scenario once real local Gemini composition is
ready. No user execution is requested for this blocked checkpoint.

## Expected Result

Automated preparation:five upload cases PASS and the composed build/checks PASS.
The tested snapshot was independently reconstructed from actual branch heads with
noncommitting merges;164 executable source/config/fixture files matched the tested
candidate exactly. No scratch branch is committed, pushed or merged into main.

## Screenshot Checkpoint

Pending live browser procedure. Human screenshots will be attached directly to
GitHub; agents do not capture them or request paths.

## Pass/Fail Criteria

Human PASS must show actual extraction and deterministic planning through approved
boundaries, including explicit acceptance and no stale/current-record confusion.
Simulated-provider browser tests alone cannot clear the full live-upload gate.

## Cleanup

Stop any human-started local test services as described in the upload guide. Keep
the existing worktrees for follow-up; no deletion of project work is required.

## Known Limitations

No production listener/gateway or real-transcript privacy approval is claimed.
PR7 database acceptance is independently eligible; PR8/9 full live-upload acceptance
remains blocked on engineering integration, not current Gemini availability.
