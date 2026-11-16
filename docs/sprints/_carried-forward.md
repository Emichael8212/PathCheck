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
- "Add your transcript for an exact answer" uses the same upload and review step: `browse`
  and `takeFile` in `src/app.ts`, `uploadPanel` and the review in `src/left.ts`, the
  transcript in `LeftState`. After the review the student should come back to "Check my
  courses", not to the checklist: decide in F12's contract how the flow returns. (F11)
- The design has "No transcript added" at the right of the page heading, and the card "Add
  your transcript for an exact answer" under the list. Neither is drawn yet. (F07)
- "This slot is already filled" must not be said for a typed sequence course the student
  still needs: with HIS 131 and GEO 206 passed, HIS 132 is what completes the sequence.
  Look at the sequence's missing courses, not only at the pick. (F04 review)

## For F13, F14 and F16 (checklist, pace, plan)
- All 121 credits can be done while the sequence is still needed (other courses hold the
  two picks). Never show the degree as complete or on pace from credits alone; the plan
  must still schedule HIS 132 or ENG 210 although no pick is open. (F04 review)

## For F12 and F13 (the legacy question on screen)
F05's rule is merged but F05 is not passing: it is BLOCKED in `docs/sprints/F05.md` until
the screens that need the question have shown it. F08 ("Check my courses") has done its
part: the question on the row, Yes and No, the line to change the answer, remembering it.
The review step (F11) says nothing about what counts toward the degree, so the question
is not asked there. F12 ("Check my courses" with a transcript) and F13 (the checklist)
remain; each contract must contain the
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

## For F13 (finishing F11: the checklist follows the reviewed rows)
- **F13 finishes F11.** The upload and the review step are merged but F11 is BLOCKED in
  `docs/sprints/F11.md`. F13's contract must contain this on-screen check, and F13's pull
  request marks F11 passing (`passes`, `evidence`) and removes its BLOCKED line: after
  "Continue" the checklist follows the reviewed rows, including the student's corrections
  and without the rows left out (correct a grade, leave a row out, continue: the
  checklist changes accordingly).
- "Continue" hands on `reviewedStandings(transcript, grades)` (`src/review.ts`): the rows
  that passed the check and were not left out. The transcript under review is
  `LeftState.transcript`, held by `startApp` (`src/app.ts`); after "Continue",
  `LeftState.continued` is true and `leftPage` (`src/left.ts`) draws the result, which
  today is one line (`countLine`). F13 replaces that line with the checklist.
- The checklist must say when rows were left out because they still need fixing ("<m>
  rows of your transcript still need fixing and count nothing"), so that a shorter
  checklist does not mislead. `stillToFix(transcript)` gives them. (F11 contract review)

## For F21 (the reader function, M2)
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
