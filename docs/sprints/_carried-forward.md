# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

## For F17 and F18 (the printed summary; on every result)
- The footer is `foot(curriculum, subject)` in `src/shell.ts`: it already leaves the
  last-reviewed line out when there is no date and takes the email's subject. Still to
  do in F18: the 12-month banner, the owner's real address in `src/wording.ts`, and the
  email pre-filled with the course or result. (F06)
- **The review date is 2026-11-15** (owner answer, 2026-11-16: "Store it in the curriculum
  file and show "Curriculum last reviewed: Nov 2026". The 12-month banner works as
  written."). Before F17, a pull request of its own puts `lastReviewed: 2026-11-15` into
  `docs/curriculum/provisional-current.json` and updates the tests that expect no date
  (`tests/curriculum.test.ts` "carries the last-reviewed date"; `tests/start.test.ts`
  "leaves the last-reviewed line out while there is no date"), DESIGN.md's note that the
  footer has no such line, and this note. F17's line and F18 steps 1 and 3 then stand as
  written.

## For F17 and F19 (what the result leaves for them)
- The result is drawn by `resultHtml` in `src/left.ts` from `checklistOf` in
  `src/checklist.ts` (`overviewHtml`, `requirementsHtml`), `src/pace.ts` (the answer
  beside the ring, the controls under the bar; `overviewOf` in `src/left.ts`) and
  `src/plan.ts` (the draft plan after the requirements, inside `[data-plan]`: `planOf`,
  `planHtml`). "Print / save PDF" and "Clear my data" go at the end (F17, F19). The
  stylesheet already has the design's rules for them. (F13, F16)
- The plan prints with the result; "Move later" is `.no-print`. The line under the plan
  (`.plan-late`), when there is one, prints too: it is part of what the plan says. (F16,
  for F17)
- The student's moves are `LeftState.moves` (for each moved entry, its earliest term),
  kept in memory for the visit beside the pace settings (`LeftState.pace`). If F19's
  "last result" is to come back as the student left it, both belong to it, and "Clear my
  data" forgets both. (F14, F16, for F19)
- Requirements are `<details>`, and so is the list of courses not counted
  (`details.unused`); for print every one of them must be opened and the toggles, "All / Not done" and the two end buttons hidden (`.no-print`). (F13, for F17)

## For F19 (clear my data)
- The credits the student gave a course PathCheck doesn't know are part of the list
  (`Entry.credits`): kept and cleared with it. (F09)
- The entered courses live in memory only (a `CourseList` from `src/check.ts`, held by
  `startApp` in `src/app.ts`).
  F19 keeps them across visits and clears them. (F07)
- "Clear my data" must also forget the legacy answer, through `clearLegacyAnswer`
  (`src/legacy.ts`). (F05)

## For F21 (the reader function, M2)
- Confirm on the owner's real transcript how a summer term is printed, and a winter or
  mini-term if there is one: `readTerm` in `src/pace.ts` reads "Fall", "Spr"/"Spring",
  "Sum"/"Summer" and a four-digit year, and gives no pace estimate for anything else.
  (F14 contract review; the owner's open question since F10)
- The pill "Synthetic transcript result" on the result (`TEXT.pill` in `src/left.ts`) is
  true only while the made-up transcripts are the only ones read: change or remove it
  when real transcripts are read. (F13 contract review)
- "Browse files" opens the picker through a file control that is not in the page; it is
  held until a file is chosen. Not tried on a real iPhone yet: the owner's M1 check on a
  phone is the first real test, and M2 must repeat it with a real PDF. If the picker does
  not answer there, put the control in the page, hidden. (F11 review)
- Reading is instant at M1. When the reader takes seconds, a transcript that arrives after
  the student has gone to another page still brings them to the review: decide then
  whether to ask first, and show that a file is being read. (F11 review, round 2)
- A correction whose prefix reads like a totals line and whose number is empty is thrown
  away like a totals line, and the row cannot be brought back. Rare; decide with the real
  reader whether a corrected row may ever be thrown away. (F11 review)
- The reader plugs in at `readFile` in `src/upload.ts`: today it recognises the two
  made-up PDFs on a development server and answers "unavailable" on the built site. The
  size limit, the "%PDF-" check and the refusal sentences are in place (`src/left.ts`,
  `refusalText`). Whatever the function returns goes through `openTranscript` →
  `readRows`. (F11)
- F23's sentence "Upload isn't available right now — try again tomorrow" is already the
  refusal `unavailable`; F23 decides when it is shown at M2. (F11)
- It must return the shape `readRows` checks: `{ "rows": [ … ] }`, each row with `term`,
  `transfer`, `prefix`, `number`, `description`, `attempted`, `earned`, `grade`, `points`,
  and nothing about the student. The shape changes only by a recorded decision that
  updates F10's checks in the same pull request. (F10)
- Confirm on the owner's real transcript: how the transfer section's totals line is worded
  (`NOT_COURSES` in `src/reader.ts` has "Transfer Totals", the made-up PDF's wording), and
  whether transfer rows leave "attempted" empty. (F10; F03 review)

## For F07 onward (screens)
- How the app is put together (F06): a page is a function that returns HTML text
  (`src/start.ts`, `src/check.ts`, `src/left.ts`); `renderPage` in `src/app.ts` picks the
  page for an address; `startApp` draws it, sets the tab title, and after a page change
  puts the keyboard on the page's `<h1>` and scrolls to the top. Addresses are in
  `src/shell.ts` (`HREF`, `routeOf`). Anything with a timer must stop when the student
  leaves its page, as the demo does.
- Redrawing a whole page loses what the student is typing. From F07, redraw only the part
  that changed, or keep the field out of the redrawn part. The transcript page (F11) is
  drawn again as a whole: it reads what is typed in the open edit into `LeftState.draft`
  first, and says what happened in `#pathcheck-status`, a line beside the page.
- The scans in `tests/curriculum.test.ts` read every file in `src/`, `index.html` and
  `public/`: no course code, title, block name or credit total may be written there. Take
  them from the curriculum. `src/examples.json` is for the Start page only.
- The app stops the browser from opening a dropped file, on every page (`startApp`); it
  looks only at the kind of thing dragged, and leaves dragged text alone. A file is taken
  only on a drop zone (`[data-drop]`); elsewhere the drag shows "not here". (F06, F11)
- The major dropdown shows its first program in the visible label and has no change
  handler: enough for one major. A second major needs both. (F06 review)
- `tests/start.test.ts` "does not read a dropped file" fails if a file dropped away from a
  drop zone is looked at in any way.
