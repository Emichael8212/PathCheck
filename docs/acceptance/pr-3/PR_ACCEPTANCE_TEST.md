# PR Acceptance Test

## PR Information
- PR number: #3
- Title: Add integration contracts, desktop verification and local security tooling
- Commit SHA: `e941539c4ae12ad6f6f3b07a51dc7394a06a3965` (implementation baseline; subsequent acceptance-document commits do not change its behavior)
- Test type: real integrated browser workflow
- Feature being verified: E analysis + U timeline + L preview/apply/undo and stale-analysis prevention
- Human acceptance status: **NOT RUN**. Agent verification is separate.
- Eligibility: instructions ready; human PASS required before merge recommendation.

## Before You Begin
Required: this repository, Git, Node24–26/npm, Chrome; no account, cloud service or
credentials. Use synthetic data only. Do not upload transcripts. Dependencies are
pinned to E645111c/U541ba01/S8d28602, not mutable branch tips. A fresh clone can use
its local repository path instead of `/Users/_eman5michael/PathCheck`.

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-human-acceptance
git worktree add /private/tmp/pathcheck-human-acceptance -b integration/human-acceptance e941539c4ae12ad6f6f3b07a51dc7394a06a3965
cd /private/tmp/pathcheck-human-acceptance
git merge --no-commit --no-ff 645111c43f65b21fc73b776a763360a8cbddb4a4 541ba01a62a163672b08483658d66794b7cc273b 8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd
git apply tests/e2e/integration/application.patch
npm ci
)
```

Stop if any command fails. Do not reuse an unknown existing directory or resolve a
merge conflict by guessing. Expected: merge stops before committing; npm installs
the lockfile. These commands never merge into main or push anything. If the
checkout was prepared by the lead and left for your test, verify its recorded SHAs
before reusing it; otherwise use the fresh procedure above. The Git history remains
at e941539 with the three pinned feature heads recorded in the linked worktree's merge-state file. To inspect it safely, run:

```sh
(
set -eu
cd /private/tmp/pathcheck-human-acceptance
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
   cd /private/tmp/pathcheck-human-acceptance
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
   Click **Review record**, then **Accept this record**. Expect **Record accepted**.
6. Click **Continue to planner**, then **I already selected courses**.
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
git worktree remove --force /private/tmp/pathcheck-human-acceptance
git branch -D integration/human-acceptance
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
