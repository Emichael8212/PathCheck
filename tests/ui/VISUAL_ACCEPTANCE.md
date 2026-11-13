# PR #6 redesign: human desktop visual acceptance

This is a design-quality check, separate from functional acceptance. The pages run the real
UI components against the **synthetic test-double harness** (no real engine and no student data).
Passing automated tests is not visual approval; only your review is.

Real-engine functional acceptance remains the lead's `docs/acceptance/pr-6/PR_ACCEPTANCE_TEST.md`,
which needs re-pinning to this head (see `LEAD_CHANGE_REQUEST.md`).

## Start (macOS, Chrome or Chromium)

```sh
cd /Users/_eman5michael/pathcheck-frontend
git fetch origin && git checkout feat/frontend-ux && git pull --ff-only
git log --oneline -1          # must match the head reported in PR #6
npm ci
npx vite --host 127.0.0.1 --port 5190 --strictPort
```

Open `http://127.0.0.1:5190/tests/ui/browser/harness/index.html` in a desktop window.
Set the window to **1440 px** wide, then repeat at **1280 px**. In Chrome DevTools, open the device
toolbar, choose Responsive, enter the width and set the height to 900. Stop the server with Ctrl+C.

Optional variants, appended to the URL: `?long=1` (very long course title), `?transcript=approved`
(transcript consent flow), `?draft=none` (no draft found).

## The three screen states to inspect

| # | State | How to reach it | Look for |
|---|---|---|---|
| 1 | **Get started, filled** | Choose the program and target Fall 2028 | Balanced two-column layout. Persistent "Test catalog" chip and banner. No version string in the select. Catalog details closed by default. One blue primary button. |
| 2 | **Academic record, checked** | Continue as guest. Add attempt `SYN 101`, Fall 2026, Completed, 3/3. Add a second attempt `XYZ 210`, Completed, 3/3. Click Done. | Compact list. Match column shows ✓ Matched and ⚠ Not in this catalog. The glass action bar names exactly one step, "Accept and continue". Typing `SYN 2` in Course code shows the catalog search list. |
| 3 | **Planner with a preview open** | Accept and continue → "I already selected courses". Add SYN 201, SYN 202 and SYN 301 to Spring 2027, then click Preview under the first issue. | The semester list dominates. Spring 2027 and Fall 2027 are both outlined, with "Moves to…/Arrives from…" and "9 → 6 credits". The glass preview names both semesters, and Apply/Cancel are visible. "3 unknowns affect this result" is visible in the outlook. |

## Refinement round: three extra states

| # | State | How to reach it | Look for |
|---|---|---|---|
| 4 | **Empty academic record** | Continue as guest without adding anything | "No courses entered" with one blue "Add course attempt"; "Continue to planner" is secondary; transcript text is one short line. |
| 5 | **Grade needing a look** | Add `SYN 101`, Fall 2026, Completed, 3/3, grade `ZZ`, then Done | The Grade cell shows ⚠ ZZ, and the summary adds "1 grade needs a look". "In catalog" (not "Matched") appears with the note that it confirms no grade, credit or requirement. |
| 6 | **Empty planner** | Accept and continue → "I already selected courses" with nothing added | "No courses planned yet" with "Add a course" and "Help me build a plan". The outlook stays above. Needs attention shows "3 required courses not planned" with the courses listed, and "Show each (3)" opens each finding with its sources. |

Glass during scrolling: on the planner with several courses, scroll to the bottom. Confirm the toolbar stays on top and
stays readable, the capsule floats clear of focused controls, the last course's Edit popover opens upward fully on screen,
and an open preview keeps Apply/Cancel visible while you scroll.

## Real-engine browser test (recommended before final approval)

This runs PR #6's UI against the **real academic engine (E) and planner commands (L)** on a local, uncommitted
integration candidate. The data is the lead's synthetic graph: SYN-101 → SYN-201 → SYN-301, three credits each.
It is not ASU policy and uses no student data. U verified this exact sequence on the candidate L `09ee8cb` + E `645111c` +
U `1103ab1` + S `8d28602` + G `b37f4c2`.

```sh
cd /Users/_eman5michael/PathCheck && git fetch origin
git worktree add /private/tmp/pathcheck-pr6-real -b integration/pr6-real-check 09ee8cbf9f1aa4af219037f96045fd81d89a63b5
cd /private/tmp/pathcheck-pr6-real
git merge --no-commit --no-ff 645111c43f65b21fc73b776a763360a8cbddb4a4 1103ab1 8d286023513df00b8eb6d41a6cf8ee9ad5ddcedd b37f4c2ab6a9709bfae26c57635f1991a3c6ab9f
git apply tests/e2e/integration/application.patch
npm ci
npx vite --host 127.0.0.1 --port 5183 --strictPort
```

Open `http://127.0.0.1:5183/tests/e2e/integration/index.html` at 1440 px (repeat at 1280 if you like).

| Step | Do | Expect | Screenshot |
|---|---|---|---|
| R1 | Choose the program and target **Fall 2027** | Option "B.S. Computer Information Systems · Test catalog"; "Test catalog" chip and banner; catalog year shown | `pr6-real-1-start.png` |
| R2 | Continue as guest → Add course attempt → `SYN 101` only | "⚠ Complete 1 course to continue: SYN 101 needs a status."; row "Needs status"; grey Accept button. Clicking it shows the alert, focuses Status, and accepts nothing. | `pr6-real-2-blocked.png` |
| R3 | Term Fall 2026, Completed, 3/3, grade B | "1 course checked. All found in this catalog."; blue "Accept and continue" | `pr6-real-3-checked.png` |
| R4 | Accept and continue → "I already selected courses" | "Record accepted…"; **"Not enough information to judge Fall 2027 yet"**; the line "No courses are planned yet…"; "⚠ 1 scheduling risk"; Needs attention with suggested fix "Add SYN 201 to Spring 2027"; "No courses planned yet" with two actions | `pr6-real-4-empty-planner.png` |
| R5 | Help me build a plan | Draft rows SYN 201 (Spring 2027) and SYN 301 (Fall 2027); four assumptions to confirm; outlook adds "Draft courses count only after you adopt them." | `pr6-real-5-draft.png` |
| R6 | Check all four boxes → Adopt draft | "Reachable under current assumptions"; both rows tagged "Suggested"; Undo in the capsule | `pr6-real-6-adopted.png` |
| R7 | Undo | Back to the empty planner and "Not enough information…" | none |
| R8 | Reload the page. Same program, target **Fall 2027**, Continue as guest, add nothing, Continue to planner → I already selected courses | **"Fall 2027 is at risk"**; "⚠ 3 scheduling risks reported"; "No term fits within the planning horizon" and "Prerequisite chain is too long for the target" (the 3-course chain can't fit in 2 terms) | `pr6-real-7-at-risk.png` |

Cleanup (nothing is committed):

```sh
# Ctrl+C the server, then
cd /Users/_eman5michael/PathCheck
git worktree remove --force /private/tmp/pathcheck-pr6-real && git branch -D integration/pr6-real-check
```

## Targeted re-check: two specific cases

**Case A: incomplete course cannot be accepted** (harness URL above)
1. Continue as guest → Add course attempt → type `SYN 101` → Done. Leave Status empty.
2. Expect:
   - The bar reads "⚠ Complete 1 course to continue: SYN 101 needs a status."
   - The row shows "Needs status".
   - "Accept and continue" is greyed out.
3. Click it anyway, and also try Tab to it + Enter. Expect:
   - An alert: "Some courses need corrections…".
   - The row opens with focus in Status and the message "Choose a status (Unknown is allowed)".
   - You stay on Academic record, and no "Record accepted" message appears.
4. Choose Status "In progress" with no grade and no credits. Expect "1 course checked…" and a blue button. Grades and credits are not required.

**Case B: empty-plan outlook**
1. Harness: Accept and continue → "I already selected courses", nothing added.
   - Expect the line "No courses are planned yet. This outlook reflects PathCheck's check of your remaining requirements, not a schedule you chose."
   - The test double now reports "Reachable under current assumptions", because unplanned courses alone aren't a risk.
2. Harness with `?draft=none`: same steps.
   - Expect "Fall 2028 is at risk", plus the finding "No complete schedule found within search limits" in Needs attention.
   - This is the risk case, coming from the engine's result rather than from the empty plan.
3. Real engine (optional, recommended): ask the lead for a reconstructed candidate, or use the lead's integration harness. Choose target **Fall 2027** with no courses taken.
   - Expect "Fall 2027 is at risk" with "⚠ 3 scheduling risks reported".
   - Needs attention should list "No term fits within the planning horizon" and "Prerequisite chain is too long for the target". The 3-course chain can't fit in 2 terms.
   - With SYN 101 completed, the same target shows "Not enough information to judge Fall 2027 yet" instead.

## Checklist (mark each PASS or FAIL)

1. Typography and spacing are consistent across the three screens. Nothing is clipped or overlapping, and the page never scrolls sideways.
2. Glass appears only on the toolbar, the status/undo capsule, the Edit popover, the record action bar, the catalog search list and the preview. Course content stays on opaque white surfaces and is easy to read.
3. Keyboard only (Tab, Shift+Tab, Enter, Space, Esc):
   - Skip link → main content.
   - Edit on a course opens its popover; Esc closes it and returns focus to Edit.
   - Preview → Space on the checkbox → Apply → Undo in the capsule.
   - A row's "⛔ 2 conflicts" moves focus to the issue.
   - A term button in the strip jumps to that semester.
4. Uncertainty stays honest:
   - "Not checked" availability.
   - "You reported: Listed" after answering in the inspector, with the date in the Edit popover.
   - Suggested and Draft tags after "Help me build a plan" → Adopt draft.
5. Preview → Cancel (or Esc) leaves the plan unchanged. Changing "Planning assumptions" while a preview is open blocks Apply with "can't be applied".
6. Errors: on the record screen, click "Add course attempt" and then "Accept and continue" with the row empty. An inline error and an alert appear, and focus goes to Course code.
7. Optional macOS settings (System Settings → Accessibility → Display): turn on **Reduce transparency**, then **Increase contrast**. Glass becomes solid white and stays readable.

## Screenshots to capture (synthetic data only)

Use Cmd+Shift+4, then Space, and click the browser window. Name the files:
`pr6-1440-start.png`, `pr6-1440-record.png`, `pr6-1440-planner-preview.png`, `pr6-1440-record-empty.png`, `pr6-1440-planner-empty.png`, and the same five with `1280`.
Do not capture account email fields with real addresses.

## Report back

For each checklist item: PASS or FAIL, with a one-line note for each FAIL. Include the ten screenshots and the
`git log --oneline -1` head you tested.
