# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

## For F13 (the checklist)
- Degree and block credits come from the curriculum (through `placeCourses`), never from
  adding up a transcript row's credits. A withdrawn row still shows credits attempted.
  (F03 review; done for placement in F04)

## For F08 (check my courses, no transcript)
- Owner answer 3 says that of two typed courses for one pick "the first counts".
  `placeCourses` puts a sequence course (HIS 132, ENG 210) ahead of another course in the
  same state. Typed GEO 206 then HIS 132 would therefore make HIS 132 count. F08 must
  either keep typed order or ask the owner which wins. (F04 review)
- CIS 304 and CIS 415 never count (owner answer, 2026-11-16). `placeCourses` leaves them
  unplaced with the reason "not-current", and `countsByElectiveRule` says no. Flow A must
  answer, in the owner's words, "Doesn't count toward CIS — <code> isn't in the current CIS
  curriculum.", and never the elective answer. The owner asked for a Flow A test of both
  courses, and of another 300/400-level CIS course that still counts as an elective.
  F08 steps 2, 5 and 7 now say so (owner approval, 2026-11-16).
- `placeCourses` refuses the same course twice. A student may type a course twice, or type
  one that is already on the transcript: merge before calling it. (F04 QA)
- Typed courses need a third, weaker state than passed and in progress, with its own
  credits, so that pace is not mixed with courses really in progress. (F04 review)

## For F07 (entering courses)
- Suggestions come from the courses of the curriculum. Never suggest a course from the
  elective rule's exceptions (CIS 304, CIS 415). (F04 fix QA)

## For F09 (credit total)
- Owner answer, 2026-11-16 ("Credits of a course PathCheck doesn't know"): a course
  PathCheck doesn't know starts at 3 credits and the student can change it; a course it
  knows uses its curriculum credits and is not editable. An unknown course's credits add
  to the semester total only, never to what counts toward CIS. The owner's tests: an unknown course adds 3 by default; an edited
  value changes the total and the under-12 / over-18 notes; an unknown course's credits
  never count toward CIS.
- Agent's reading (decision log), not the owner's words: "doesn't know" means not in a
  curriculum list and not matching the elective rule, which includes CIS 304 and CIS 415
  (3 by default, editable); a rule-matched elective (MKT 410) is known: the rule's 3
  credits, not editable.
- This is F09 step 5 in `features.json` (owner approval, 2026-11-16).
- The field to change the credits is not in the approved design (it shows "3 cr" as text):
  add it to `docs/design/DESIGN.md` as a difference that comes from this answer. What
  values the field accepts is not an academic rule: choose the simplest and record it.
  The entry row is built in F07 and the answers in F08; say in F09's contract where the
  field lives.

## For F18 (on every result)
- The owner said to leave out "Curriculum last reviewed: Nov 2026" (2026-11-16): the
  curriculum file has no review date and none is invented. F18 steps 1 and 3 need a date.
  Before building F18, ask the owner: give a date, or reword the two steps. (Owner answer,
  2026-11-16)

## For F12 and F13 (answers with a transcript; the checklist)
- A course left unplaced with the reason "not-current" (CIS 304, CIS 415) must always read
  as not counting: never the elective answer, never under a block. In Flow A it uses the
  owner's sentence, with or without a transcript. (F04 fix review)

## For F12 (check my courses, with a transcript)
- "This slot is already filled" must not be said for a typed sequence course the student
  still needs: with HIS 131 and GEO 206 passed, HIS 132 is what completes the sequence.
  Look at the sequence's missing courses, not only at the pick. (F04 review)

## For F13, F14 and F16 (checklist, pace, plan)
- All 121 credits can be done while the sequence is still needed (other courses hold the
  two picks). Never show the degree as complete or on pace from credits alone; the plan
  must still schedule HIS 132 or ENG 210 although no pick is open. (F04 review)

## For F08, F11 and F13 (the legacy question on screen)
F05's rule is merged but F05 is not passing: it is BLOCKED in `docs/sprints/F05.md` until
these three screens have shown the question. Each of their contracts must contain the
on-screen checks below, checked by the evaluator in a browser. The pull request of the
last of the three marks F05 passing (`passes`, `evidence`) and removes its BLOCKED line.
- On-screen checks: the question appears for each of the four legacy courses, typed in any
  form; it does not appear without them; it uses `LEGACY_QUESTION`, `LEGACY_YES` and
  `LEGACY_NO` (`src/legacy.ts`) exactly; Yes and No visibly change the result; the answer
  survives a reload; the student can change it and the result updates; it is not asked
  again once answered; it works with the keyboard only and at 375px.
- No verdict before the answer. While the question is unanswered, no "counts" or "doesn't
  count" is shown for any of the four courses: `placeCourses` treats no answer as No, and
  "Doesn't count" would be false for a legacy student.
- Keep the answer in memory for the visit and pass it to `placeCourses` as `{ legacy }`.
  Never rely on reading it back: in private browsing `writeLegacyAnswer` does nothing and
  `readLegacyAnswer` gives "not given yet".
- Get the storage only through `browserStorage()` (`src/legacy.ts`), never by naming
  `localStorage` in a screen: with site data blocked, some browsers fail on that alone.
- Pass `legacyQuestionNeeded` every code that appears, typed or on any reviewed transcript
  row, whatever its grade.
- For F08: neither the brief nor an owner answer gives the words for a legacy-elective
  answer, or says under which block PSY 251 is shown for a legacy student. Ask the owner;
  invent nothing. Any "counts" answer keeps "unless you've already passed it or filled
  this slot".
- With Yes, an elective place can be filled `by: 'legacy'`, and PSY 251 can be an elective
  while another course holds its pick. (F05)

## For F19 (clear my data)
- "Clear my data" must also forget the legacy answer, through `clearLegacyAnswer`
  (`src/legacy.ts`). (F05)

## For F14 (pace)
- Pace is taken from the totals of `placeCourses` (`src/placement.ts`): remaining = degree
  credits − done − in progress. Do not add up in-progress rows: a course in progress that
  fills no place adds nothing. (F04 contract review)

## For F10 (transcript rows are untrusted)
- Before a row reaches `rowStanding` or `courseStandings` (`src/transcript.ts`): the grade
  must be text or nothing, and the transfer flag must be exactly true or false. Untyped
  reader output could otherwise crash on a number, or pass a row whose flag is the text
  "no". State and test both. (F03 QA)
- F10 uses `rowStanding` to decide whether a grade is on the scale; an "unrecognised" row is
  the invalid row shown for the student to fix. Do not write a second validator. A transfer
  row is never "unrecognised": its grade column is not read, so F10 must not flag it for a
  grade. (F03 contract; owner answer, 2026-11-16)
- `rowStanding` takes a row as transfer credit only when the flag is exactly true. F10
  should still refuse a flag that is not true or false, so a misread is shown, not hidden.
  (F03 fix review)
- A row's code must be a course code before it gets to `courseStandings`, which throws
  otherwise. The totals and "Academic Standing" lines are not rows. (F03 contract)
- Real transfer rows may leave "attempted" empty: check against the transcript format when
  the real reader is built. (F03 review; also F21)

## For F10 and F11 (the review step)
- Transfer, AP and CLEP rows are labelled "Transfer credit" in the review step, so the
  student can correct a misread row (for example a row wrongly read as transfer, or the
  other way round). The grade column of such a row is not a grade: do not ask the student
  to fix it. (Owner answer, 2026-11-16)
- Made-up transcripts may now show marks such as "T" or "TR" on transfer rows. (Owner
  answer, 2026-11-16)

## For F06 onward (screens)
- The scans in `tests/curriculum.test.ts` ("keeps curriculum facts out of the code", "has no
  CIS 304 …") read TypeScript files in `src/` only. When a UI framework is chosen, widen
  them to every source file that can hold text shown to the student. (F02 review)
- The curriculum JSON is imported from `docs/` into `src/`; F06 is the first time the Vite
  build bundles it. Check the built page really loads it. (F02 review)
