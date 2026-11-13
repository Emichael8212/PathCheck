# PR Acceptance Test

## PR Information
- PR number: #3
- Title: Add integration contracts, desktop verification and local security tooling
- Commit SHA: `37c2f0adb8972736cc31247df3ddc19339cd6cfa` (implementation baseline; subsequent acceptance-document commits do not change its behavior)
- Test type: real integrated browser workflow
- Feature being verified: E analysis + U timeline + L preview/apply/undo and stale-analysis prevention
- Human acceptance status: **PASS (user-reported)** for this renewed candidate. The human will attach screenshot evidence directly on GitHub; no submission in chat is required.
- Eligibility: human execution PASS; screenshot attachment and final merge remain human-controlled GitHub checkpoints. Agent tests are separate evidence.

## Before You Begin
Required: this repository, Git, Node24–26/npm, Chrome; no account, cloud service or
credentials. Use synthetic data only. Do not upload transcripts. Dependencies are
pinned to E645111c/Uf413d18/S8d28602, not mutable branch tips. A fresh clone can use
its local repository path instead of `/Users/_eman5michael/PathCheck`.

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-pr3-renewed
git worktree add /private/tmp/pathcheck-pr3-renewed -b integration/pr3-renewed 37c2f0adb8972736cc31247df3ddc19339cd6cfa
cd /private/tmp/pathcheck-pr3-renewed
git merge --no-commit --no-ff 645111c43f65b21fc73b776a763360a8cbddb4a4 f413d189f93b4cd9de4821b4b0118120b57d245b 8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd
git apply tests/e2e/integration/application.patch
npm ci
)
```

Stop if any command fails. Do not reuse an unknown existing directory or resolve a
merge conflict by guessing. Expected: merge stops before committing; npm installs
the lockfile. These commands never merge into main or push anything. If the
checkout was prepared by the lead and left for your test, verify its recorded SHAs
before reusing it; otherwise use the fresh procedure above. The Git history remains
at 37c2f0a with the three pinned feature heads recorded in the linked worktree's merge-state file. To inspect it safely, run:

```sh
(
set -eu
cd /private/tmp/pathcheck-pr3-renewed
git rev-parse HEAD
git rev-parse --git-path MERGE_HEAD
)
```

The second command prints the actual merge-state file path (`.git` is a file in a linked worktree). Open that path in your editor and confirm the three pinned SHAs above before reusing an existing prepared checkout.

## Step-by-Step Test
1. Start the server (leave this terminal running):
   ```sh
   (
   set -eu
   cd /private/tmp/pathcheck-pr3-renewed
   npm run dev -- --port 5181 --strictPort
   )
   ```
   Expected: Vite prints `http://127.0.0.1:5181/`. A port error is a setup failure;
   stop the other test server rather than changing URLs silently.
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
SHA, PASS/FAIL, and your screenshots. A blocked setup is BLOCKED, not PASS.

## Cleanup
Stop the dev server with Ctrl-C. Close the test browser tab. From another terminal:

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git worktree remove --force /private/tmp/pathcheck-pr3-renewed
git branch -D integration/pr3-renewed
)
```

Only run this after finishing the test; it discards the dedicated uncommitted test
checkout, not the feature worktrees. Save your own screenshots outside the repository.

## Known Limitations
This is a candidate assembled from unmerged PRs, not current main. Cloud auth/save,
transcripts and final PDF acceptance are separate. Synthetic-only catalog applicability
is intentional; actual ASU applicability remains unresolved. This test does not clear
T-ENG-5 or production release gates. Human PASS applies to these pinned implementations;
a behavior-changing head update requires impact review and renewed human verification.
