# Carried forward

Points raised while building one feature that a later feature's contract must take up.
Read this before writing a sprint contract; delete a line when its feature has dealt with it.

**All 26 features are finished (2026-11-18), so nothing here waits for a feature.** The
notes for finished features are removed. What is still open for the owner is in
`docs/milestones/M2.md` part 4 and `docs/milestones/M3.md` part 5. What follows is kept
for whoever changes PathCheck next.

## Rules a change must keep
- Whatever is added to the result later must be either kept on purpose or left out of
  `pathcheck.visit`: `tests/remember.test.ts` "keeps only what the result needs" pins the
  entry's fields. (F19)
- The reader function must return the shape `readRows` checks: `{ "rows": [ … ] }`, each
  row with `term`, `transfer`, `prefix`, `number`, `description`, `attempted`, `earned`,
  `grade`, `points`, and nothing about the student. The shape changes only by a recorded
  decision that updates F10's checks in the same pull request. (F10)
- The scans in `tests/curriculum.test.ts` read every file in `src/`, `index.html` and
  `public/`: no course code, title, block name or credit total may be written there. Take
  them from the curriculum. `src/examples.json` is for the Start page only.
- `tests/start.test.ts` "does not read a dropped file" fails if a file dropped away from a
  drop zone is looked at in any way.

## Known edges, not decided
- A row that still needs fixing is kept in the browser as it was read, title included. If
  a transcript ever makes the reader return a header line (a name, an ID) as a row with a
  faulty code, that text stays in the browser's storage until the row is fixed, left out
  or cleared. Not seen on the owner's transcript: on 2026-11-17 no row asked to be fixed
  (M2, step 6). (F19 code review)
- A correction whose prefix reads like a totals line and whose number is empty is thrown
  away like a totals line, and the row cannot be brought back. Rare. (F11 review)
- "Browse files" opens the picker through a file control that is not in the page
  (`browse` in `src/app.ts`). It worked on the owner's phone on 2026-11-17 (M2, step 7);
  which phone was not recorded. If a phone's picker ever does not open, put the control
  in the page, hidden. (F11 review)
- The major dropdown shows its first program in the visible label and has no change
  handler: enough for one major. A second major needs both. (F06 review)

## How the app is put together
- A page is a function that returns HTML text (`src/start.ts`, `src/check.ts`,
  `src/left.ts`); `renderPage` in `src/app.ts` picks the page for an address; `startApp`
  draws it, sets the tab title, and after a page change puts the keyboard on the page's
  `<h1>` and scrolls to the top. Addresses are in `src/shell.ts` (`HREF`, `routeOf`).
  Anything with a timer must stop when the student leaves its page, as the demo does.
  (F06)
- Redrawing a whole page loses what the student is typing. Redraw only the part that
  changed, or keep the field out of the redrawn part. The review step ("Check what was
  read") is drawn again as a whole: it reads what is typed in the open edit into `LeftState.draft` first,
  and says what happened in `#pathcheck-status`, a line beside the page.
- The app stops the browser from opening a dropped file, on every page (`startApp`); it
  looks only at the kind of thing dragged, and leaves dragged text alone. A file is taken
  only on a drop zone (`[data-drop]`); elsewhere the drag shows "not here", except while a
  transcript is under review, when a drop anywhere says to use "Use another transcript"
  first. (F06, F11)
