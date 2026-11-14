# PR #10 and PR #9 — Corrected curriculum selection acceptance

## PR Information

- PR #10: Fix identical catalog options: show current vs historical curriculum.
- UI commit SHA: `3e5a092c59aad43e6a542a37e6a2df70d4d5d0d5`.
- PR #9: Transcript admission and application integration.
- Lead implementation/test SHA: `ad2b1b9231a31753fdc32efeff276dfecf91a7cb`.
- Test type: Chrome, real production UI, deterministic engine and PDF export.
- Feature being verified: distinguish current/historical curriculum; match CIS 300
  in the current configuration; accept a fictional record and export a conditional plan.
- Human acceptance: **PASS** for the staged checks actually presented in chat:
  current-curriculum CIS300 matching, explicit record acceptance, CIS351 Spring2027
  placement, and PDF curriculum identity/conditions with record term/grade omitted.
  The human explicitly reported the matching result, then PASS for the remaining steps.
  Supplementary historical-option and disabled-service assertions have automated PASS;
  no separate human execution of those assertions is claimed. Prior live upload/security PASS stands.
- Dependencies: PR #10 may merge after its CI/review/human gates; then refresh PR #9
  and rerun affected CI before its personal merge. PR #10 is READY TO MERGE at
  the pinned UI head; PR #9 remains BLOCKED pending that dependency and current CI.

## Before You Begin

Git, Node 24–26/npm, Chrome, PDF viewer. Use only the fictional record below.
No database, Gemini API, credentials or external services are needed. Preserve the
old worktree. If its preview is still running, Ctrl-C in that terminal stops it safely.
The new preview uses port 5187. No application patch is needed.

## Step-by-Step Test

### Stage 1 — Pinned setup

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-catalog-fix-human
git worktree add /private/tmp/pathcheck-catalog-fix-human \
  -b integration/catalog-fix-human \
  ad2b1b9231a31753fdc32efeff276dfecf91a7cb
cd /private/tmp/pathcheck-catalog-fix-human
git merge --no-commit --no-ff 3e5a092c59aad43e6a542a37e6a2df70d4d5d0d5
test "$(git rev-parse HEAD)" = ad2b1b9231a31753fdc32efeff276dfecf91a7cb
test "$(git rev-parse MERGE_HEAD)" = 3e5a092c59aad43e6a542a37e6a2df70d4d5d0d5
npm ci --ignore-scripts
npm run build
printf 'Corrected curriculum setup PASS — human acceptance NOT RUN\n'
npm run preview -- --port 5187 --strictPort
)
```

Expected: clean noncommitting merge, successful build, setup PASS and Vite URL
`http://127.0.0.1:5187/`. Keep the terminal open. Existing paths/ports or conflicts
are BLOCKED; do not delete work or commit this temporary merge.

### Stage 2 — Current curriculum and record

1. Open **http://127.0.0.1:5187/** in Chrome (HTTP, not HTTPS).
2. Inspect **University and program**. There must be distinct options containing
   **Current departmental curriculum** and **Historical 2019–2021 curriculum guide**.
   Select the historical option briefly: its identity is visible and its governing
   catalog year remains unresolved. Then select **Current departmental curriculum**.
3. Choose target **Fall 2027**, then **Continue as guest**. The persistent curriculum
   label should identify the current curriculum. The governing year remains unknown.
4. Confirm transcript import is explicitly unavailable, with no file picker.
   Open **Guest, not saved**: sign-in/cloud save says unavailable. Close the menu.
5. Click **Add course attempt**. The **Course code** control is a text field:
   **type `CIS 300`**. Enter term **Fall 2026**, status **Completed**, attempted
   credits **3**, earned credits **3**, grade **B**. These are fictional values.
6. Expect **In catalog**, **1 course checked**, and **All found in this catalog.**
   Do not continue if CIS 300 is unmatched. Click **Accept and continue**.
   Expect **Record accepted** and the Graduation Planner.

### Stage 3 — Plan and PDF

1. Choose **I already selected courses**, add **CIS 351** in **Spring 2027**.
   Expect **Course added** and its timeline placement. Academic outlook must remain
   insufficient/unknown where required academic information is missing.
2. Click **Export PDF** and open the downloaded document. Confirm **Current
   departmental curriculum**, **CIS 351**, **Important conditions**, and unresolved
   information. The document must not expose the record's **Fall 2026** term or
   a **Grade:** field. Printed historical guide years must not become a governing year.

## Expected Result

Students can distinguish the approved configurations. CIS 300 matches the current
configuration; no academic data or historical requirements have been rewritten.
Explicit record acceptance leads to actual deterministic planning and a real PDF.
No upload, Google request, account or verified-graduation claim is enabled by this test.

## Screenshot Checkpoint

Capture the distinct program options/current curriculum identity, the Academic Record
showing **CIS 300 — In catalog**, and the timeline/PDF with conditions. Only fictional
values are used. Attach evidence directly to GitHub; no screenshot paths are requested.

## Pass/Fail Criteria

PASS requires all observable results above. Wrong/ambiguous curriculum identity,
unmatched CIS 300 under current curriculum, automatic acceptance, broken controls,
browser errors, misleading graduation guarantees or missing PDF conditions are FAIL.
Missing tools/occupied ports are BLOCKED. Report **Corrected curriculum/root PASS**
or the failing step. A human PASS covers PR #10 identity and PR #9 ordinary-root
assertions, not an assertion that the complete MVP is finished.

## Cleanup

Ctrl-C in the preview terminal. Keep the worktree; do not commit/push its temporary
merge. No database/VM was started and no remote data needs deletion.

## Known Limitations

This is a local guest entry. Account/cloud composition, public extraction gateway,
PDF resource isolation and real-transcript privacy approval remain mandatory unfinished
gates. Previously accepted live synthetic upload is separate and is not repeated.
ASU catalog applicability and unsourced academic policies remain unresolved. The main
bundle size warning is nonblocking. PR #9's new label regression requires PR #10;
standalone PR #9 cannot pass that test until the dependency is merged and refreshed.
