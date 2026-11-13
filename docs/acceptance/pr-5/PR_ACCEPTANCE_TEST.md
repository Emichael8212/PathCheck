# PR Acceptance Test

## PR Information
- PR number: #5
- Title: Academic engine: catalog, audit, rules, scheduling search
- Commit SHA: `5344bc24be2628e253376e2b279e834bf937337a`
- Base: merged PR4 main `9f46d2323825ea6b222075c538d33701f3d19b4b`
- Test type: deterministic terminal academic-engine assertions
- Feature: scoped repeat credit, prerequisite correctness, bounded scheduling and uncertainty
- Eligibility: **HUMAN ACCEPTANCE REQUIRED**; foundation CI43475690184 PASS, GitHub CLEAN.
- Human acceptance: **NOT RUN**. Independent static review found no blocker in engine097ed76; baseline refresh5344bc2 changes no engine-owned implementation.

## Before You Begin
Git, Node24–26/npm and existing engine worktree. No service, credentials or academic
records needed. All TEST courses/policies are explicitly synthetic, not ASU rules.
Do not switch branches or delete existing work.

```sh
(
set -eu
cd /Users/_eman5michael/pathcheck-engine
test "$(git rev-parse HEAD)" = 5344bc24be2628e253376e2b279e834bf937337a
npm ci --ignore-scripts
node node_modules/vitest/vitest.mjs run tests/engine/repeat-policy.test.ts tests/engine/rules.test.ts tests/engine/scheduling.test.ts --reporter=verbose
)
```

## Step-by-Step Test
1. Run the exact command above; head mismatch or installation failure means stop.
2. Inspect `5 repeat passed after fail, with sourced (synthetic) policy`: TEST101,
   F Spring2024 then B Fall2024, explicitly in scope → one credited B attempt,
   earned3/applicable3, satisfied without a future-completion condition.
3. Inspect the no-policy, out-of-scope, ambiguous and historical-code cases:
   credit remains unresolved; no invented ASU rule or automatic equivalency.
4. Inspect the stricter-prerequisite-grade case: degree credit does not override
   prerequisite eligibility. Count-once case must never allocate9 from6 credits.
5. Inspect deterministic generation, unknown offerings, stale previews and SCH05:
   moving a course beyond the target is a tradeoff, not an unconditional improvement.

## Expected Result
**3 test files passed;106 tests passed;0 failed;0 skipped.** These tests invoke the
actual engine, including evaluation/search. No mocked scheduling responses.
Lead verified this exact unfiltered command at the pinned head.

## Screenshot Checkpoint
Capture the pinned SHA (use `git rev-parse HEAD`), the positive repeat and conservative
negative assertions, and final106-passed summary. Synthetic data contain no secrets.
Human attaches directly to GitHub; no screenshot path requested. Assertions, not
screenshot appearance, establish the tested behavior.

## Pass/Fail Criteria
PASS requires exact head and all106 assertions passing. Any failure, missing test,
skip or unexpected result is FAIL/BLOCKED; report the summary and failing name.
Agent success does not establish human PASS.

## Cleanup
No service or persistent test data is created; process exits automatically. Keep the
existing worktree. No reset, removal or production operation is required.

## Known Limitations
No actual ASU repeat, grade-replacement, transfer or catalog applicability policy is
established. Provisional ASU configuration remains unresolved. This terminal check
does not replace full integrated browser, persistence or transcript security gates.
