# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

## For F17 and F18 (the printed summary; on every result)
- The footer is `foot(curriculum, subject)` in `src/shell.ts`: it already leaves the
  last-reviewed line out when there is no date and takes the email's subject. Still to
  do in F18: the 12-month banner, the owner's real address in `src/wording.ts`, and the
  email pre-filled with the course or result. (F06)
- The owner said to leave out "Curriculum last reviewed: Nov 2026" (2026-11-16): the
  curriculum file has no review date and none is invented. F17's last-reviewed line and
  F18 steps 1 and 3 need a date. Before building whichever comes first, ask the owner:
  give a date, or reword those steps. (Owner answer, 2026-11-16)

## For F14 and F15 (typed courses beside a transcript)
- Typed courses are placed as *planned* (`options.planned` in `placeCourses`): a planned
  course never takes a place from a passed or in-progress one, and adds nothing to
  `credits.done` or `credits.inProgress`. Pace must not mix planned courses with courses
  really in progress; the credits of the typed list are `totalsOf(…).total`. (F12)

## For F14, F16, F17 and F19 (what the checklist leaves for them)
- The result is drawn by `resultHtml` in `src/left.ts` from `checklistOf` in
  `src/checklist.ts` (`overviewHtml`, `requirementsHtml`). The pace answer goes into
  `<div data-pace>` beside the ring, the controls under the credit bar (F14); the draft
  plan after the requirements (F16); "Print / save PDF" and "Clear my data" at the end
  (F17, F19). The stylesheet already has the design's rules for all of them. (F13)
- The legacy question comes before the whole result (`legacyChanges`): pace and the plan
  must not be drawn before it is answered either. (F13)
- While rows still need fixing the result says so above itself; pace and the plan
  should carry the same caution (they are built on the same rows). (F13)
- Requirements are `<details>`; for print every requirement must be opened and the
  toggles, "All / Not done" and the two end buttons hidden (`.no-print`). (F13, for F17)

## For F14 and F16 (pace, plan)
- **The draft plan schedules the extra sequence course** (owner answer, 2026-11-16): when
  both picks are held and no sequence is on its way, the plan has HIS 132 or ENG 210 with
  its 3 extra credits, although no pick is open. F16's contract needs the check and the
  test; pace (F14) must count those extra credits among what is left.
- All 121 credits can be done while the sequence is still needed (other courses hold the
  two picks). Never show the degree as complete or on pace from credits alone; the plan
  must still schedule HIS 132 or ENG 210 although no pick is open. (F04 review)

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

## For F21 (the reader function, M2)
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
