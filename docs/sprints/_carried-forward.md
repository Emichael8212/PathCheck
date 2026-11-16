# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

## For F04 and F13 (placing courses; the checklist)
- Degree and block credits come from the curriculum, never from adding up a transcript
  row's credits. A withdrawn row still shows credits attempted. (F03 review)

## For F10 (transcript rows are untrusted)
- Before a row reaches `rowStanding` or `courseStandings` (`src/transcript.ts`): the grade
  must be text or nothing, and the transfer flag must be exactly true or false. Untyped
  reader output could otherwise crash on a number, or pass a row whose flag is the text
  "no". State and test both. (F03 QA)
- F10 uses `rowStanding` to decide whether a grade is on the scale; an "unrecognised" row is
  the invalid row shown for the student to fix. Do not write a second validator. (F03 contract)
- A row's code must be a course code before it gets to `courseStandings`, which throws
  otherwise. The totals and "Academic Standing" lines are not rows. (F03 contract)
- Real transfer rows may leave "attempted" empty: check against the transcript format when
  the real reader is built. (F03 review; also F21)

## For F10 and F11 (the review step)
- When a transfer row has a mark that is not on the scale, the fix screen must not nudge
  the student to type a letter grade. Depends on the open question to the owner in
  `docs/decision-log.md`. (F03 review)

## For F06 onward (screens)
- The scans in `tests/curriculum.test.ts` ("keeps curriculum facts out of the code", "has no
  CIS 304 …") read TypeScript files in `src/` only. When a UI framework is chosen, widen
  them to every source file that can hold text shown to the student. (F02 review)
- The curriculum JSON is imported from `docs/` into `src/`; F06 is the first time the Vite
  build bundles it. Check the built page really loads it. (F02 review)
