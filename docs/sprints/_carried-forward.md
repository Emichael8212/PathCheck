# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

## For F13 (the checklist)
- Degree and block credits come from the curriculum (through `placeCourses`), never from
  adding up a transcript row's credits. A withdrawn row still shows credits attempted.
  (F03 review; done for placement in F04)

## For F12 (the numbers with a transcript)
- The summary strip is `summaryHtml` in `src/check.ts`, from `totalsOf` in
  `src/credits.ts`. With a transcript the count is exact: the condition under "Count
  toward CIS" is dropped (owner answer b) and the two counts come from the exact answers.
  (F09)

## For F17 and F18 (the printed summary; on every result)
- The footer is `foot(curriculum, subject)` in `src/shell.ts`: it already leaves the
  last-reviewed line out when there is no date and takes the email's subject. Still to
  do in F18: the 12-month banner, the owner's real address in `src/wording.ts`, and the
  email pre-filled with the course or result. (F06)
- The owner said to leave out "Curriculum last reviewed: Nov 2026" (2026-11-16): the
  curriculum file has no review date and none is invented. F17's last-reviewed line and
  F18 steps 1 and 3 need a date. Before building whichever comes first, ask the owner:
  give a date, or reword those steps. (Owner answer, 2026-11-16)

## For F12 and F13 (answers with a transcript; the checklist)
- A course left unplaced with the reason "not-current" (CIS 304, CIS 415) must always read
  as not counting: never the elective answer, never under a block. In Flow A it uses the
  owner's sentence, with or without a transcript. (F04 fix review)

## For F12, F14 and F15 (typed courses beside a transcript)
- Without a transcript every typed course is placed in the same state (in progress). With
  a transcript, typed courses need a third, weaker state than passed and in progress,
  with its own credits, so that a planned course never takes a place from a passed one
  and pace is not mixed with courses really in progress. (F04 review; F08)
- With a transcript the answers change: "You already passed this", "This slot is already
  filled", and "Counts toward CIS: <block>" without the condition (F12's steps). The
  sentences of `src/wording.ts` and `answersFor` in `src/answers.ts` are the place to add
  them; the condition belongs to the no-transcript answers only. (F08)

## For F12 (check my courses, with a transcript)
- The design has "No transcript added" at the right of the page heading, and the card "Add
  your transcript for an exact answer" under the list. Neither is drawn yet. (F07)
- "This slot is already filled" must not be said for a typed sequence course the student
  still needs: with HIS 131 and GEO 206 passed, HIS 132 is what completes the sequence.
  Look at the sequence's missing courses, not only at the pick. (F04 review)

## For F13, F14 and F16 (checklist, pace, plan)
- All 121 credits can be done while the sequence is still needed (other courses hold the
  two picks). Never show the degree as complete or on pace from credits alone; the plan
  must still schedule HIS 132 or ENG 210 although no pick is open. (F04 review)

## For F11 and F13 (the legacy question on screen)
F05's rule is merged but F05 is not passing: it is BLOCKED in `docs/sprints/F05.md` until
the screens that need the question have shown it. F08 ("Check my courses") has done its
part: the question on the row, Yes and No, the line to change the answer, remembering it.
F11 (the review step) and F13 (the checklist) remain; each contract must contain the
on-screen checks below, checked by the evaluator in a browser. The pull request of the
last of them marks F05 passing (`passes`, `evidence`) and removes its BLOCKED line. Reuse
what F08 built: `answerCell` and the "Change" line in `src/check.ts`, the sentences in
`src/wording.ts`, and the answer held in `CourseList.legacy` by `startApp`.
- On-screen checks: the question appears for FLS 161, MGT 220 and MGT 203, typed in any
  form, and for PSY 251 only when its answer depends on the legacy answer (another course
  in its Social sciences pick, with an elective place free; owner answer, 2026-11-16:
  PSY 251 alone is an ordinary course of that block); it does not
  appear without them; it uses `LEGACY_QUESTION`, `LEGACY_YES` and
  `LEGACY_NO` (`src/legacy.ts`) exactly; Yes and No visibly change the result; the answer
  survives a reload; the student can change it and the result updates; it is not asked
  again once answered; it works with the keyboard only and at 375px.
- No verdict before the answer that the answer could change. Work out the result for Yes
  and for No, as `answersFor` does (`src/answers.ts`): a course whose result is the same
  either way shows it (PSY 251 alone counts for Social sciences); a legacy course whose
  result differs shows the question; any other course whose result differs waits.
- Keep the answer in memory for the visit and pass it to `placeCourses` as `{ legacy }`.
  Never rely on reading it back: in private browsing `writeLegacyAnswer` does nothing and
  `readLegacyAnswer` gives "not given yet".
- Get the storage only through `browserStorage()` (`src/legacy.ts`), never by naming
  `localStorage` in a screen: with site data blocked, some browsers fail on that alone.
- Whether to ask is decided by that comparison, not by `legacyQuestionNeeded`
  (`src/legacy.ts`), which is true for PSY 251 alone and would ask too often.
- The owner's words (2026-11-16): Yes "Counts toward CIS: elective (legacy)"; No "Doesn't
  count toward CIS. Legacy students only."; not answered: the question in place of an
  answer, never "Counts" before it.
- With Yes, an elective place can be filled `by: 'legacy'`, and PSY 251 can be an elective
  while another course holds its pick. (F05)

## For F19 (clear my data)
- The credits the student gave a course PathCheck doesn't know are part of the list
  (`Entry.credits`): kept and cleared with it. (F09)
- The entered courses live in memory only (a `CourseList` from `src/check.ts`, held by
  `startApp` in `src/app.ts`).
  F19 keeps them across visits and clears them. (F07)
- "Clear my data" must also forget the legacy answer, through `clearLegacyAnswer`
  (`src/legacy.ts`). (F05)

## For F15 (the pace line in "Check my courses", with a transcript)
- The made-up transcript `sample-a` has its in-progress courses under "Fall 2026", as the
  approved design's student has: the default term is then Spring 2027. No made-up
  transcript has a summer term: the owner has given only the headings "Fall 2023" and
  "Spr 2024". Ask how a summer term is printed before testing "a summer latest term skips
  to Fall". (F10)
- The credits of the typed courses ("15 credits in …") are `totalsOf(…).total`
  (`src/credits.ts`): the curriculum's credits, and the student's own number for a course
  PathCheck doesn't know. (F09)
- Owner answer, 2026-11-16 ("No semester in the heading; the term for the pace line"). If
  the pace line needs the term the typed courses are for: the default is the next Fall or
  Spring after the latest term on the transcript (the term with In progress rows if there
  is one, otherwise the latest graded term; summer terms are skipped; Fall 2026 in
  progress gives Spring 2027). The line shows that term as a small control the student can
  change (Fall/Spring, the default term and the next few after it). The term is never
  derived from today's date. If F15 doesn't need a term, build nothing for it.
- The owner's tests: an in-progress term gives the next Fall/Spring; no in-progress term
  uses the latest graded term; a summer latest term skips to Fall; changing the term
  changes the finish semester.

## For F14 (pace)
- The made-up transcript `sample-a` has its in-progress courses under "Fall 2026", as the
  approved design's student has. No made-up transcript has a summer term: how one is
  printed is still to be asked (see the F15 note). (F10)
- The Start demo shows "On pace for Spring 2029" for its made-up student
  (`src/examples.json`; `demoStudent` in `src/start.ts`) as example text. Check it against
  the pace code, and against the sequence (that student still needs it, with the pick
  open); change the text or the student if it is not what the code says. (F06)
- Pace is taken from the totals of `placeCourses` (`src/placement.ts`): remaining = degree
  credits − done − in progress. Do not add up in-progress rows: a course in progress that
  fills no place adds nothing. (F04 contract review)

## For F11 (finishing F10: the review step and the localhost upload)
- **F11 finishes F10.** F10's checking is merged but F10 is BLOCKED in
  `docs/sprints/F10.md`. F11's contract must contain these on-screen checks, and F11's pull
  request marks F10 passing (`passes`, `evidence`) and removes its BLOCKED line: an invalid
  row is shown for the student to fix, with what was read and what is wrong, and counts
  nothing until it is fixed; the localhost upload takes the two made-up PDFs in
  `synthetic/transcripts/`, and nothing of any other file is read or sent.
- A reader's answer goes through `readRows` (`src/reader.ts`) and only then, by
  `standingsOf`, to `placeCourses`. A row the student has fixed is checked again by
  `readRows`, like any row. `RowToFix.problems` says which field is at fault; `seen` holds
  what was read, as text, to fill the fields the student edits.
- An ordinary row with nothing in its grade column passes the check as "in progress".
  The review step shows it as "In progress" for the student to confirm: an empty grade
  may be a misread.
- A row marked `transfer` is labelled "Transfer credit", so the student can correct a row
  wrongly read as transfer, or the other way round; its grade column is not a grade and
  is not to be fixed. (Owner answer, 2026-11-16)
- `match` is not "counts". "listed" only means the code is in a curriculum list: a legacy
  course, or a listed course with a D, W or F, fills nothing. What counts comes only from
  `placeCourses`; never label a row as counting from `match` alone. A row whose `match` is
  "none" passed the check but can fill nothing: it is not an error, and the student must
  still be able to edit it (a code misread by one digit is "none").
- On Start, the drop zone and "Browse files" must start the upload: "Browse files" opens
  the file picker, not the flow page, and a dropped PDF is taken. Today both only open
  `#/left` and the file is not looked at (`startApp` in `src/app.ts`). The privacy
  sentence is already beside them. (F06)
- At M1 the "reader" is the answer file beside each made-up PDF. F11 decides how the
  uploaded PDF is recognised (the PDFs' text is uncompressed and every page carries the
  line in `MARK`, `scripts/make-synthetic-transcripts.mjs`). The answer files hold course
  codes, so they cannot be imported from `src/` as source text the scans read.

## For F21 (the reader function, M2)
- It must return the shape `readRows` checks: `{ "rows": [ … ] }`, each row with `term`,
  `transfer`, `prefix`, `number`, `description`, `attempted`, `earned`, `grade`, `points`,
  and nothing about the student. The shape changes only by a recorded decision that
  updates F10's checks in the same pull request. (F10)
- Confirm on the owner's real transcript: how the transfer section's totals line is worded
  (`NOT_COURSES` in `src/reader.ts` has "Transfer Totals", the made-up PDF's wording), and
  whether transfer rows leave "attempted" empty. (F10; F03 review)

## For F07 onward (screens)
- How the app is put together (F06): a page is a function that returns HTML text
  (`src/start.ts`, `flowPage` in `src/shell.ts`); `renderPage` in `src/app.ts` picks the
  page for an address; `startApp` draws it, sets the tab title, and after a page change
  puts the keyboard on the page's `<h1>` and scrolls to the top. Addresses are in
  `src/shell.ts` (`HREF`, `routeOf`). Anything with a timer must stop when the student
  leaves its page, as the demo does.
- Redrawing a whole page loses what the student is typing. From F07, redraw only the part
  that changed, or keep the field out of the redrawn part.
- The scans in `tests/curriculum.test.ts` read every file in `src/`, `index.html` and
  `public/`: no course code, title, block name or credit total may be written there. Take
  them from the curriculum. `src/examples.json` is for the Start page only.
- The app stops the browser from opening a dropped file, on every page (`startApp`); it
  looks only at the kind of thing dragged, and leaves dragged text alone. A file drag
  shows a "copy" cursor even where the drop does nothing: when F11 builds the upload,
  accept a file only on the drop zone. (F06 review and QA)
- The major dropdown shows its first program in the visible label and has no change
  handler: enough for one major. A second major needs both. (F06 review)
- `tests/start.test.ts` "does not read a dropped file" fails if anything in `src/` reads a
  file or sends a request. F11 changes that test on purpose, for the upload only.
