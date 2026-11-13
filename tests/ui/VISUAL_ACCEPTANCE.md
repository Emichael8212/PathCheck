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
`pr6-1440-start.png`, `pr6-1440-record.png`, `pr6-1440-planner-preview.png`, and the same three with `1280`.
Do not capture account email fields with real addresses.

## Report back

For each checklist item: PASS or FAIL, with a one-line note for each FAIL. Include the six screenshots and the
`git log --oneline -1` head you tested.
