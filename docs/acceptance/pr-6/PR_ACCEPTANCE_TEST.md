# PR Acceptance Test

## PR Information
- PR number: #6
- Title: Frontend UX: three screens, planner timeline, previews, PDF export (draft)
- Commit SHA: `bbea54d9645d284f4b3dcff71320387441eb1011`; reviewed UI implementation7c17d49, merged engine/persistence baseline4f74a67, lead tests3a734d2
- Test type: real integrated browser workflow
- Feature being verified: three screens, course controls, contextual preview and minimum-data PDF
- Human acceptance status: **NOT RUN**. Agent verification is separate.
- Eligibility: **HUMAN ACCEPTANCE REQUIRED**. Refreshed-head foundation CI43478299682 PASS; independent review no blocker.

## Before You Begin
Required: Git, Node24–26/npm, Chrome and macOS Preview. No account or credentials.
Use synthetic data only. The lead prepared `/private/tmp/pathcheck-pr6-human` from
merged main4f74a67 with reviewed U7c17d49 and lead3a734d2, without committing or
pushing the candidate. U's refreshed head bbea54d has identical U-owned source/tests;
it only incorporates the same merged main. Existing worktrees are preserved.

Validate the prepared checkout (no installation or startup assumed):

```sh
(
set -eu
cd /private/tmp/pathcheck-pr6-human
test "$(git rev-parse HEAD)" = 4f74a679f1f6ae0cf8e00a681d5214d77b1a9c39
test "$(sort "$(git rev-parse --git-path MERGE_HEAD)")" = "$(printf '%s\n' 7c17d49bc93b3a6209fa1369da08a8a843eb64d8 3a734d20475a4ab649a53390472089888fedde73 | sort)"
npm ci --ignore-scripts
npm run dev -- --port 5181 --strictPort
)
```

Expected Vite URL: `http://127.0.0.1:5181/`. Leave this terminal running. If the
head check or port binding fails, stop; do not reset or delete the checkout.

Reproduction from a fresh clone: create a new empty worktree at4f74a67, run
`git merge --no-commit --no-ff 7c17d49bc93b3a6209fa1369da08a8a843eb64d8 3a734d20475a4ab649a53390472089888fedde73`, then
`git apply tests/e2e/integration/application.patch` and `npm ci --ignore-scripts`.
This is local-only candidate assembly, never a main merge.

## Step-by-Step Test
1. Start the server with the command above.
2. Open Chrome at **http://127.0.0.1:5181/tests/e2e/integration/index.html**.
   Use a desktop window at least 1280px wide. The root `/` is the provisional ASU
   application; use the explicit synthetic test URL for this acceptance scenario.
3. Under **University and program**, choose the sole available program. Confirm
   the catalog summary says **synthetic** and its catalog year is `synthetic-only`.
   The shared contract identifies ASU/B.S. CIS, but these SYN courses are invented
   algorithm fixtures, not university requirements. The available catalog is selected
   through the program option; there is no separate catalog-year dropdown.
4. Set **Target graduation term** to **Fall 2027**. Click **Continue as guest**.
5. Click **Add course attempt**. Enter course `SYN 101`, term **Fall 2026**, status
   **Completed**, attempted credits `3`, earned credits `3`, grade `B`.
   Wait for **1 course checked**. Matching alone does not accept the record.
   Click **Accept and continue** once. Expect **Record accepted** and navigation
   to the planner.
6. Click **I already selected courses**.
7. In **Add course**, select `SYN 201` and **Spring 2027**; click **Add course**.
   Repeat for `SYN 301`, also **Spring 2027**.
8. Confirm a prerequisite issue: SYN 301 needs SYN 201 in a prior term. The timeline
   has both courses in Spring 2027. Open the first recommended change.
9. Confirm the preview moves SYN 301 to **Fall 2027** and leaves SYN 201 in spring.
   **Apply** is disabled until you acknowledge the displayed assumptions. Read the
   assumptions, check them, then click **Apply**. Expect **Change applied**.
10. Confirm SYN 301 now appears in Fall 2027 and the prerequisite conflict is gone.
    The outlook remains conditional, not a graduation guarantee. Capture checkpoint A.
11. Click **Undo**. Expect **Undone**, both courses back in Spring 2027, and the
    prerequisite conflict restored. Capture checkpoint B.

12. After restoring the plan, apply the move again with acknowledgement. Click **Export PDF**. Open the downloaded PDF in Chrome or Preview. Confirm only active semester placements, the target/catalog and applicable conditions appear. Grades, raw record rows, private notes, plan/draft IDs and fingerprints must not appear. Save a screenshot of its timeline and conditions yourself. This uses the maintained pdf-lib renderer. Open the PDF in both Chrome and macOS Preview: text must be selectable, line wrapping readable, and page footers correct.

## Expected Result
Real normalization accepts SYN101. The engine detects same-term SYN201→SYN301 as
invalid prior-term ordering, proposes a move, recomputes after Apply and recomputes
after Undo. The synthetic curriculum requires all three courses (3credits each,
9total), with SYN101→SYN201→SYN301 prior-term prerequisites. No official ASU result
is asserted. Source: tests/e2e/integration/main.tsx and journey.spec.ts.

## Screenshot Checkpoint
You take both screenshots yourself. A: after Apply, capture the semester timeline,
SYN201 in spring/SYN301 in fall, updated outlook and “Change applied” notice.
B: after Undo, capture both courses in spring, the prerequisite warning and “Undone”.
A screenshot alone cannot prove fingerprint/atomic-state behavior; automated tests
assert revision increments, current fingerprints and exact restored placements.
No screenshot or recording is captured by the preparation process.

## Pass/Fail Criteria
PASS only if all interactions match, Apply requires acknowledgement, the conflict
clears after the move, and Undo restores both placement and warning. FAIL if controls
are inert, a prerequisite conflict is hidden, the move is wrong, Undo fails, or a
synthetic/conditional plan is presented as verified graduation. Report the tested
SHA and PASS/FAIL; attach your screenshots directly to GitHub. A blocked setup is BLOCKED, not PASS.

## Cleanup
Stop the server with Ctrl-C and close the browser tab. Keep the candidate worktree
for follow-up; no force deletion, database cleanup or cloud operation is needed.

## Known Limitations
This verifies actual E/L/U planning and PDF export using a clearly synthetic catalog.
It does not certify unavailable ASU rules, cloud-auth workflows, transcript endpoints,
or application/release completion. These remain mandatory separate gates. PDF text
outside the supported WinAnsi range is sanitized; no arbitrary Unicode fidelity claim.
Human visual PDF acceptance cannot be inferred from agent byte assertions.

## Agent preparation evidence
Candidate main4f74a67 + U7c17d49 + L3a734d2: lint/typecheck PASS,480units PASS,
2live tests skipped,12real-engine desktop journeys PASS including PDF download and
independent byte parsing; production-build smoke1 PASS. No screenshots captured.
Independent U7c17d49 review no blocker; bbea54d changes no U-owned source/tests.
