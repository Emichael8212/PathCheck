# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

## For F21 (the reader function, M2)
- **What is kept once real transcripts are read** (F19): the browser keeps the last result
  as the reviewed rows without any passing letter grade (`keptRows` in
  `src/remember.ts`), and never the file's name. The consent sentence of the first
  upload (brief §7) and the privacy line must still be true with a real transcript:
  "Only your result stays in this browser." Check with the owner's real transcript that
  nothing personal is in a row's printed title, which is kept. A row that still needs
  fixing is kept as it was read, title included: a real reader that returns a header
  line (a name, an ID) as a row with a faulty code would put that text in the browser's
  storage until the row is fixed, left out or cleared. The reader function must not
  return such lines as rows, and F21's checks must say so. (F19 code review)
- A grade printed as a word or a pass mark ("P", "S", "Passed") on a real transcript is a
  row to fix today, like any grade the curriculum's scale does not have. "Passed" is read
  as a pass only from what PathCheck itself kept. If real transcripts print such grades,
  that is an academic rule for the owner, not a change to make here. (F19)
- Whatever is added to the result later must be either kept on purpose or left out of
  `pathcheck.visit`: `tests/remember.test.ts` "keeps only what the result needs" pins the
  entry's fields. (F19)
- Confirm on the owner's real transcript how a summer term is printed, and a winter or
  mini-term if there is one: `readTerm` in `src/pace.ts` reads "Fall", "Spr"/"Spring",
  "Sum"/"Summer" and a four-digit year, and gives no pace estimate for anything else.
  (F14 contract review; the owner's open question since F10)
- **For F24, from F22 (its check 11): the published site with the owner's real Turnstile
  keys.** The owner sets `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for
  Production (a widget for `pathcheck.netlify.app`) and adds `GEMINI_API_KEY` for
  Production. F24's contract checks: the main address without the keys refuses every
  upload; with them an upload is read, and the function took the token only for the
  action `upload` and the site's own hostname; the staging address is the Production
  context, not a branch deploy; once, the real widget asking for a tick, with the
  keyboard (Cloudflare's test site key `3x00000000000000000000FF` forces one on a
  preview). (F22 QA part 2; code review rounds 1 and 2)
- **For F24:** the pill "Synthetic transcript result" is shown only over a made-up
  transcript's result (the owner, 2026-11-17; done before the owner's own upload, see
  `docs/sprints/F13.md`). F24's contract checks on the published site that the owner's
  own result does not show it. (F13 contract review; F21 QA part 2)
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
