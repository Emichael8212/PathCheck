# PR Acceptance Test

## PR Information
- PR number: #5
- Title: Academic engine: catalog, audit, rules, scheduling search
- Commit SHA: `645111c43f65b21fc73b776a763360a8cbddb4a4`
- Test type: deterministic terminal academic-engine assertions
- Feature being verified: prerequisite-aware preview and uncertain-repeat completion search
- Human acceptance status: **NOT RUN**.
- Eligibility: **BLOCKED for final PR acceptance** by T-ENG-5 until #3 is merged and sourced-repeat support passes. The following current-behavior test is runnable; it does not waive that blocker.

## Before You Begin
Git, Node24–26/npm; no database, credentials or external AI. All TEST courses and
rules below are synthetic. From the repository:

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-engine-human
git worktree add --detach /private/tmp/pathcheck-engine-human 645111c43f65b21fc73b776a763360a8cbddb4a4
cd /private/tmp/pathcheck-engine-human
npm ci
git rev-parse HEAD
)
```

Expected: exact SHA above and successful lockfile install. Stop on errors.

## Step-by-Step Test
1. Read this scenario: TEST101→TEST201 requires prior-term completion. No completed
   attempts; both courses selected Fall2026, target Spring2027. Moving TEST201 to
   Fall2027 removes the prerequisite conflict but misses the target: a **tradeoff**,
   not an unqualified improvement.
2. Run the real engine assertions:
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-engine-human
   node node_modules/vitest/vitest.mjs run tests/engine/scheduling.test.ts --reporter=verbose -t 'SCH-05 a change|completion-search outlook'
   )
   ```
3. The other three assertions use the synthetic chain catalog and an eight-term
   horizon: failed-only TEST101 (F,earned0,Fall2025), withdrawn-only TEST101
   (W,earned0,Fall2025), and a no-prior-attempt control. No retake is initially selected.
   Real completion search proposes courses. Unknown repeat credit must give
   `insufficient_evidence` with `repeat_policy_unresolved`; the clean control gives
   `conditional_path_found`.

## Expected Result
**4 passed**; unrelated scheduling tests are filtered/skipped. Verbose output names
SCH-05 and all three completion-search assertions. The tests call actual evaluate,
preview and search implementations; no service double or canned result. A zero exit
with zero matching tests is not acceptance.

## Screenshot Checkpoint
You capture the command, four green test names and `4 passed` summary. Include the
SHA output in the terminal. Assertions in tests/engine/scheduling.test.ts verify the
specific findings, tradeoff and evidence references; screenshot color alone is not proof.

## Pass/Fail Criteria
Current scenario PASS requires all four assertions and exact SHA. Any failed
assertion, crash or no tests is FAIL. Final PR remains BLOCKED by positive sourced
T-ENG-5 even if this subset passes. Report your result separately from the agent run.

## Cleanup
```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git worktree remove /private/tmp/pathcheck-engine-human
)
```
If removal reports local changes, stop and inspect; never force-delete real work.

## Known Limitations
No official ASU repeat, transfer, grade-replacement or catalog rule is assumed.
This subset does not prove the entire scheduling suite or final sourced-repeat
allocation. After #3 adoption and the owner fix, refresh the exact SHA and acceptance
coverage before a final human merge recommendation.
