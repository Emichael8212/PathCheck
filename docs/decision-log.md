# Decision log

Choices the brief (`docs/BRIEF.md`) doesn't cover — the simplest option, why, and how to
undo it — plus the owner's answers at each milestone. Academic rules are never decided
here by the agent; they are asked and the owner's answer is recorded.

## 2026-11-15 — Project setup

| Decision | Why | Undo |
|---|---|---|
| Tooling: Vite, TypeScript, Vitest, ESLint; Node 24 (`.nvmrc`). No UI framework chosen yet. | The carried-over hooks, `scripts/init.sh` and CI already expect `npm run lint / typecheck / test` and a dev server on port 5173. A framework is only needed once there is UI, so it is decided with the first feature that needs one. | Replace the dev dependencies and scripts in `package.json`. |
| CI runs one job named `check` (lint, typecheck, tests, build). No browser tests in CI yet. | Nothing to test in a browser until the first feature. | Add steps to `.github/workflows/ci.yml`. |
| Feature IDs are `F01`–`F26` in `features.json`, each with a `milestone` field (M0–M3). | Hooks and `/next-task` need to know the current milestone and when to stop. | Edit `features.json` (owner approval needed for ids, descriptions and steps). |
| (2026-11-16, F02) The app's code lives in `src/` as plain TypeScript modules; the curriculum model is `src/curriculum.ts`. A UI framework is still not chosen; that is decided with F06, the first screen. | Rules and data need no framework, and keeping them free of one makes every academic rule testable on its own. | Move the files. |
| (2026-11-16, F03) A grade that is not on the scale (for example "B+" or "P") never passes and is reported as "unrecognised", not as "must be repeated"; the review step asks the student to fix it. This applies to ordinary rows only: a transfer row counts whatever its grade column shows (owner answer, 2026-11-16). | The owner said only A, B, C, D, F exist, so such a mark is a misread or something unforeseen. It is not "C or better", so it cannot pass; calling it "must be repeated" would be a claim PathCheck can't back. | Change `rowStanding` in `src/transcript.ts`. |
| (2026-11-16, F03) When a course has several transcript rows and none passes, its standing is the first that applies of: in progress, unrecognised, must repeat, no credit. | In progress first: the brief says to assume the course will be passed and not to schedule it again. "Must be repeated" only when no row leaves the outcome open; it outranks W and I because the flag belongs to the below-C grade. | Change the order in `src/transcript.ts`. |
| (2026-11-16, F04) "Place it where it helps most", when a student has more courses than a pick group asks for: a passed course is placed before one in progress; between two in the same state, a course that belongs to a sequence (HIS 132, ENG 210) before one that does not; then the order of the transcript. The three elective places are filled passed before in progress, then in transcript order. | Passed first is the only order that counts a passed course the brief lists for that place. The sequence course goes first because the owner said "HIS 132 fills the Social sciences pick; ENG 210 fills the Humanities pick". The rest only fixes which of two interchangeable courses is named. None of it changes the credits remaining; passed-first can move credits between "done" and "in progress" compared with always giving the pick to the sequence course. | Change the order in `src/placement.ts`. |
| (2026-11-16, F04) The history or literature sequence is judged on the courses themselves: done when both courses of one alternative are passed, in progress when both are passed or in progress. | Otherwise HIS 132 in progress, while another passed course holds the pick, would read "still needed". The sequence adds no credits either way. | Change `src/placement.ts`. |
| (2026-11-16, F04) "Not already required" in the elective rule is read as "not listed in any block, whether required or a pick". | It makes no difference for this curriculum: no pick course matches the elective rule (a test asserts it). If the data ever changes so that one does, the reading matters and goes to the owner. | Change `src/placement.ts`. |
| Curriculum file keeps its name `docs/curriculum/provisional-current.json`; "CIS 300/400-level" is stored as course numbers 300–499. | Name kept as carried over. 300–499 is the plain reading of "300/400-level". | Rename the file / edit `electives.subjectRule`. |
| The curriculum keeps titles for FIN 201, FLS 161, MGT 203 and MGT 220 from the 2025–2027 catalog; every other title is from the departmental guide. | Sources as given by the owner. | Edit the data file. |
| `lastReviewed` in the curriculum file is 2026-11-15 (it was `null` until the owner gave the date on 2026-11-16; see "Owner answers"). | The owner provides the date of the last curriculum review (brief §12). | Change the date in the curriculum file at the next review. |
| Evaluator calibration lives in `.claude/agents/evaluator.md`; there is no separate status or calibration document. | Fewer files to keep in sync. | Move the section to its own file. |
| (2026-11-16, F05) Until the student answers the legacy question, the four legacy courses are counted as for a No. A screen still tells the two apart: while the answer is missing it asks, and shows no verdict for those courses. | "Does it count?" must never say a course counts when it may not. | Count them as for a Yes (not advised), in `placeCourses`. |
| (2026-11-16, F05) For a legacy student, PSY 251 is placed "where it helps most" (brief §5), extending the F04 reading: it stays a Social sciences pick course unless treating it as an elective gives strictly more credits done, or the same done and strictly more in progress. | It only chooses between the two places the curriculum already gives PSY 251; it never counts a course the rules would not count. | Change `countsMore` or the order in `placeCourses` (`src/placement.ts`). |
| (2026-11-16, F05) The legacy answer is kept in the browser's `localStorage` under the key `pathcheck.legacy`. If storage cannot be used (private browsing), the answer is not remembered and nothing fails; screens keep it in memory for the visit, and reach storage only through `browserStorage()`, because with site data blocked some browsers fail on the mention of `localStorage` itself. | Simplest option that still "remembers" (brief §4). | Change `src/legacy.ts`. |
| (2026-11-16, F05) F05 is not marked passing by its own pull request. Its rule, wording and remembered answer are merged with tests, with `passes: false` and a BLOCKED line in `docs/sprints/F05.md` so that work moves on to F06. It is marked passing in the pull request of the last of F08, F11 and F13, when the evaluator has seen the question asked, answered and changed in a browser. | Two of F05's steps are things a student sees and does on a screen, and no screen exists yet. Marking it passing now would be a false pass; leaving it merely failing would stall the work queue. | Split F05 into a rule feature and a screen feature in `features.json` (needs the owner's approval). |
| (2026-11-16, F06) No UI framework. The app is plain TypeScript: each page is a function that returns HTML text, as in the approved mockups, with small functions that wire up what moves. | No new dependency; the pages can be tested without a browser; the mockups already work this way. | Add a small framework when a screen needs it. |
| (2026-11-16, F06) One page with three addresses: `#/` (Start), `#/check`, `#/left`. Anything else shows Start. | What the student entered stays in memory when moving between the two flows, and a static host needs no extra rules. | Use separate pages or path addresses (needs host rules). |
| (2026-11-16, F06) The app's stylesheet is `src/style.css`, started as a copy of `mockups/style.css`. The two fonts stay in `mockups/fonts/` and are not duplicated. `mockups/` stays unchanged as the M0 reference. | The app's styles will grow; the approved mockups must not change under them. A test keeps the color tokens equal. | Move the fonts and delete `mockups/` after M1. |
| (2026-11-16, F06) The Start page's examples (MGT 321, BIO 230, the demo's made-up student) are named by course code only, in `src/examples.json`, which only the Start page reads. Titles, credits, block names and totals are looked up in, or worked out from, the curriculum. An example that would say something untrue stops the page from being drawn. | No curriculum fact outside the curriculum file; the examples can never go stale. | Edit `src/examples.json`. |
| (2026-11-16, F06) Sentences that several screens show exist once, in `src/wording.ts`; the 3 credits of a course PathCheck doesn't know exist once, in `src/credits.ts`. | Every screen says the same thing in the same words. | Inline the constants. |
| (2026-11-16, F06) Until F11 the drop zone takes no file: "Browse files" and a file dropped on Start open the "See what I have left" page. The file is not read. A file dropped anywhere is never opened by the browser in place of PathCheck. | Upload is F11. A dropped PDF must not replace the app or look as if it was read. | F11 replaces this. |
| (2026-11-16, F06) Until their flows are built, `#/check` and `#/left` show only the top bar, the flow's name and the footer. | "Each choice opens its flow" can be checked now; nothing unbuilt is announced. | F07 and F11 replace them. |
| (2026-11-16, F06; replaced by F14: the line is now worked out by the pace code) The demo's "On pace for Spring 2029" is example text for the made-up student, shown with its caveat. | The pace code is F14. | F14 checks it against the pace code and the sequence, or changes it. |
| (2026-11-16, F06) "Report a mistake" is an email link to the placeholder address `report@pathcheck.example` until the owner gives the real one (brief §12). | As in the approved mockups; the owner provides the address before launch. | Set `REPORT_ADDRESS` in `src/wording.ts` (F18). |
| (2026-11-16, F07) F07 is not marked passing by its own pull request. Entering courses is merged with tests, with `passes: false` and a BLOCKED line in `docs/sprints/F07.md`; F08's pull request marks it passing. | Its steps 3 and 4, and half of step 2, are about answers, and the answers are F08. | Show one kind of answer inside F07 (splits F08's logic over two features). |
| (2026-11-16, F07) What is suggested while typing: courses the curriculum lists whose code starts with the typed text (spaces, dashes and letter case ignored, exactly as when a code is added), then those whose title has the typed words, in order, at the start of its words. At least two characters; at most six suggestions. | Simplest matching that finds a course by code or by title, as the brief asks. | Change `suggest` in `src/entries.ts`. |
| (2026-11-16, F07) "Add" or Enter adds the typed text when it is a complete course code, in or out of the curriculum; otherwise the highlighted suggestion; otherwise nothing, with a line saying what to type. The same course is never in the list twice. | A whole code is what the student asked for; a course entered twice would be counted twice. | Change `addCourse` in `src/entries.ts`. |
| (2026-11-16, F07) With no courses entered the table is not drawn and one line says "Add the courses you plan to take next semester." Two more lines can appear under the field: what to type, and "<code> is already in your list." | The design has no empty list and no message for text that cannot be added. | Reword in `src/check.ts`; listed in the pull request for the owner. |
| (2026-11-16, F07) The heading of "Check my courses" is the flow's name, with no small label above it and no semester. | The design's heading is the next semester; the owner decided on 2026-11-16 that the heading has no semester (see "Owner answers"). | Owner's decision. |
| (2026-11-16, F07) Tests of typing and the keyboard run in a simulated browser, `happy-dom` 21.0.4 (exact version), a development-only dependency. It is not in what the student downloads. | The page's behaviour can be tested on every run, not only by hand. The F06 decision (no framework) is about the app itself. | Remove it and the test file `tests/check-page.test.ts`. |
| (2026-11-16, F07) The entered courses are kept in memory for the visit (a `CourseList`, defined in `src/check.ts` and held by `startApp` in `src/app.ts`): they survive moving between pages and are gone after a reload. | Keeping them across visits, with "Clear my data", is F19. | Draw the page from an empty list each time (in `startApp`). |
| (2026-11-16, F08) The typed courses are placed with the transcript code (`placeCourses`): all in one state (in progress), in typed order, with the legacy answer. Each course's answer is read off that placement. | The two flows cannot disagree (owner, 2026-11-16); the sequence course wins its slot and electives are taken in order without new code. | Write separate rules for typed courses in `src/answers.ts`. |
| (2026-11-16, F08) Before the legacy question is answered, a row whose sentence would differ between Yes and No shows no verdict: a legacy course shows the question; any other course shows "Answer “Are you a legacy CIS student?” to see this." A row whose sentence is the same either way shows it. | The owner: never "Counts" before the answer, and never "Counts" for a place the student's own list fills. Either verdict could be wrong until the answer is known. The waiting sentence is the agent's; listed in the pull request. | Reword `waitingFor` in `src/wording.ts`. |
| (2026-11-16, F08) PSY 251 with the answer Yes, its pick held by a sequence course and the three elective places full, shows the same-requirement sentence. | One of the owner's sentences had to be chosen; this one names the place the curriculum lists PSY 251 for. | Use the places-filled sentence instead, in `src/answers.ts`. |
| (2026-11-16, F08) A pick that takes more than one course names all the courses that fill it ("<A> and <B>"). | The owner's sentence names one course; the CIS curriculum has no such pick, the made-up test program has. | Name only the first course, in `sameRequirement` (`src/wording.ts`). |
| (2026-11-16, F08) Once the legacy question is answered, a line under the list says "Legacy CIS student: Yes" (or No) with "Change", shown while a course it matters for is in the list. "Change" puts the question back. | The owner: the answer can be changed. The design has no place for it. Agent's wording; listed in the pull request. | Reword or move in `src/check.ts`. |
| (2026-11-16, F08) The sequence reminder is not shown for an empty list. The "Doesn't count" filter with nothing to list says "No course in your list is marked “Doesn't count”." | Nothing to be reminded about yet; an empty filtered list needs a word. Agent's wording; listed in the pull request. | Change `reminderFor` in `src/answers.ts`; reword in `src/check.ts`. |
| (2026-11-16, F08) F08 draws no numbers: the summary strip of the design (total credits, credits that count, credits that don't) is built in F09 from the answers. | The total is F09's feature; the strip is one piece. | Build the two counts in F08. |
| (2026-11-16, F09) The two notes about the total use the sentences of the approved design's pace controls: "Below 12 credits: below full-time; may affect scholarships." and "Over 18 credits: may cost extra." They sit under "Total credits" in the summary strip, as plain text. | The sentences contain the brief's words and were approved with the design; the design has no place for a note on this page. | Reword in `src/wording.ts`; move in `summaryHtml` (`src/check.ts`). |
| (2026-11-16, F09) The credits of a course PathCheck doesn't know are changed with a small dropdown in the row, labelled "Credits for <code>", offering the whole numbers 0 to 12, starting at 3. | The owner: it "starts at 3 credits and the student can change it". A dropdown cannot hold a wrong value; 12 leaves room for a large block, so the total is not understated. | Change `MOST_UNKNOWN_CREDITS` in `src/credits.ts`, or use a number field in `src/check.ts`. |
| (2026-11-16, F09) No summary strip and no note for an empty list. | Nothing to add up yet; "below full-time" before any course is typed would be noise. | Draw it always, in `summaryHtml`. |
| (2026-11-16, F09) A row that shows the legacy question or waits for it is in the total and in neither of the two counts; "Waiting for your legacy answer." is shown under both until it is answered. | Counting it either way could be false. Agent's wording; listed in the pull request. | Reword `WAITING_FOR_LEGACY` in `src/wording.ts`. |
| (2026-11-16, F09) 12 and 18 are constants in `src/credits.ts` (`FULL_TIME`, `USUAL_MOST`). | They are the brief's numbers for a full-time load and the usual most, not curriculum data. | — the brief would have to change. |
| (2026-11-16, F10) F10 is not marked passing by its own pull request. The checking and the made-up transcripts are merged with tests, with `passes: false` and a BLOCKED line in `docs/sprints/F10.md`; F11's pull request marks it passing. | Two of its steps are on screen (an invalid row "is shown for the student to fix"; "the localhost upload" uses the made-up PDFs), and that screen is F11. | Build a throwaway screen in F10. |
| (2026-11-16, F10) The shape of a reader's answer: `{ "rows": [ … ] }`, each row with `term`, `transfer`, `prefix`, `number`, `description`, `attempted`, `earned`, `grade`, `points`, and nothing about the student. Fields it does not name are ignored and never copied. | F10 checks this shape and the M2 function (F21) must return it. | Change it only by a recorded decision that updates F10's checks in the same pull request. |
| (2026-11-16, F10) Numbers may arrive as text ("3.00"; since 2026-11-17 also with three decimals, see the F10 row of that date). `attempted` must be from 0 to 30 with at most two decimals; on a transfer row it may be empty, and the row's credits are then 0. | A transcript prints numbers that way; the range is a sanity mark, not a rule of the degree: credits never come from a transcript row. | Change `MOST_ATTEMPTED` or `plainNumber` in `src/reader.ts`. |
| (2026-11-16, F10) A row returned by a reader is thrown away, neither counted nor shown to fix, when it carries "Term GPA", "Transfer Term GPA", "Combined GPA", "Academic Standing" or "Transfer Totals" and is not a course code. | Feature step 7: these lines are never read as courses and never shown. "Transfer Totals" is the made-up PDF's wording; the real wording is to be confirmed on the owner's transcript in F21. | Edit `NOT_COURSES` in `src/reader.ts`. |
| (2026-11-16, F10) The made-up transcripts live in `synthetic/transcripts/`: for each, the reader's answer (`.json`) and a PDF written from it by `scripts/make-synthetic-transcripts.mjs`. The student is "Sample Student", ID 000000000; every page says "SYNTHETIC - not a real transcript". No summer term. | Outside `src/` (which may hold no course code) and outside `tests/` (F11's localhost upload uses them too). The owner has given only the headings "Fall 2023" and "Spr 2024". | Move the folder; add a term once the owner says how a summer term is printed. |
| (2026-11-16, F11) The review step is a new screen, made of the approved design's pieces (course rows, marks, buttons, type, colors). Its layout and words are the agent's. | The brief requires the step (§4 Flow B step 2) and the approved design has no screen for it. The owner was told before it was built; see "Open questions to the owner". | Rebuild it from the owner's design when there is one: `src/left.ts` and the rules at the end of `src/style.css`. |
| (2026-11-16, F11) Every row can be edited (term, prefix, number, credits, grade, transfer credit) and is checked again when saved. Any row can be left out as "Not on my transcript" and put back. No row can be added; a line that is not a row cannot be edited. | A misread can pass the check, and a reader can invent a course: the student must be able to correct the one and refuse the other. Adding rows would be typing a transcript in, which the brief excludes. | Change `src/review.ts` and `src/left.ts`. |
| (2026-11-16, F11) "Continue" is allowed while rows still need fixing. They count nothing, and a line says how many there are. | The cautious direction: nothing unchecked is counted. | Hold "Continue" back in `src/left.ts`. |
| (2026-11-16, F11) The review step says how each row stands by its grade ("Passed", "In progress", "Transfer credit", "Doesn't count — below C") and never that a course counts toward the degree. The legacy question is therefore not asked there. | What counts is the checklist's to say (F13); a row can be passed and still fill nothing. | Say it in the row: `stateLines` in `src/left.ts`, with the placement of F04 and the legacy question of F05. |
| (2026-11-16, F11) At M1 the upload works on a development server only: the chosen PDF is recognised as one of the two made-up transcripts by its length and a plain-code fingerprint (`synthetic/transcripts/manifest.json`), and answered with the rows prepared for it. Any other file is refused with a sentence; nothing is sent. The built site has none of the made-up answers and says "Upload isn't available right now — try again tomorrow". | Feature F10 step 3 and the brief: M1 uses synthetic transcripts only; the paid reader is M2. Plain code, not the browser's cryptography, so it also works from a phone on the local network. | F21 replaces `readFile` in `src/upload.ts`. |
| (2026-11-16, F11) A file over 10 MB is refused before it is read; a file is a PDF when it begins with "%PDF-", whatever its name. A file is taken only when it is dropped on the drop zone; "Browse files" opens the file picker through a file control made at that moment, on Start too. | A transcript is a few pages; a name proves nothing; no page has a field to fill in. | Change `LARGEST_FILE` and `isPdf` in `src/upload.ts`; `browse` in `src/app.ts`. |
| (2026-11-16, F11) F11 is not marked passing by its own pull request: its step 5 ("Continuing uses the reviewed rows, including the student's fixes") shows on screen only in the checklist (F13). After "Continue" the page says how many rows are taken on and how many are left out. F10 is marked passing by this pull request. | An on-screen step cannot pass before its screen exists; F10's on-screen parts are all here. | Build a throwaway result in F11. |
| (2026-11-16, F11) What PathCheck says when a file is not taken at M1 (the agent's words): not one of the two made-up transcripts, "PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent."; not a PDF, "That file is not a PDF. Choose the unofficial transcript PDF from the portal."; over 10 MB, "That file is too large to be a transcript. Nothing from it was read."; a file the browser cannot open (moved away, not downloaded yet), "That file could not be opened. Choose it again." | The student must know why nothing happened and what to do next. The brief gives a sentence only for the reader being unavailable. | Change `REFUSALS` in `src/left.ts`. |
| (2026-11-16, F11) When the reader's answer is no answer at all, the student sees the brief's "Upload isn't available right now — try again tomorrow". | The brief's sentence for a reader that cannot be used (§7); nothing of a broken answer is shown. | Change `takeFile` in `src/app.ts`. |
| (2026-11-16, F11) A second transcript replaces the first only through "Use another transcript", which forgets the rows and the corrections and says so. While a transcript is there, another file is not read, wherever it is chosen or dropped (Start too): the student is taken to the review and told "To use another transcript, choose “Use another transcript” first." | Corrections must not be lost without a word. | Change `takeFile` in `src/app.ts`. |
| (2026-11-16, F11) One row is edited at a time: while an edit is open the other rows offer no "Edit". What is typed stays while another row is left out or put back. Of two files chosen one after the other, the one chosen last is taken. | A second edit, or the page being drawn again, would lose what was typed without a word. | Change `rowHtml` and `setupLeft` in `src/left.ts`. |
| (2026-11-16, F11) A transfer row shows the credits printed on the transcript, and nothing when its credits column is empty (never "0"). | "0 cr" beside "Transfer credit · Passed" reads as no credit earned; the transcript prints no such number. (QA round 1) | Show `row.credits` in `reviewRows` (`src/review.ts`). |
| (2026-11-16, F11) What happens on the transcript page is said to a screen reader in one line that sits beside the page (`#pathcheck-status`), not inside it. | The page is drawn again as a whole after each action; a line created and filled in the same moment is often not read out. | Put the line back in the page: `src/left.ts`. |
| (2026-11-16, F11) `npm run check` (and so CI) ends with `scripts/check-build.mjs`: the built site must hold no fingerprint and no description of the made-up transcripts. | They are for a development server only; a change to how they are loaded could ship them with every test still passing. | Remove the step from `check` in `package.json`. |
| (2026-11-16, F12) Typed courses are placed as *planned*, a third and weakest state: a planned course takes only a place that no passed and no in-progress course holds; among planned courses F08's rules stay (the sequence course wins its pick, the first typed electives take the open places). Without a transcript every typed course is planned. A planned course adds nothing to the credits done or in progress, and the sequence is judged on the transcript only. | One placement for both flows, so they cannot disagree; a course the student only means to take must never push out one they have. | `options.planned` in `placeCourses` (`src/placement.ts`). |
| (2026-11-16, F12) With a transcript, a course that is in no curriculum list (or is CIS 304 / CIS 415) keeps its "Doesn't count" sentence even when the transcript has it passed or in progress: that comes before "You already passed this". | It is true with or without a transcript, and it is what the student most needs to know. | Change the order in `verdicts` (`src/answers.ts`). |
| (2026-11-16, F12) A typed course that has no grade yet on the transcript shows "Already in progress." (the owner's words, 2026-11-16; first built with a sentence of the agent's). | F12's step 5 says it is not shown as counting again; the brief gives no sentence for it. | Change `IN_PROGRESS_AGAIN` in `src/wording.ts`. |
| (2026-11-16, F12) "You already passed this", "This slot is already filled" and the in-progress sentence are drawn as "Doesn't count": the square mark, the tinted row, the "Doesn't count" filter and the "Don't count" number. | None of them adds anything toward the degree; the design shows no transcript state. | Give them their own kind in `src/answers.ts` and `answerCell` (`src/check.ts`). |
| (2026-11-16, F12) "This slot is already filled" is said only when courses of the transcript alone hold the place. When a course of the student's own list holds it (alone or with the transcript's), F08's sentences name the holders. For PSY 251 and a student who is not a legacy student: "This slot is already filled" when the transcript holds its pick, F08's "Legacy students only" when the list does. | The student can act on a course of their own list; the slot sentence gives the real reason. | Change `verdicts` in `src/answers.ts`. |
| (2026-11-16, F12) While the reviewed transcript has rows that still need fixing, no answer is called exact: every "Counts" and the count above the list keep their condition, and the card says how many rows and offers the way back to fix them. The checked rows are still used for "You already passed this", "This slot is already filled" and in progress. A transcript with no row taken on is not used at all. | An unchecked row may be the very course that was typed (priority 1). (Contract review) | Change `onCheck` in `src/app.ts`. |
| (2026-11-16, F12) With a transcript the legacy answer can change a course that is no legacy course (legacy courses on the transcript hold elective places only for a legacy student). When no typed legacy course asks, the first row whose answer depends on it asks, with a line that says why ("Your transcript has FLS 161, which counts only for legacy students."); the others wait. A typed legacy course that is already passed says so and asks nothing. | No verdict is shown before the answer that the answer could change (F05); the student must see why they are asked. | Change `answersFor` in `src/answers.ts`. |
| (2026-11-16, F12) The review step stays one screen, on "See what I have left" (`#/left`), also for a PDF chosen on "Check my courses": its "Continue" then comes back, and says so. A file that is refused there stays on "Check my courses" with its sentence on the card. There is one transcript for the visit, used by both flows. | One review step to build, test and keep truthful. | `returnTo` in `LeftState` (`src/left.ts`); `takeFile` in `src/app.ts`. |
| (2026-11-16, F12) The reminder about HIS 132 / ENG 210 is not shown when the transcript has one of them passed or in progress. | It would remind of a course the student has. | Change `reminderFor` in `src/answers.ts`. |
| (2026-11-16, F12) Words of the agent's on "Check my courses" with a transcript: "Transcript added"; "Your answers use your transcript (<file>)."; "No row of your transcript (<file>) was taken on, so these answers don't use it."; "Your transcript is waiting to be checked." with "Check what was read"; "<m> rows of your transcript still need fixing, so these answers are not exact yet." with "Fix them" / "Fix it"; under "Continue" in the review, "You'll go back to “Check my courses”." | The design has the card and the note only for "no transcript". Listed for the owner in F12's pull request. | Change `TEXT` in `src/check.ts` and `src/left.ts`. |
| (2026-11-16, F13) A requirement is Done when every credit of it is done; otherwise In progress when a course in progress fills a place of it; otherwise Still needed. "Counted" is credits done: a course in progress fills its place but is never counted. | Feature F13 steps 1–2 and the approved design's own numbers (Social sciences 3 / 12 with ECO 251 in progress; Business core "Still needed" with one course done). | `statusOf` in `src/checklist.ts`. |
| (2026-11-16, F13) A grade below C on a still-needed course: "Must be repeated; the D doesn't count." (required course); "<code>: the D doesn't count. It must be repeated, or another course of this pick taken." (a pick); "<code>: the D doesn't count. It must be repeated, or another elective taken." (an elective, on the electives card). A course in progress after such a grade keeps the design's "Repeat; the earlier D doesn't count." W and I are not flagged. A failed legacy-only course is not noted. | Brief §5: flag "must be repeated"; for a pick or an elective another course can fill the place, and saying only "must be repeated" would be untrue. The words are the agent's. | The four sentences in `src/wording.ts`. |
| (2026-11-16, F13) The sequence in Flow B, from the owner's answer of 2026-11-16: with both sequence picks open, the feature's sentence ("Still needed: HIS 132 or ENG 210 to complete a history or literature sequence."); with one pick held by another course, the same sentence for the course whose pick is open ("Still needed: ENG 210 to complete a literature sequence."); with both held, "Needed for the history or literature sequence (3 extra credits): HIS 132 or ENG 210." and, under the credit bar, "Plus 3 extra credits for the history or literature sequence." The ring and bar keep the credits left of the degree's total; the extra credits are said beside them. | The owner: "Flow B shows the same". No single course is typed in Flow B, so both are named. The evaluator judged that the sources decide this; the wording of the Flow B lines is the agent's reading. | `sequence` in `checklistOf` (`src/checklist.ts`); three sentences in `src/wording.ts`. |
| (2026-11-16, F13) The legacy question comes before the result: when the answer would change anything of the checklist, the page shows the question with its reason and nothing of the result until it is answered; then a line with the answer and "Change". One answer for both flows, remembered in the browser. | F05: no verdict before the answer that the answer could change. The credits left can change too, so holding back parts of the page would be fragile. | `resultHtml` in `src/left.ts`. |
| (2026-11-16, F13) Additions to the design on the result: above it, how many rows still need fixing, with "Fix them"; under the requirements, closed until asked for, the passed or in-progress courses that fill nothing, each with its reason; at the end, "Check what was read" (back to the review, corrections kept) beside "Use another transcript". | A shorter checklist must not mislead; a passed course must not vanish; a misread row is often noticed only on the checklist. Brief §8: hidden until asked for. | Remove them in `src/left.ts` and `src/checklist.ts`. |
| (2026-11-16, F13) The courses still to take in a requirement are listed lowest number first; courses done or in progress keep the curriculum's order (electives: passed first, then the transcript's order). The cards are in the curriculum's order. | It is how the approved design lists them; the curriculum file's order within a block is not by number. | Remove the sort in `checklistOf`. |
| (2026-11-16, F13) Of the design's page 3, F13 draws the heading, the ring and credit bar, the requirements and the sequence box. The pace answer and its controls (F14), the draft plan (F16), "Print / save PDF" (F17) and "Clear my data" (F19) are not drawn yet; the place beside the ring is empty until F14. | One feature at a time; credits left is "what's left", not pace. | — they come with their features. |
| (2026-11-16, F13) A sequence course that is in progress while a passed course holds its pick is not listed as "not counted": the sequence box says "In progress: HIS 132 for the history sequence (3 extra credits). It fills the sequence requirement only." and the line under the bar "Plus 3 extra credits in progress for the history sequence." When another sequence already holds its pick, the course really fills nothing and is listed. | The owner's answer of 2026-11-16 ("It fills the sequence requirement only … Flow B shows the same"); a student told it "doesn't count" might drop the course that completes their sequence. (Code review) | `running` in `checklistOf` (`src/checklist.ts`). |
| (2026-11-16, F13) Whether a sequence can still go through its pick is judged the same way in both flows: its course, placed as planned, takes the pick (`wouldTakePick`). For a legacy student PSY 251 can give up the pick for an open elective place; on the checklist that is looked at only when no sequence pick is open otherwise, so PSY 251 alone (holding its pick, the other pick open) asks no legacy question, as the owner said for F08. With PSY 251 in one pick and another course in the other, the answer does change what is left, and the question is asked (brief §5: asked when one of the four courses appears; the agent's reading, listed in the pull request). | The checklist said "extra credits" where "Check my courses" said the course counts. (Code review, rounds 1 and 2) | `wouldTakePick` in `src/placement.ts`. |
| (2026-11-16, F13) The line under the legacy question reads "Your transcript has <code>, which counts as an elective only for legacy students." (was "…which counts only for legacy students."). | PSY 251 counts for everyone in its pick; the brief says these courses count "as electives only for legacy students". The owner approved the earlier wording with F12; this corrects it and is listed in the pull request. | `transcriptHasLegacy` in `src/wording.ts`. |
| (2026-11-16, F13) While a course also has a row that still needs fixing, the checklist does not say it "must be repeated"; while a row to fix has no readable course code, it says so of no course. | The unchecked row may be the attempt that passed, and a row without a code could be any course. (QA rounds 1 and 2) | `unchecked` in `checklistOf`. |
| (2026-11-16, F14) Pace starts with the term after the latest term on the transcript: the latest term with rows in progress, or with none the latest graded term; Spring, then Fall, and Summer between them only while "Summers" is on. Nothing uses today's date. | The owner's rule of 2026-11-16 for the pace line (F15), applied to F14: the brief gives no other starting point, and it gives the approved design's numbers (81 credits after Fall 2026 → Spring 2029, about 16 a term). | `latestTermOf`, `termAfter` in `src/pace.ts`. |
| (2026-11-16, F14) A term is read as a season and a four-digit year: "Fall"; "Spr" or "Spring"; "Sum" or "Summer"; letter case and extra spaces ignored. The transfer section is not looked at. When a term that decides cannot be read (a row in progress; or, with none in progress, any graded row), pace is not estimated and the page says so; the same sentence is shown for a transcript that has only transfer rows, which has no term at all. Rows still to fix are not looked at for the starting term: the note above the result says the pace may change. | How a summer term is printed on the real transcript is not known yet; a term that cannot be read cannot be placed, so it might be the latest. | `readTerm` in `src/pace.ts`. |
| (2026-11-16, F14) On pace means the credits still to take fit into the terms up to the target at "Most credits per term". The fewest changes only the detail line. One range for every term counted, summers included. | The brief's "credit range … say whether the student is on pace"; it names one range, and PathCheck sets no limit of its own. | `paceOf` in `src/pace.ts`. |
| (2026-11-16, F14) The default target is the earliest term reachable at the most credits a term, so the first answer is always "On pace"; the list offers the term before it, the default and the three after it, and the student's own choice. Until the student chooses, the target follows the settings. A summer can be the target only while summers count; switched off, it becomes the Fall after it, and stays that. | It gives the approved design's answer and list for its student. | `paceOf`. |
| (2026-11-16, F14) The credits still to take are the credits left of the checklist plus the extra credits of a sequence course when both sequence picks are held; a sequence course already in progress counts as taken. | The owner, 2026-11-16: the draft plan schedules that course; pace must count what the plan will hold. | `overviewOf` in `src/left.ts`. |
| (2026-11-16, F14) Words of the agent's: "Not on pace for <target>"; "At <n> credits a term you finish <term>, one semester / <k> semesters before / after your target." (after the owner's example for F15); "No credits left to plan"; "Pace can't be estimated: the latest term on your transcript could not be read."; the note above the result ends "The credits left and the pace may change too." while rows need fixing. | The design shows the on-pace answer only. Listed for the owner in F14's pull request. | `TEXT` in `src/pace.ts`. |
| (2026-11-16, F14) The Start demo's pace line is worked out by the pace code for the demo's student (the examples file's courses, in progress in the term named in the demo's own text) instead of being written out. | A written-out answer could drift from what the code says. | `demoPace` in `src/start.ts`. |
| (2026-11-16, F14) The pace settings are kept while the student moves between pages, for the visit; another transcript starts with its own default target and keeps the range, from either page. A changed control reads out its new value, its note and the answer. Changing a control draws only the overview card again. | Brief: no accounts; remembering after a reload is F19. The rest of the page must stay as the student left it. | `LeftState.pace`; `setPace` in `src/left.ts`. |
| (2026-11-16, F15; the wording, the finish and what n holds replaced on 2026-11-16 by the owner's answer to the M1 check, see the rows "F15, after the M1 check") The pace line of "Check my courses" paces by the typed credits that count toward the degree (the "Counts" answers, and a sequence course that is "Needed for the … sequence"), not by every typed credit. When the two differ the line says both: "12 of your 15 credits in [Spring 2027] count toward CIS — at this pace you finish …". When they are the same it reads as the owner's example: "15 credits in [Spring 2027] — at this pace you finish Fall 2029, one semester after your target." | A course that doesn't count, is already passed or in progress, or has its slot filled does not lower the credits still to take: pacing with it would name an earlier finish than the student will get (priorities 1 and 2). The evaluator judged that the sources decide this; listed for the owner in the pull request. | `paceLineFor` in `src/check.ts`. |
| (2026-11-16, F15; replaced on 2026-11-16 by the owner's answer to the M1 check, see the row "F15, after the M1 check") The finish is the term in which the credits still to take run out at that many credits in the chosen term and in every Fall and Spring after it. What is still to take after the chosen term is worked out on the checklist with the typed courses taken, so that a sequence course they make necessary (a typed course filling the last pick a sequence could have gone through: 3 extra credits) is counted and the finish is not named a term too early. Summers are never counted, whatever the Summers switch of "See what I have left" says. The term list has the default term (the owner's rule) and the next three; a later chosen term leaves the terms in between out of the count; a new transcript starts with its own default term. | The owner, 2026-11-16: "Fall/Spring", "Summer terms are skipped", "the default term and the next few after it". Leaving terms out can only make the finish later. | `paceLineOf` in `src/pace.ts`. |
| (2026-11-16, F15; the one target for both flows stays; the comparison with a finish is replaced on 2026-11-16 by the owner's answer to the M1 check, see the rows "F15, after the M1 check": no finish is named) One target semester for both flows, kept for the visit: chosen on either page, it is the target on both; until chosen it is F14's default. A summer target set on the other page is shown here as itself and compared in calendar order (the Spring before it is "one semester before", the Fall after it "one semester after"; further away, Fall and Spring terms with the target summer as one step). An exact hit reads "at this pace you finish in your target semester". | It is the student's one target; reading a summer target as the Fall after it could call a late finish on target. (Contract review) | `paceLineOf`; `target` hook in `src/app.ts`. |
| (2026-11-16, F15) When the legacy answer is not given: if a typed row shows the question, the line says "Answer “Are you a legacy CIS student?” to see your pace."; if no row shows it but the answer would change the credits still to take (a legacy course on the transcript), the question itself stands in the line's place, with its reason. No finish is named before the answer. | F05: no verdict before the answer that the answer could change; the credits left come from the checklist, where the answer matters even when no typed course depends on it. (Contract review) | `paceLineFor`. |
| (2026-11-16, F15; replaced on 2026-11-16 by the owner's answer to the M1 check, see the row "F15, after the M1 check") The line sits under the three numbers, one sentence with two small lists in it and the caveat under it; shown only with a reviewed transcript that is used and at least one course. Other sentences in its place (the agent's words): "None of these credits counts toward CIS, so this list doesn't bring you closer to finishing."; F14's "No credits left to plan" and could-not-be-read sentence. While rows still need fixing the card under the list adds "The pace may change too." A change of the list or of either list of the line reads out what happened and the new line as one message. | Brief §4 Flow A step 5; the design has no place for the line. | `paceLineHtml` in `src/check.ts`; `.pace-line` in `src/style.css`. |
| (2026-11-16, F15, after the M1 check) The pace line of "Check my courses" is the owner's sentence: "<n> of these <m> credits count. To finish by <target>, you need about <x> counting credits a term.", with "That's more than your <Most>-credit limit — consider a later target." after it when x is more than the most credits per term of "See what I have left". No finish date is named. The two lists sit on a line of their own under the sentence, each with its name shown beside it; the caveat stays under them. | The owner's answer to the M1 check, 2026-11-16 (in full under "Owner answers"). | `paceLineOf` in `src/pace.ts`; `lineSentence`, `paceLineHtml` in `src/check.ts`; `.line-lists` in `src/style.css`. |
| (2026-11-16, F15, after the M1 check) x is the credits still to take, this term's counting courses among them, divided by the Fall and Spring terms from the term the courses are for through the target, both counted, rounded up. The credits to take are those of "See what I have left" (with a sequence course's extra credits), and 3 more when a typed course fills the last pick a sequence could have gone through. n is the typed credits that count: the number the page shows above "Count toward CIS". A typed sequence course that is "Needed for the … sequence" is not in n (it fills the sequence requirement only and is never said to count; code review of the change), but its credits are in what is to take. m is all the typed credits. x is the same for every term from this one through the target, so it does not change with how many credits are typed (only when a typed course makes a sequence course necessary); the other reading (what the terms after this one need once this term's courses are taken) is a question to the owner, not built. The sentence is the same when none of them counts ("0 of these 3 credits count. …") and for a 1: the owner's words are not adapted. | The agent's reading of "counting credits left ÷ Fall/Spring semesters left to the target": x stands beside n (what a term needs; what this term has), and is never lower than what the list really leaves to do (evaluator, contract round 1). | `paceLineOf` in `src/pace.ts` (`toTake`, `semesters`). |
| (2026-11-16, F15, after the M1 check) When the target of "See what I have left" is earlier than the term the courses are for, the line takes the term itself as its target and offers no earlier one; the target of "See what I have left" is not changed until the student chooses one here. The list of targets always holds one that needs no more than the most credits a term. | The owner's message does not cover it: no term is left to a target before the term, and "To finish by <a term already gone>" would be false. | `target`, `targets` in `paceLineOf` (`src/pace.ts`). |
| (2026-11-17, F21) The one server piece is a Netlify Function at `POST /api/read-transcript`. The request is the PDF's bytes and nothing else. It takes a PDF of at most 4 MB (the browser's own limit is lowered from 10 MB to the same), sends it once to Gemini with no retry, waits 25 seconds, takes at most 400 rows, and passes on only the nine named fields of a row, each cut to 80 characters. Every failure is one answer, 503 "unavailable". It does not judge rows: `readRows` in the browser is the one judge. | Brief §7. 4 MB: Netlify stops a binary request body at about 4.5 MB. 25 seconds: Netlify stops a function at 60, and the student should get the plain sentence, not a platform's error page. One judge: a second copy of the rules on the server adds no safety (contract review). | `netlify/functions/read-transcript.mts`; `askReader` in `src/upload.ts`. |
| (2026-11-17, F21) The model is `gemini-3.5-flash-lite`, named in one constant, with temperature 0 and at most 16,384 tokens of answer. It replaces `gemini-2.5-flash-lite`, the first choice, which Gemini refused with 404 on the owner's preview. | Google's documentation (read 2026-11-17): "Access to the 2.5 models is limited to users who have actively used them in the past", and for new projects it names 3.5 Flash-Lite. It is the cheapest stable model open to a new project that reads a PDF into a fixed answer shape: $0.30 per million tokens in, $2.50 out; a PDF page is 258 tokens. By those figures a transcript of a few pages costs under one cent, and the most one upload can cost is about 12 cents (1,000 pages in, 16,384 tokens out). Two things in them are not confirmed for this model (code review, round 3): the 258 tokens a page is the documentation's general figure for PDFs, and a model that thinks before it answers is billed for that at the output price; the cap of 16,384 tokens bounds the output either way. What an upload really costs is read from the owner's spend in Google AI Studio after the first uploads, and is measured by the function itself in F22 (the $5 cap). `gemini-3.1-flash-lite` is a little cheaper but is shut down on 2027-05-07. The owner agreed to the change of model and price on 2026-11-17 (see "Owner answers"). The reader check on the made-up transcripts decides whether it reads well enough. | `MODEL`, `MOST_ANSWER_TOKENS` in the function. |
| (2026-11-17, F21) The key is the environment variable `GEMINI_API_KEY`, set by the owner in Netlify with "Contains secret values". Until F22 (the limits) is merged it is set for the Deploy Previews context only: the site's main address has no key and answers "unavailable" without calling Google. The agent never reads or sets it. | Brief §7 and §12; CLAUDE.md (never read or commit secrets). Deploy Previews only: before the limits exist, anyone who finds an address with the key could spend the owner's balance (contract review). The owner's project is Private, so a preview can be opened by others only while the owner has the previews opened for a run of the reader check; during that time, and until F22, the owner's $5 prepaid balance and spend cap at Google are the only stop. | The owner adds the Production context after F22. `process.env.GEMINI_API_KEY` in the function. |
| (2026-11-17, F21) The function log gets one fixed line per failure: "read-transcript: unavailable (<kind>)", where the kind is one of eight fixed words, with Gemini's status number when it refused. A success logs nothing. Nothing of the PDF, of a row, of a file name or of Gemini's words is ever logged, and nothing is stored. | Brief §7 and §9 "Safe". The line is enough to tell a missing key from a refusal or a timeout. | `unavailable` in the function. |
| (2026-11-17, F21) The Netlify project is `pathcheck`, built by Netlify from the GitHub repository (`netlify.toml`), at https://pathcheck.netlify.app. It is **Private**: only the owner, logged in to Netlify, can open it and its Deploy Previews. Publishing is locked by the owner: a merge does not publish; the owner publishes a deploy themselves; Deploy Previews of pull requests are built automatically. The agent runs no deploy command. | The owner's setup and answer of 2026-11-17 ("Owner answers"). The owner's project is Private, which is the safest state before the limits exist (F22): nobody else can reach the function. | The project's settings in Netlify ("Project configuration > General > Visitor access"; "Deploys > Unlock to start auto publishing"). |
| (2026-11-17, F21) While a PDF is being read the page says "Reading your transcript…" where a refusal would stand, and it is read out; a file chosen on Start opens the page of the flow at once. The wording is the agent's, listed for the owner. | On the hosted site reading takes seconds; without it the page shows nothing meanwhile. The owner's design has no such state. | `READING` in `src/wording.ts`; `takeFile` in `src/app.ts`. |
| (2026-11-17, F21) The reader check with the real Gemini is `scripts/reader-check.mjs <address>`, run by hand against a Netlify deploy, never by CI. It sends only the made-up PDFs, uses no key, and accepts only an `https://….netlify.app` address. | CI has no key and must not spend the owner's money; the made-up PDFs must not go anywhere else. | The script. |
| (2026-11-17, F11, after the owner's test on the preview) When a file is chosen or dropped while a transcript is already there, "To use another transcript, choose “Use another transcript” first." is shown under the heading of "See what I have left", and is still read out once. It goes away with the student's next action on the page or when they go to another page; it is not kept and not printed. | The owner, 2026-11-17: "Make the fix so the sentence is shown on the page as well" (see "Owner answers"). Until then only a screen reader was told why the new file was not read. Its place, its look and when it goes away are the agent's choices. | `notice` in `LeftState` (`src/left.ts`); `takeFile`, `onDrop` in `src/app.ts`; `.notice` in `src/style.css`. |
| (2026-11-17, F13, before the owner's own upload) "Synthetic transcript result" is shown over a result only when the transcript is one of the made-up ones in `synthetic/transcripts/`, recognised by its bytes. That is possible on a development server only; on the built site every file is a student's own as far as PathCheck knows, so the label never shows there, also for a made-up PDF uploaded there and whatever the browser's storage says. | The owner, 2026-11-17 (see "Owner answers"). The built site must hold nothing of the made-up transcripts (F10, the build check), so it cannot tell them from other files: that the label is absent there for them too is the agent's reading, listed in the pull request. | `madeUp` in `Upload` (`src/upload.ts`) and `Transcript` (`src/review.ts`); `leftPage` in `src/left.ts`; `resultOf` in `src/remember.ts`. |
| (2026-11-17, F22) Before Gemini is asked, the function checks in this order: Cloudflare's bot check, three uploads a day for the browser, $5 a month. An upload is counted for the day once it passes the bot check, whether Gemini then reads it or not, and also when it is then refused because the month's cap is reached. The browser's day is its device's UTC day; with a wrong clock it gets its new number a day early or late, which the bot check and the cap still bound. The day is a UTC day. The month is Google's billing month, the calendar month in Pacific time (`America/Los_Angeles`), because Google's own cap starts anew then. | Brief §7 "Limits". Counting before Gemini is the simplest rule and costs a student tries only during an outage at Google. A UTC month would start hours before Google's and allow a second $5 inside one of Google's months (contract review). | `readTranscript` in the function; `dayOf`, `monthOf` in `netlify/lib/limits.mts`. |
| (2026-11-17, F22) "Per browser, counted anonymously": the browser makes a random number (16 random bytes) each UTC day, keeps it under `pathcheck.browser`, and sends it with an upload; the function counts the day's uploads under it. No IP address is used, passed on or kept anywhere. A student who clears their data gets a new number: the day's limit is a brake on ordinary use; the bot check and the month's cap are the walls. | Brief §7 ("counted anonymously") and §9 ("No personal data is stored anywhere"). A hashed IP address would be harder to get round but is derived from a person's address. A number that lives one day and links nothing across days is not personal data (contract review). | `browserNumber` in `src/remember.ts`; `countUpload` in `netlify/lib/limits.mts`. It is the third thing PathCheck keeps in a browser (`STORED_KEYS`); "Clear my data" removes it. |
| (2026-11-17, F22) The $5 cap is kept by setting aside, before each call, the most one upload can cost: the model's whole input window (1,048,576 tokens at $0.30 a million) and the most it may write (16,384 tokens at $2.50 a million), 355,533 millionths of a dollar, about 36 cents. An upload is refused when that would take the month over $5. Afterwards what was set aside becomes what the upload did cost by Gemini's own token counts (thinking counted as output); nothing when Gemini refused the request with a 4xx error other than 499 (a cancelled request) or with 500 (Google's billing questions, read 2026-11-17: "If your request fails with a 400 or 500 error, you won't be charged for the tokens used"; of other 5xx errors Google says nothing, so what was set aside stays); and it stays when the cost is not known (no answer in time, no counts, the settling write failing, the function stopped). So PathCheck stops at about $4.64 of real cost at the latest, and its total can run ahead of the real cost but never behind it. | Brief §7: "a hard cap". Gemini refuses an input larger than its window, so the input cannot cost more than what is set aside for it; and a PDF of the largest size Gemini takes (1,000 pages, 560 tokens a page by default for this model family) is about half the window, which leaves some 15 cents of what is set aside for output beyond the 16,384 tokens asked for, should the model's thinking not fall under that limit (Google's pages do not say whether it does). The owner's spend cap and prepaid balance at Google ($5) stay behind it. PathCheck's count starts at zero while Google already counts about $0.04 for November 2026; the margin covers it. | `RESERVED` in the function; `reserve`, `settle`, `costOf`, `PRICE_IN`, `PRICE_OUT`, `INPUT_WINDOW` in `netlify/lib/limits.mts` (the prices are the price list's of 2026-11-17 and must follow it). |
| (2026-11-17, F22) The counters are kept in Netlify Blobs: one site-wide store, `pathcheck-limits`, read with strong consistency and written only with conditional writes, so that two uploads at once cannot both take the last place; a write that keeps losing is given up after four tries and the upload is refused. If the store cannot be used, nothing is read (it fails closed). Kept are two kinds of entries, whole numbers only: `day/<UTC day>/<browser number>` and `month/<month>`; the counts of earlier days are deleted with a new day's first upload. Previews and the published site share the store: they spend from the same balance. | Brief §7 "Hosting": Netlify Blobs if the free plan covers it. It is included in the Free plan; its use is not in the plan's credit table at all (read 2026-11-17), and the plan never charges. `@netlify/blobs` is the project's first package that runs on the server. | `blobCounters` in the function; `package.json`. |
| (2026-11-17, F22) The bot check is Cloudflare Turnstile. The page loads Cloudflare's script only when a file is chosen, draws the widget for the action `upload` (out of sight unless a box must be ticked) and sends the token with the PDF; the function has Cloudflare confirm it, passing on no address of the visitor, and on the published site also requires the action `upload` and the site's own hostname. The owner's keys are `VITE_TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (a secret), set for Production only. On a Deploy Preview, whose hostname no widget can be made for, Cloudflare's published test keys stand in when no key is set, and only there: a preview has no real bot check and is protected by being Private and by the month's cap. The day's count does not hold back a script, which can send a new browser number with every request; abuse of a preview while the owner has the project opened would use up the month for the published site too, since both count the same month. On the published site a missing key means every upload is refused. | Brief §7. Turnstile takes no wildcard hostnames and a preview has its own for every pull request (Cloudflare's documentation, read 2026-11-17). Listed for the owner. | `botCheck`, `TEST_SECRET` in the function; `src/turnstile.ts`. The widget's place is one element beside the page (`pathcheck-check`), at the bottom of the window, so that drawing the page again or opening another page does not lose it. When Cloudflare wants its box ticked the page says "One more step: tick the box at the bottom of the window." where it said that it is reading, reads it out and puts the keyboard there (the agent's wording, listed for the owner). The hostname the check must name is the site's main address as Netlify gives it: F24's staging address is that address, not a branch deploy. |
| (2026-11-17, F23) One sentence, the brief's, for every reason a transcript cannot be read that is not the student's: "Upload isn’t available right now — try again tomorrow". That is an outage (the reader unreachable, slow, answering an error or no answer), a limit (the day's three uploads, the month's cap) and a bot check that does not pass or cannot run (also when the student's own browser blocks Cloudflare's script). A file that is the student's to fix keeps its own sentence (not a PDF; too large). | The feature's step and brief §4 give one sentence for an outage and for a limit; the bot check standing in the way is treated as one of them, and PathCheck cannot tell a blocked script from Cloudflare being down. Listed for the owner: "tomorrow" is also said when the cause may pass sooner, or will not pass for that student. | `REFUSALS.unavailable` in `src/left.ts`; `askReader` in `src/upload.ts`. |
| (2026-11-17, F23) A reason a file was not taken stands on the page the student is on when it comes (under the upload control of "See what I have left", under the transcript card of "Check my courses") and is read out once; the student is not moved, except from Start, which has no place for it. The keyboard goes to that page's upload control unless, on "Check my courses", it is in something the student is filling in: the course field (it stays, with what was typed) or the credits list of a course PathCheck doesn't know (it is put back on that list after the page's list is drawn again). The reason goes when the next file is chosen, with "Clear my data", and when the student goes to another page, on both pages alike. (Until now a refusal took the student to "See what I have left" unless they were still on "Check my courses", and stayed on "See what I have left" across pages.) | Reading takes seconds on the hosted site and the student may have moved on. For a refusal nothing waits on another page, moving the student undoes their own choice, and taking the keyboard would lose what they are typing (contract review, round 2). | `takeFile`, `onHashChange` in `src/app.ts`. |
| (2026-11-17, F10) A figure of a transcript row may be printed with up to three decimals ("3.000"), where it was two. `attempted` is still from 0 to 30 and a whole number of hundredths, so "3.000" is 3 credits and "3.125" is a row to fix. | The owner's own transcript prints its figures with three decimals, and every row asked to be fixed for "the credits, the earned credits, the points" (the M2 check, F24 step 6). The range is a sanity mark, not a rule of the degree: credits never come from a transcript row. | `plainNumber` in `src/reader.ts`. |
| (2026-11-16, F16) The curriculum file names the course of the final semester (`finalSemesterCourse`: MGT-462). The loader checks that it is a required course; a program whose file has no such line has no final-semester rule. No course code is written in the code. | The brief, §4 Flow B step 5: "MGT 462 Business Policies in the final semester". Approved by the owner on 2026-11-16 (see "Owner answers"). | The line in `docs/curriculum/provisional-current.json`; `finalSemester` in `src/curriculum.ts`. |
| (2026-11-16, F16) The draft plan holds exactly what the checklist says is still to take: each still-needed required course, one entry for each open place of a pick, one for each open elective place, and the sequence course when both sequence picks are held (the owner, 2026-11-16). When the checklist says a sequence course is still needed but no open pick takes it (a legacy student's legacy course holds its pick and would move to an open elective place), one elective place is planned as that course ("HIS 132, for the history sequence"), so the plan never leaves out what the checklist names. Its credits are the credits still to take that pace uses. A course that is passed or in progress is never in it. | Brief §4 Flow B step 5; F16 steps 1 and 2; the owner's answer on the sequence. | `planEntries` in `src/plan.ts`. |
| (2026-11-16, F16) Order: by the hundred of the course number, lowest first, and within a level the curriculum's order. An open pick has the level of its lowest course; an open elective the highest level of the elective rule; the extra sequence course the level of its lower course. The final-semester course is the last entry of the last semester. This puts the 100-level open picks in the first semester, where the screenshot has 200-level courses. | The brief: "ordered by course level 100 → 400". Layout of a draft labelled "Order not checked", not an academic rule. Approved by the owner on 2026-11-16. | The sort in `planEntries` (`src/plan.ts`). |
| (2026-11-16, F16) Semesters follow the pace settings (the same range and Summers switch). Each aims at the credits still to place ÷ the semesters left to the end the pace answer implies, within the fewest and the most; it takes the entries that may go there in order, passing over one that does not fit for the next that does. A semester is over the most only for a single course bigger than the most; under the fewest only when it is the last or nothing that may go there still fits; a semester with no entry is not drawn. The final-semester course goes into the last semester when it fits, else into one of its own. | The simplest rule that gives the design's 18, 18, 15, 15, 15 and keeps "each semester within the credit range" (F16 step 2) when courses cannot be split. | `layOut` in `src/plan.ts`. |
| (2026-11-16, F16) When the plan ends later than the pace answer beside the ring implies, a line under the plan says so and why: "This draft ends in <term>, later than the pace estimate above: courses can’t be split across semesters." or "…: you moved courses later." (the agent's words); the second only when the plan without the moves would end earlier. | The pace answer counts credits only; the plan must not silently contradict it (evaluator, contract round 1). | `late` in `layOut`; `TEXT.late` in `src/plan.ts`; `.plan-late` in `src/style.css`. |
| (2026-11-16, F16) "Move later" keeps the entry's earliest term (the term after the one it is in); pressed again, one further. The others flow again under the same rules. From the last semester it opens a new one and the final-semester course goes with the end; moving the final-semester course puts it alone, one term after the last. After a change of the pace settings a move still means its term (Summers off: no earlier than the Fall after its summer). The moves are kept for the visit and forgotten with the transcript. An open choice is its own place; a button's name for a screen reader starts with its visible words and counts entries that read the same ("Move later: MGT 321"; "Move later: CIS elective, 2 of 3"). | F16 step 4: "moves it to a later semester and the plan re-flows". Nothing is checked: the student moves what the portal blocks. | `moveLater` in `src/plan.ts`; `LeftState.moves` in `src/left.ts`. |
| (2026-11-16, F16) The first open pick, in the curriculum's order, through which a sequence can still be completed names that course: "Humanities pick (ENG 210 or another)". A pick with three or fewer courses left lists them. The extra sequence entry reads "HIS 132 or ENG 210, for the history or literature sequence" (the agent's words). | The design shows the Humanities pick naming ENG 210; Humanities comes before Social sciences in the curriculum file. | `TEXT` and `planEntries` in `src/plan.ts`. |
| (2026-11-16, F16) No plan section when nothing is left to take, when the latest term of the transcript cannot be read, before the legacy answer, or with no row taken on. With rows still to fix the note above the result ends "The credits left, the pace and the draft plan may change too." | The plan is built on the same rows and the same estimate as pace (F13, F14). | `planOf` in `src/plan.ts`; `resultHtml` in `src/left.ts`. |
| (2026-11-16, F17) The printed summary is the result page itself on paper: "Print / save PDF for your advisor" opens the browser's own print window. PathCheck makes no file and sends nothing. The button is there whenever the full result is, and not drawn in a browser that has no print. | Brief §4 Flow B step 6; DESIGN.md "Print" describes this page printed. One source, so the paper never says something else than the screen. | `printActionsHtml` in `src/print.ts`; the `[data-print]` handler in `src/left.ts`; `print` in `src/app.ts`. |
| (2026-11-16, F17) Two lines are on paper only. At the top: "PathCheck summary — <program>, <institution>" (the agent's words; both from the curriculum file) and "Not an official degree audit. Not affiliated with Alabama State University. Curriculum last reviewed: Nov 2026" (the footer's sentences). In the place of the pace controls: "Target semester: … Fewest credits per term: … Most credits per term: … Summers: …" (the controls' own labels and values). | An advisor reads the top first, and the line names the university, so it says at once that the paper is not the university's (evaluator, contract round 1). The controls are not printed and the plan depends on their settings. The design has no place for either. | `printHeadHtml` in `src/print.ts`; the last line of `paceControlsHtml` in `src/pace.ts`; `.print-only` in `src/style.css`. |
| (2026-11-16, F17) Not on paper: the top bar, "All / Not done", "Show courses", "Move later", the pace controls, "Change", "Fix it", "Check what was read", "Use another transcript", the print button, the "Report a mistake" link, and the plan's line that speaks of "Move later". On paper every requirement is open and none is filtered away; the page is put back afterwards. | F17 step 3: "no app controls". A link does nothing on paper (F18 owns "Report a mistake" on the screen). DESIGN.md: "every requirement prints opened". | The hiding rule in the last `@media print` block of `src/style.css`; `openForPaper` in `src/print.ts`. |
| (2026-11-16, F17) "Everything opened" rests on no single signal from the browser: the button prepares the page before its own print call; the browser's own Print is heard through `beforeprint` / `afterprint` and the print media query; the stylesheet's print rules show a filtered card and (where supported) the inside of a closed requirement. The page is put back once, when the browser says printing has ended or when the page is next drawn (never when the print call returns: on some phones it returns before the paper is laid out), with the requirements shown as the filter stands then. While printing the tab is named "PathCheck summary", which "Save as PDF" suggests as the file's name. | Some browsers do not give the print events on every path; a paper without part of the checklist would mislead (evaluator, contract round 1). | `forPaper` / `fromPaper` in `src/app.ts`; the print rules in `src/style.css`. |
| (2026-11-16, F18) "Not an official degree audit." and "Curriculum last reviewed: <month year>" stay where the owner's design has them (the top bar and the footer of every page; on paper also at the top). F18 builds nothing for them and proves them for every result. | F18 step 1: "Every result … shows" them; every page does. | Nothing to undo; `tests/trust.test.ts` "carries the two lines on every result". |
| (2026-11-16, F18) "Report a mistake" opens the student's own mail app with a message already written: the page's subject, "What looks wrong?", and what the page showed when the link was used. On "Check my courses": whether a transcript is in use (and that the answers are not exact while rows still need fixing), the legacy answer when given, each course with its answer in the page's words, and the pace line with its caveat. On "See what I have left": the note about rows that still need fixing, the credits, the pace answer with its caveat and its settings, each requirement's status and credits, the sequence sentence, the line under a plan that ends late, the legacy answer when given. Always: the program and the review date. Never: a file name, a transcript row, a grade. PathCheck sends nothing. A long list of courses is cut from its end so that the whole link is at most 1,900 characters, and says how many were left out. The link is filled in as soon as it is pressed or reached, not only when it is followed. The plan's semesters are not written in. | Brief §4: "an email link to the owner's contact address, pre-filled with the course or result". The words are the result's own, from the code that draws the page (evaluator, contract rounds 1 and 2). | `src/report.ts`; `checkShown` in `src/check.ts`; `leftShown` in `src/left.ts`; `reportLink` in `src/shell.ts`; the click handler in `src/app.ts`. |
| (2026-11-16, F18) The contact address stays the placeholder `report@pathcheck.example` at M1. | Brief §12: the owner gives the address before M3; F26 checks the real one. `.example` reaches no one. | `REPORT_ADDRESS` in `src/wording.ts` (one place). |
| (2026-11-16, F18) The banner: when the curriculum's last review is more than 12 months before today, every page (Start included) and the printed summary start with "The curriculum PathCheck uses was last reviewed in <month year>, more than 12 months ago. Requirements may have changed since: check your portal before you rely on this." (the agent's words). "More than 12 months": today is after the same day of the month twelve months later (2026-11-15 → from 2027-11-16), or after that month's last day when it has no such day. "Today" is the day on the student's device. No banner without a review date or with one in the future. | Brief §4: "A banner if the curriculum hasn't been reviewed in 12 months"; the owner, 2026-11-16: "The 12-month banner works as written." A student should know before checking a course, not only after. | `reviewIsOld` and `oldReviewBanner` in `src/shell.ts`; `renderPage` in `src/app.ts`; `.old-review` in `src/style.css`. |
| (2026-11-16, F18) The banner is the only thing in PathCheck that reads today's date. It is a note with a name ("Curriculum may be out of date"), read first, not a live region. | The owner, 2026-11-16: "Nothing is derived from today's date" (for the heading and the term of "Check my courses"); the brief requires the banner (evaluator, contract round 1). | `today` in `renderPage` and `AppWindow` (`src/app.ts`); `tests/trust.test.ts` "changes nothing else with the day". |
| (2026-11-16, F19) "The last result" is kept in the browser as what the result needs of the reviewed rows (for each row the course, its printed title, the term, the credits, whether it is transfer credit; which rows were left out), with the pace settings and the courses moved in the plan; the list of "Check my courses" with the credits given to unknown courses and the term of its pace line; the legacy answer (as since F05). One entry, `pathcheck.visit`, with a version, beside `pathcheck.legacy`. Never kept: the PDF, the file's name ("your transcript" is shown in its place), totals lines (GPA, standing), credits earned, quality points, unsaved edits, opened cards, the filter, the day. A first review that was not continued is not kept; the last result stays kept while the student is back in "Check what was read". | Brief §4 "Remembering": "The last result is kept only in the student's browser (localStorage)"; §7: no personal data is stored anywhere. The result is drawn again by the same code, so it cannot differ from a fresh one. | `src/remember.ts`; `keep` in `src/app.ts`. |
| (2026-11-16, F19) No passing letter grade is kept: a passing grade is kept as "Passed"; after a return "Check what was read" shows such a row without a letter (it says "Passed"; opened for editing, its grade reads "Passed"). A course in progress is kept as in progress; a grade that does not count as it is (the result says it: "Repeat; the earlier D doesn't count."); a row that still needs fixing as it was read, its grade included, until it is fixed, left out or cleared (left out, it keeps no grade and is a row to fix again when put back). A kept row to fix carries what was wrong with it (`fix`), and what PathCheck reads back never lets such a row count until the student corrects it, whatever its kept fields read as. | The result never shows a passing letter, so keeping one would keep the transcript, not the result, and "Only your result stays in this browser" would stop being true; on a shared computer the next person finds no grade the result does not say (evaluator, contract rounds 1 and 2). No source allows more. | `keptRows` in `src/remember.ts`; `KEPT_AS_PASSED` and `passed` in `src/transcript.ts`. |
| (2026-11-16, F19) "Passed" is read as a pass only from what PathCheck itself kept (`readRows(…, kept)`); in a freshly read transcript it is not a grade and the row is one to fix, as before. No rule about such a grade is made. | Never invent an academic rule; the reader function's output stays untrusted (brief §7). | `kept` in `readRows` (`src/reader.ts`) and `openTranscript` (`src/review.ts`). |
| (2026-11-16, F19) What is read back is not trusted: the rows go through the reader's checks again, a code through the same door as a typed one, settings out of range fall back to the usual ones, a move is kept only for an entry of the result's own plan, and what cannot be read is thrown away and removed from the browser. Without usable storage nothing is remembered and nothing fails. | Anything in the browser's storage can be changed by hand or by another version (evaluator, contract round 1). | `readKept`, `loadKept`, `storeKept` in `src/remember.ts`. |
| (2026-11-16, F19) "Clear my data" is the design's secondary button beside the print button at the end of the result; also at the end of "Check my courses" and on "See what I have left" before a result, whenever something of the student's is there or kept. It asks no confirmation, removes everything PathCheck stored (the legacy answer included) and what is on the pages, and says "Your data was cleared from this browser." With it: "This result stays in this browser until you clear it." / "This list stays in this browser until you clear it." (the agent's words), not shown where the browser keeps nothing. | Brief §4: "with a visible "Clear my data" button"; F19 step 2. A student who used only "Check my courses" has data too. The result comes back by choosing the PDF again; corrections are lost with it. | `clearData` in `src/app.ts`; `clearRowHtml` in `src/remember.ts`; `clearSlot` in `src/check.ts`. |
| (2026-11-16, F20) On "Check my courses", the row of a course just added is brought into view when it is not wholly on the screen (on a phone the three numbers appear above the field with the first course and push the list down). A row already in view does not move. | F20 step 2: a first-time student has the answer for one course within 10 seconds; at 375 the first answer was below the fold (found by the walk-through). | `showRow` in `src/check.ts`. |
| (2026-11-16, F20) Two commands for the owner's M1 check: `npm run dev:lan` (the development server reachable from a phone on the same network, for the check only) and `npm run preview` (the built site, where every file is answered "Upload isn't available right now — try again tomorrow"). | M1 is checked "on phone and desktop", and a phone cannot open localhost (evaluator, contract round 1). The development server's file rules are unchanged. | The two lines in `package.json`. |
| (2026-11-16, F20) Room between the legacy answer and "Change", so that the focus ring of "Change" no longer touches "Yes". | A flaw noted in F15 for the M1 polish. | `.legacy-line .text-link` in `src/style.css`. |

## Owner answers

These refine the brief. Where a dated answer here differs from the brief, the answer wins. `features.json` and the curriculum
data follow them.

### 2026-11-15 — answers on PR #1

1. **Titles and credits** (ASU 2025–2027 undergraduate catalog, alasu.smartcatalogiq.com), all 3 credits:
   FIN 201 Personal Finance; FLS 161 Spanish I; MGT 203 Special Topics: Business Communications;
   MGT 220 Systems Approach to Business. → curriculum data.
2. **Rule-matched electives without a transcript** (e.g. MKT 410): show "Counts toward CIS:
   elective (300/400-level MKT)", no title, 3 credits added to the total. → F08, F09.
3. **Two typed courses for the same "pick one" slot without a transcript** (e.g. ENG 131 +
   ENG 140): the first counts; the second shows "Doesn't count — it fills the same
   requirement as ENG 131." With a test. → F08.
4. **Grades:** letters only (A, B, C, D, F); no plus/minus; no P/S/CR grades exist. C or
   better counts; D and F don't. → F03, curriculum data.
5. **Sequence rule (confirmed):** the student must complete a history sequence (HIS 131 +
   HIS 132) or a literature sequence (ENG 209 + ENG 210) inside the 42 core hours
   (Orientation 1 + Composition 6 + Humanities 12 + Social sciences 12 + Science & math 11).
   HIS 132 fills the Social sciences pick; ENG 210 fills the Humanities pick; the sequence
   adds no credits.
   - If neither HIS 132 nor ENG 210 is completed or planned, show "Still needed: HIS 132 or
     ENG 210 to complete a history or literature sequence." → F13.
   - In Flow A without a transcript, if neither is among the typed courses, add one line:
     "Remember: you need HIS 132 or ENG 210 for the history/literature sequence." → F08.
   - A test checks that the core blocks total 42 hours.
   - The sequence item is removed from the M0 confirmation list. → F01, milestones.

**Transcript format** (from the owner's real unofficial transcript; synthetic fixtures copy
this layout only, never real data) → F10:

- Term headings like "Fall 2023", "Spr 2024" (abbreviated).
- Course rows: prefix, number, description, attempted, earned, grade, points. Labs use
  their own prefix (BIOL 127).
- Descriptions are abbreviated and differ from catalog titles (ORI 100 = "First Year
  Experience", CIS 206 = "Bus Programming Languages"): match by prefix + number only,
  never by title.
- Each term has Term GPA / Transfer Term GPA / Combined GPA totals and an "Academic
  Standing" line: ignore them.
- Transfer credit has separate transfer totals; transfer rows use ASU course codes.

**Decisions on the setup PR:**

- The reader test sits in F21 (M2); at M1, F10 uses synthetic reader output without Gemini: confirmed.
- The `milestone` field in `features.json`: fine. F07, F12, F19 wording: fine.
- F13: "Blocks that are Still needed or In progress show the remaining courses directly;
  Done blocks are collapsed and can be opened." What's left is priority 2 and must be visible.
- Guard: close the three remaining gaps (wildcard secret-file spellings, printing a single
  named environment variable, a bare `git push` while on `main`), with tests, in a small
  follow-up PR.
- `npm audit` (7 moderate, development-only lint tooling): left as is.

**Confirmed by the owner (2026-11-15):** in Flow A without a transcript, a rule-matched
elective shows "Counts toward CIS: elective (300/400-level MKT) — unless you've already
passed it or filled this slot".

**Where these answers differ from the brief:** §5 and §10 (the sequence rule is no longer
an M0 item); §8 "everything else stays hidden until asked for" (F13: remaining courses of
Still needed / In progress blocks are shown directly); §4 Flow A (a rule-matched elective
has no title).

### 2026-11-15 — M0 mockups

> **Superseded later the same day** by "The owner's own design replaces the three directions"
> below. The three directions, the Apple / Liquid Glass instruction and the lifting of the
> "frosted glass" ban no longer apply. What still stands from this entry: F01 does not pass
> and is not merged until the owner approves; the wording and content rules that come from
> `docs/M0-DESIGN-BRIEF.md` "The 3 pages".

- F01 does not pass, and its PR is not merged, until the owner approves a design for PathCheck.
  The evaluator's PASS is not enough on its own.
- The owner approved none of the first three designs (Worksheet, Credit map, Plain answers).
- New round: three directions built to `docs/M0-DESIGN-BRIEF.md` (the owner's brief, copied as
  written), with Apple's interface guidance applied, including Liquid Glass. Where that brief
  differs from `docs/BRIEF.md`, it wins:
  - "Frosted glass" comes off the banned list in brief §8. The rest of the list stays.
  - M0 now covers three pages (Start, "Check my courses" result, "See what I have left"
    result), not two.
  - No-transcript answer for a curriculum course: "Counts toward CIS — <block>" with
    "unless you've already passed it or filled this slot" as a second line. The elective
    sentence stays "Counts toward CIS: elective (300/400-level MKT)" with the same second line.
  - A course outside the curriculum is shown with its credits (BIO 230, 3 cr) and is included
    in the credit total.
  - A block with courses in progress and courses missing reads "In progress" (Social
    sciences, Humanities, Pre-professional in the brief's example).
  - Do not merge or move ahead with the design until the owner approves.

### 2026-11-15 — The owner's own design replaces the three directions

The owner designed PathCheck in Figma Make and published it at
https://color-nicks-25285809.figma.site/ (view "Combined · Your picks"; the hash
`#d=d&p=<start|check|left>&t=<light|dark>&w=<desktop|phone>` selects page, theme and width).

- **This design is the chosen direction.** It overrides F01's "3 mockups, owner picks one".
  The three directions built to `docs/M0-DESIGN-BRIEF.md` (Receipt, Meter, Signs) are deleted
  completely. Only "Combined · Your picks" is used; Route, Focus and Workspace on the same
  site are ignored. "Rationale & questions" is read for the owner's reasoning and is not
  built as a page.
- Because of this decision, F01's description and steps and the M0 milestone text in
  `features.json` (and the M0 line in `CLAUDE.md`) were rewritten. This is the owner
  approval that `features.json` requires for such a change.
- **Visual reference from now on:** the screenshots in `docs/design/screens/` (each page,
  light and dark, desktop 1440 and phone 375), taken from the published site.
  `docs/design/DESIGN.md` is written from the site's computed styles and is the design source
  for M1.
- **Design choices the owner has already made** (the owner: "these override brief §8 where
  they differ"):
  - Cards around the two choices and around the results are kept.
  - The pill badge "Before registration. Before you pay." is kept.
  - The upload icon in a circle is kept.
  - The small uppercase section labels ("FOR NEXT SEMESTER", etc.) are kept.
  - The owner: the evaluator must not mark these as generic or FAIL; they are added to its
    Calibration section as owner-approved.
- **What stays from the brief where the design doesn't show it or gets it wrong:** all colors
  as CSS tokens with light and dark mode; WCAG AA contrast; works at 375px with nothing
  hidden or overlapping; visible keyboard focus; on every result "Curriculum last reviewed:
  <date>", "Not an official degree audit", "Report a mistake", "Not affiliated with Alabama
  State University"; the exact wording of brief §4 and §5.
- **The design is not changed silently.** Anything else in it that conflicts with the brief
  is listed in the PR under "Conflicts with the brief" and the owner is asked: anything in
  §6 "Not built", any text that says a course counts when it may not, any academic rule
  shown differently from §5, any wording that says "ask your advisor". No academic rule is
  invented to fit a screen.
- **Rebuilt in plain project code.** Figma Make's component libraries, toasts and icon packs
  are not copied into the project.
- **M0 ends when the owner approves** the mockups built from this design. PR #4 is not
  merged before that.
- *Agent's note, not an owner decision:* the first copy of this message also said to replace
  the "Your major" dropdown with plain text. The owner re-sent the message without that
  line, so the dropdown is kept as designed and listed under "Conflicts with the brief"
  (brief §3: CIS only, no multi-major UI; §4: nothing to fill in first).
- *Agent's note:* the instruction to apply Apple's interface guidance and Liquid Glass
  belonged to the replaced directions. The owner's design uses no glass, and it is followed
  as it is.

### 2026-11-15 — Answers to the nine conflicts on PR #4

The owner's design had nine conflicts with the brief (PR #4, a–i). These are the answers.
They are applied to the mockups and to `docs/design/DESIGN.md`.

- **a. "Your major" dropdown: keep it.** Other majors will be added later.
  - "B.S. Computer Information Systems" is pre-selected, so nothing has to be filled in
    before the two choices.
  - It has only that one option. No "coming soon" or disabled majors.
  - This overrides brief §3 and §4 for this control only. It is not "what-if for other
    majors" (§6). Nothing else multi-major is built. → F06.
- **b. The count at the top of page 2 carries the condition.** Without a transcript: "12
  count toward CIS — unless you've already passed them or filled their slots". With a
  transcript the condition is dropped, because the answer is exact. This is priority 1:
  never say "counts" without a condition when it may not. → F09, F12.
- **c. No third answer.** A course not in the curriculum doesn't count. "Can't confirm —
  this course isn't in PathCheck yet" is removed; the only answer is "Doesn't count toward
  CIS — not in the CIS curriculum". The filter says "Doesn't count". → F08.
- **d. Requirements follow the PR #1 decision, not the design.** In progress and Still
  needed requirements show their remaining courses straight away. Done requirements are
  collapsed and can be opened with "Show courses". → F13.
- **e. Credits per term: two controls, "Fewest" and "Most"**, defaulting to 12 and 18, both
  editable. → F14.
  - Going above 18 is allowed, with the neutral note "may cost extra".
  - Under 12 shows "below full-time; may affect scholarships".
  - PathCheck sets no hard limit. The portal enforces the real one.
- **f. The other brief §8 patterns:**
  - f1. Uppercase grey table header (page 2, desktop): removed. Normal-case text.
  - f2. Legend under the credit bar (page 3): removed. The bar's segments are labelled
    directly.
  - f3. Pill-shaped tabs (the top links; "All / Not done"): kept.
  - f4. Indigo main button: kept.
  - f5. Numbered chips: "01" and "02" on the Start choices and "1 / 2 / 3" under "See it
    work" are kept.
- **g. "Counts" and "Done" get different marks.** "Done" keeps the filled green tick.
  "Counts" gets its own mark (an outlined tick), so a conditional answer never looks as
  certain as a finished requirement. The five statuses (Counts, Doesn't count, Done, In
  progress, Still needed) stay visually distinct, and every mark has its text label.
- **h. 12 is correct, everywhere.** The "15" in the owner's earlier design brief was a mistake.
- **i. The privacy sentence is replaced** with "Your PDF is read, then deleted. Only your
  result stays in this browser." It is shown before the first upload, next to the upload
  control. → F11, F19.

*Agent's notes, not owner decisions:*
- The "→ F06" style pointers above are the agent's cross-references to `features.json`.
- Where these answers differ from the brief: §3 and §4 (the major dropdown, a); §8 banned
  list (pill-shaped tabs, the indigo main button and the numbered chips are approved,
  f3–f5, with the four choices approved earlier the same day). The uppercase grey table
  header and legends stay banned (f1, f2).
- `features.json` said "there is no multi-major UI" (F02) and "There is no sign-in, account,
  advisor screen or major picker" (F06), which answer a contradicts. The owner approved new
  wording for both the same day (next entry).
- The two credit controls never cross (pushing one past the other takes it along) and
  neither goes below 1 credit. That is how the control behaves, not an academic rule.
- The owner wrote the major as "B.S. Computer Information Systems"; the published design
  had "B.S. - Computer Information Systems". The mockups use the owner's wording.
- The owner's brief names no courses for the three Done requirements. So that "Show
  courses" has something to show, the synthetic student is given ORI 100; ENG 131 and
  ENG 132; BIO 127, BIOL 127, BIO 128, BIOL 128 and MAT 137 (titles and credits from the
  curriculum file).
- `docs/design/screens/` now holds screenshots of the updated mockups, re-taken as the
  owner asked. The screenshots of the published site as it stood before these answers are
  kept beside them in `docs/design/screens/published/`.

### 2026-11-15 — F02 and F06 wording approved; footer and requirement toggles

- **Approved: reword two feature steps** so they agree with answer a (the major dropdown).
  The owner's final wording, now in `features.json`:
  - F02: "the only major shown is B.S. Computer Information Systems. The dropdown has no
    other options (no 'coming soon' or disabled majors)."
  - F06: "There is no sign-in, account or advisor screen. The major dropdown has one option,
    B.S. Computer Information Systems, already selected, and no other options (no 'coming
    soon' or disabled majors)."
- **Footer.** "Not affiliated with Alabama State University" sits at the bottom right, at
  the same height as "Not an official degree audit.", "Curriculum last reviewed: Nov 2026"
  and "Report a mistake".
- **Requirements.** In progress and Still needed requirements also have the "Show courses" /
  "Hide courses" toggle, just as Done ones do.
- **PR #4** gets a descriptive title, and its description is about adding the design the
  owner agreed on, which the application's UI will be built upon.
- PR #4 is not merged. The work stops at M0 for the owner's check.

*Agent's notes, not owner decisions:*
- In progress and Still needed requirements start open, so their courses still show
  straight away (answer d); the toggle lets the student hide them. Done ones start closed.
- When the footer line gets narrow, the three items on the left wrap first and "Not
  affiliated with Alabama State University" stays at the right, level with the first of
  them. Only under about 630px wide (a phone) is there no room beside them; there it drops
  below the other three, at the left.

### 2026-11-15 — M0 approved; GitHub milestones

- **The owner approved PR #4** ("I approve Pr 4"). This is the M0 check: the design in
  `docs/design/` and the mockups are approved. F01 is marked passing and PR #4 is merged.
- **GitHub milestones.** The owner created four: "M0: Design", "M1: Working prototype", "M2:
  Transcript upload", "M3: Public launch". Each PR is attached to its milestone when it is
  opened. The owner closes a milestone themselves, once the agent has given proof that it is
  ready to be closed. `features.json` stays the source of truth.

### 2026-11-16 — M1 started

- The owner closed the GitHub milestone "M0: Design" and said: "Start implementing M1".
- M1 features (F02–F20) are built one per branch and pull request, each attached to the
  GitHub milestone "M1: Working prototype". As brief §11 says, the agent merges its own
  pull request when CI is green and the reviewer finds no blocker, and stops at the end of
  M1 for the owner's check.

### 2026-11-16 — Transfer, AP and CLEP rows (F03)

**Rule: ignore the grade column on transfer, AP and CLEP rows.** ASU only records transfer
credit after the student earned a C or better (Undergraduate Catalog), and records AP and
CLEP as transfer credit (Prior Learning Assessment Policy). So a row in the transcript's
transfer-credit section under an ASU course code has already passed the grade check.

- Such a row counts, whatever the grade column shows (blank, T, TR, a letter or anything
  else). → F03.
- It is then placed like any passed course: no double counting, the elective rule, the
  legacy question. If its code isn't in the curriculum and doesn't match the elective rule,
  it doesn't count. → F04, F05.
- In the review step these rows are labelled "Transfer credit", so the student can correct
  a misread row. → F11.
- Rows outside the transfer section keep the normal grade rules (below C, W and I don't
  count). → F03.
- Tests: transfer rows with blank, T, TR and an unknown mark all count under an ASU code; a
  transfer row with a code not in the curriculum doesn't count; a normal row with D
  doesn't count. → F03 (the first and third), F04 (the second).

**Where this differs from the brief:** §4 Flow B step 2 says "Apply no grade check if no
grade is shown". The answer goes further: no grade check on a transfer row at all, even
when a grade is shown. For transfer rows it therefore also overrides §5 "Grades" ("A
grade below C never counts; flag 'must be repeated'"), which still holds for every row
outside the transfer section.

**Approved the same day (2026-11-16): three feature steps reworded** so they match this
rule and the test "a transfer row outside the curriculum doesn't count". The owner's final
wording, now in `features.json`:
- F03, step 1: adds "(rows in the transfer-credit section are not grade-checked; see step 5)".
- F03, step 5: "Transfer, AP and CLEP rows shown under an ASU course code are treated as
  passed, whatever their grade column shows (blank, T, TR, a letter or anything else). They
  then count only if the course is in the curriculum or matches the elective rule, like any
  passed course."
- F11, step 4: "rows in the transfer-credit section are labelled 'Transfer credit' and
  treated as passed, whatever their grade column shows; whether each one counts follows the
  normal curriculum rules."

*Agent's notes, not owner decisions:*
- When a course has both an ordinary passing row and transfer credit, the ordinary row is
  the one shown as deciding, because the transfer row's grade column is not read at all.
- A row is transfer credit only when the reader marks it so with a plain yes; anything
  else is treated as an ordinary row, so a misread flag can never make a D count.

### 2026-11-16 — CIS 304 and CIS 415 never count (F08, and anywhere the elective rule applies)

CIS 304 and CIS 415 do **not** count, not even as electives. They are an exception to the
300/400-level CIS elective rule. They have never been available to select in the ASU portal.

- **Flow A answer:** "Doesn't count toward CIS — <code> isn't in the current CIS curriculum."
  → F08.
- **Flow B:** in the owner's words, "you we never find it on a transcript". → F04.
- **Tests:** CIS 304 and CIS 415 don't count in Flow A or Flow B; another 300/400-level CIS
  course not already required still counts as an elective. → F04 (placing), F08 (Flow A).

**Where this differs from the brief:** §5 says to delete CIS 304 and CIS 415 from the data,
and gives the elective rule with no exception. To make these two never count, the
curriculum file now names them in one place only: as exceptions to the elective rule
(`electives.subjectRule.exceptCourses`). They are still not courses of the curriculum.

*Agent's notes, not owner decisions:*
- The Flow B line is read as: these courses will never be found on a transcript. If one
  ever is, it does not count, because the owner asked for a test that they "don't count in
  Flow A or Flow B".
- `features.json` was written before this answer. These steps now disagree with it or
  leave it open: F02 step 3 (the two courses "do not exist anywhere"); F04 step 3 (the
  elective rule with no exception); F08 step 2 (a course that only matches the elective
  rule shows the elective answer: followed literally it would say CIS 304 counts); F08
  step 5 (no sentence for these two courses) and step 7 (no test for them). Feature steps
  are only changed with the owner's approval; new wording is proposed in the pull request
  for this change. (Approved and reworded the same day: see the next entry.)
- The answer also replaces, for these two courses, the brief's §4 Flow A answer for a
  course that matches the elective rule.
- The exception is data, not code: another program could list its own, or none.

### 2026-11-16 — Feature steps reworded after the CIS 304 / CIS 415 answer (answer on PR #10)

The owner, on the table of proposed wording in pull request #10: "Approved: reword F02
step 3, F04 step 3 and F08 steps 2, 5 and 7 as in your table, with one change. F08 step 5
must use my full message: "Doesn't count toward CIS — <code> isn't in the current CIS
curriculum."

Applied to `features.json`:

- **F02 step 3:** CIS 304 and CIS 415 appear only as exceptions to the elective rule, so
  they never count; no replacement, older-code or not-offered entry exists anywhere
- **F04 step 3:** … not already required. CIS 304 and CIS 415 are exceptions and never count
- **F08 step 2:** … with no title. Never shown for CIS 304 or CIS 415
- **F08 step 5:** … "Doesn't count toward CIS — not in the CIS curriculum". CIS 304 and
  CIS 415 show "Doesn't count toward CIS — <code> isn't in the current CIS curriculum."
- **F08 step 7:** … and CIS 304 and CIS 415 not counting while another 300/400-level CIS
  course does

*Agent's note, not an owner decision:* the message seemed cut off after this first item
(part pasted, part typed; the quotation is as it arrived, without its closing mark). The
proposed F08 step 5 already quoted the owner's
sentence in full for CIS 304 and CIS 415, so the "one change" is read as: that sentence
must appear whole and unchanged, for those two courses. Every other course that is not in
the curriculum (BIO 230) keeps the sentence of the brief and of the approved design,
"Doesn't count toward CIS — not in the CIS curriculum". If the owner meant the new
sentence for every course that doesn't count, F08 step 5 and the design need one more
change; asked in the pull request that records this answer.

### 2026-11-16 — Credits of a course PathCheck doesn't know (F09; answer on PR #10)

Asked: in "Check my courses", where do the credits of a course outside the curriculum come
from? The owner: "leave it open for the student to add it."

- Courses PathCheck knows use their curriculum credits and aren't editable.
- An unknown course still never counts toward CIS. Its credits add only to the semester
  total, never to "count toward CIS".
- **Tests:** an unknown course adds 3 by default; an edited value changes the total and the
  under-12/over-18 notes; an unknown course's credits never count toward CIS. → F09.

*Agent's notes, not owner decisions:*
- Read as: a course PathCheck doesn't know starts at 3 credits, shown in a field the
  student can change. "Doesn't know" means not in a curriculum list and not matching the
  elective rule, which includes CIS 304 and CIS 415. A course that only matches the
  elective rule (MKT 410) is known: it has the rule's 3 credits and is not editable.
- The approved design shows "BIO 230, 3 cr" as plain text. The field to change it is new;
  F09 adds it to the design notes as a difference that comes from this answer.
- `features.json` F09 has no step for this yet. A new step is proposed to the owner in the
  pull request that records this answer; the tests above are built in F09 either way.

### 2026-11-16 — Three answers: F08 step 5, a new F09 step, and the last-reviewed line

Asked after pull request #12. The owner's words are quoted.

1. **F08 step 5.** Asked whether the new sentence was meant for every course that doesn't
   count. The owner (the reply begins mid-sentence; its subject is BIO 230, from the
   question): "keeps 'Doesn't count toward CIS — not in the CIS curriculum'. What you
   applied is correct." So only CIS 304 and CIS 415 show "Doesn't count toward
   CIS — <code> isn't in the current CIS curriculum."; F08 step 5 stays as it is.
2. **A new step for F09.** Approved ("Yes"), with the wording proposed. Added to
   `features.json` as F09 step 5: "A course PathCheck doesn't know starts at 3 credits and the student can change it; a course PathCheck knows uses its curriculum credits and can't be edited. An unknown course's credits add to the semester total only, never to what counts toward CIS"
3. **The last-reviewed line.** Asked what date "Curriculum last reviewed" should show, since
   the curriculum file has none and the mockups' "Nov 2026" was mockup text. The owner:
   "leave out "Curriculum last reviewed: Nov 2026"". → F06 (the footer), F18.
   (Replaced later the same day by the answer "The review date; F16's choices approved":
   the owner gave the date, and the line is shown. The notes below describe the time
   before that.)

*Agent's notes, not owner decisions:*
- Answer 3 is read as: the line is left out, and no date is invented. The app shows
  "Curriculum last reviewed: <date>" only when the curriculum file has a date, so it comes
  back by itself if the owner gives one (brief §12 lists the date among what the owner
  provides before M3).
- F18 step 1 says every result shows "Curriculum last reviewed: <date>", and step 3 has a
  banner when the curriculum hasn't been reviewed in 12 months. F17 says the printed
  summary carries the same line. With no date none of these can be shown. The contract of
  whichever of F17 and F18 is built first must put this to the owner (give a date, or
  reword those steps) before it is built; the steps are not changed here.
- `docs/design/DESIGN.md` and the mockups still show "Curriculum last reviewed: Nov 2026"
  in the footer. F06 builds the footer without the line and records that in DESIGN.md as a
  difference that comes from this answer.

### 2026-11-16 — No semester in the "Check my courses" heading; the term for the pace line (F07, F15)

Asked: the design's heading on "Check my courses" is the next semester ("Spring 2027");
which semester is "next" on a given date? The owner's answer, in their words:

**F07:** "no semester in the heading. It says "Check my courses". Nothing is derived from
today's date."

**F15** (pace line, transcript only), "if it needs the term the typed courses are for":

- "Default term = the next Fall or Spring after the latest term on the transcript. The
  latest term is the one with In progress rows if there is one, otherwise the latest graded
  term. Summer terms are skipped. Example: transcript ends with Fall 2026 in progress →
  default Spring 2027."
- "The pace line shows that term as a small control the student can change (Fall/Spring,
  the default term and the next few after it). For example: "15 credits in [Spring 2027 ▾]
  — at this pace you finish Fall 2029, one semester after your target.""
- "Never derive the term from today's date."
- "Tests: an in-progress term gives the next Fall/Spring; no in-progress term uses the
  latest graded term; a summer latest term skips to Fall; changing the term changes the
  finish semester."
- "If F15 doesn't need a term, build nothing for it."

*Agent's notes, not owner decisions:*
- The design's page heading therefore differs from the screenshots for good: recorded in
  `docs/design/DESIGN.md`, "Where the app differs from the screenshots".
- "The next few after it" leaves the number of terms offered to F15's contract; it is not
  an academic rule.
- The rule is written for F15. Whether F14 (pace in "See what I have left") uses the same
  "latest term on the transcript" as its starting point is for F14's contract to check
  against the brief, and to ask if the brief does not say.

### 2026-11-16 — F08: the sequence course in a shared slot, more than three electives, the legacy courses

Three questions asked before F08. The owner's answers, in their words:

1. **Same "pick one" slot with a sequence course: option a.** "The sequence course (HIS 132
   or ENG 210) counts whatever the typed order. The other shows "Doesn't count — it fills
   the same requirement as <sequence course>." Same placement as transcripts, so the two
   flows never disagree."
2. **More than three electives: option a.** "The first three typed count. Every extra one
   shows: "Doesn't count — your 3 CIS elective places are already filled by <A>, <B> and
   <C>." A legacy elective (when the answer is Yes) uses one of the three places like any
   other. Never show "Counts" for a course whose slot is already filled by the student's
   own list."
3. **Legacy courses** "(FLS 161, MGT 220, MGT 203, and PSY 251 when its social-sciences pick
   is already taken)":
   - "Not answered yet: the row shows the question "Are you a legacy CIS student?" (Yes /
     No) in place of an answer. Never "Counts" before the answer."
   - "Yes: "Counts toward CIS: elective (legacy)""
   - "No: "Doesn't count toward CIS. Legacy students only.""
   - "The answer is remembered in the browser and can be changed (brief §5)."

"Tests: the sequence course wins the slot in both typed orders; the 4th elective doesn't
count and names the three that do; a legacy course shows the question before an answer,
"Counts… (legacy)" on Yes, "Doesn't count…" on No; a legacy elective on Yes takes one of the
three elective places."

**Where this differs from earlier answers:** answer 3 of 2026-11-15 on PR #1 ("the first
counts") now has an exception: a sequence course wins its slot whatever the order.

**Where this differs from `features.json`:** F05 step 1 says the legacy question is asked
"only when one of these four courses appears". For PSY 251 the owner's answer is narrower:
only "when its social-sciences pick is already taken". PSY 251 alone is an ordinary Social
sciences course and is not asked about. The step's text is not changed (that needs the
owner); it now reads more narrowly for PSY 251.

*Agent's notes, not owner decisions:*
- "When its social-sciences pick is already taken" is read as: PSY 251 is asked about
  whenever its answer depends on the legacy answer. That is when another typed course is
  in that pick, in either order, and an elective place is free for PSY 251: with PSY 251
  typed first and GEO 206 second, which of the two counts depends on the answer. When the
  answer would change nothing (the three elective places already full), no question is
  asked.
- "Counts toward CIS: elective (legacy)" is shown, like every "Counts" answer without a
  transcript, with the condition "unless you've already passed it or filled this slot"
  under it (F08 step 6: a plain "Counts toward CIS" with no condition is never shown).
- The typed courses are placed with the same code as a transcript (`placeCourses`), which
  already puts a sequence course first in its slot and takes electives in order.
- For PSY 251 with the answer Yes, the F05 rule applies: it stays in its Social sciences
  pick unless being an elective counts more.

### 2026-11-16 — F12: the in-progress wording; a sequence course whose pick is filled; when to ask

The owner's message, in full:

"Owner answers, 2026-11-16. Record them in docs/decision-log.md under "Owner answers".

1. F12 in-progress wording: "Already in progress." Everything else in F12 is approved.

2. Sequence course when a pick is filled:
   a. If a sequence can still be completed through an open pick: "Doesn't count — same slot as <course>. Take <ENG 210 / HIS 132> for the sequence."
   b. If both picks are filled by non-sequence courses: "Needed for the <history / literature> sequence (3 extra credits)." It fills the sequence requirement only. Flow B shows the same, and the draft plan schedules it.
   Add tests for a, b, and Flow B.

3. Before asking me, check whether the curriculum and brief already decide it. Ask only when they don't."

**Where this differs from earlier records:** answer 1 replaces the agent's sentence "In
progress on your transcript — it doesn't count again." Answer 2 replaces the agent's
stand-in "Needed for the history sequence. Its credits don't add to your degree total."
and closes the open question of the same day. Answer 3 refines "academic rules … stop and
ask the owner" (`CLAUDE.md`): the agent first reads the brief, the curriculum and these
answers, and asks only for what they leave open.

*Agent's notes, not owner decisions:*
- 2a is read as: the typed sequence course's own pick is held by a course of the
  transcript, no sequence is on its way, and the transcript leaves the other sequence
  course's pick open. "<course>" is the course that holds the pick; the course to take is
  the other sequence's. The row is drawn as "Doesn't count" and its credits are in "Don't
  count".
- 2b is read as: the transcript holds the picks of both sequence courses with other
  courses, and neither sequence course is passed, in progress or typed earlier. "3" is the
  course's credits from the curriculum. The row has neither mark; its credits are in the
  total and in neither of the two counts (extra: they fill no place of the 121).
- When a sequence is already on its way (its pick course passed, in progress, or typed
  earlier or holding its pick), a typed sequence course whose pick is held still shows
  the brief's "This slot is already filled".
- "Flow B shows the same, and the draft plan schedules it" is carried to F13 (the
  checklist) and F16 (the draft plan), each with its tests, in
  `docs/sprints/_carried-forward.md`. Flow B has no screen yet; F12 tests a and b.
- "Everything else in F12 is approved" is recorded as given. The words concerned are
  listed in F12's pull request so that the owner can see each of them on the page.

### 2026-11-16 — The review date; F16's choices approved

The owner's message, in full:

"Owner answers, 2026-11-16. Record them in docs/decision-log.md under "Owner answers".

1. Review date: (a). I reviewed the curriculum on 2026-11-15. Store it in the curriculum file and show "Curriculum last reviewed: Nov 2026". The 12-month banner works as written.

2. F16: your choices are approved, including the MGT 462 line in the curriculum file and the order by course level."

**Where this differs from earlier records:** answer 1 replaces the owner's answer of the
same day "leave out "Curriculum last reviewed: Nov 2026"" (there was no date then): the
curriculum file gets `lastReviewed: 2026-11-15`, the line is shown, and F17's line and F18
steps 1 and 3 stand as written. It closes the question kept "to ask later".

*Agent's notes, not owner decisions:*
- "(a)" answers the question put in chat on 2026-11-16: "(a) Give me the date you last
  reviewed the curriculum, and I show the line and the banner rule as written. (b) Reword
  those steps so the line and the banner appear only once a date exists."
- The date went into the curriculum file in a pull request of its own ("chore: store the
  curriculum review date"), straight after F16 and before F17: the footer already shows
  "Curriculum last reviewed: <month year>" when the file has a date (F06), so the line
  appears on every page with that change.
  F16's pull request does not touch the date.
- "Your choices" in answer 2 are those told to the owner in chat before the answer: the
  final-semester line in the curriculum file; the spread of credits over the semesters;
  the order by level, then the curriculum's order, with the difference from the
  screenshot; "Move later" (next semester, the others flow, never back earlier); the
  sequence entry; the line under the plan when it ends later than the pace estimate; a
  move kept as "not before this term"; buttons that read the same counted for screen
  readers. The words that are the agent's are listed in F16's pull request all the same.

### 2026-11-16 — The M1 check: everything works except the pace line of "Check my courses"

The owner's message, in full:

"Everything works as intended except for one thing.

The Flow A pace line is confusing ("…finish Spring 2040, 22 semesters after your target"). Replace it with:
"<n> of these <m> credits count. To finish by <target>, you need about <x> counting credits a term."
- x = counting credits left ÷ Fall/Spring semesters left to the target, rounded up.
- If x is more than the student's "Most" credits, add: "That's more than your <Most>-credit limit — consider a later target."
- Put the term and target dropdowns on their own line under the sentence, not inside it.
- Never show a finish date years away from this term's courses alone.
Record the change in docs/decision-log.md and update the tests."

**Where this differs from earlier records:** it replaces the owner's sentence of 2026-11-16
for F15 ("15 credits in [Spring 2027] — at this pace you finish Fall 2029, one semester
after your target [Spring 2029].") and the agent's variants of it ("… you finish in your
target semester"; "12 of your 15 credits … count toward CIS — …"; "None of these credits
counts toward CIS, so this list doesn't bring you closer to finishing."). The line no
longer names a finish. F15 step 1 in `features.json` still quotes the old example; it is
not changed without the owner's yes (asked in the pull request).

*Agent's notes, not owner decisions* (each is listed in the pull request for the owner):
- "Counting credits left" is read as the credits still to take toward the degree, this
  term's counting courses among them: the number "See what I have left" shows as credits
  left (with the extra credits of a sequence course when there are any), and 3 more when
  one of the typed courses fills the last pick a sequence could have gone through
  (evaluator, contract round 1: x must never be lower than what the list really leaves
  to do). "Semesters left to the target" is read as the Fall and Spring terms from the
  term the typed courses are for, through the target, both counted. So x can be set
  beside n: what a term needs, and what this term has.
- n is the number the page shows above "Count toward CIS". A typed sequence course that is
  "Needed for the … sequence" is not in it (it fills the sequence requirement only and is
  never said to count), though its credits are among those to take (code review of the
  change).
- x is the same for every term from this one through the target, so it does not change
  with how many credits are typed (only when a typed course makes a sequence course
  necessary): with one 3-credit course typed the line says "about 17 counting
  credits a term" and no limit sentence. The other reading — what the terms after this
  one need once this term's courses are taken (78 ÷ 4 = 20, over the limit) — is put to
  the owner as a question in the pull request and in `docs/milestones/M1.md` part 5. It
  is not built.
- "Most" is the "Most credits per term" of "See what I have left" (18 until changed).
- When the target is earlier than the term the courses are for, no term is left to the
  target: the line then takes that term itself as the target, and the target list offers
  no earlier term. The target of "See what I have left" is not changed by that.
- The sentence is used as it is for every list, also when none of the typed credits
  counts ("0 of these 3 credits count. …") and when a number is 1 ("about 1 counting
  credits a term"): the owner's words are not adapted.
- With the term as the line's target, the two pages can show different targets until the
  student chooses one.
- "Credits only — course order may add semesters." stays under the line: the owner's
  message does not mention it, and the sentence is still an estimate from credits alone.
- The two lists keep their names, now shown beside them: "Term for these courses" and
  "Target semester".
- M1 is not closed by this answer: the change is made first, and the owner is asked
  again.

### 2026-11-16 — M1 approved; x stays as built; F15 step 1 reworded; M2 to start

The owner's message, in full (an answer to the three questions of pull request #30):

"1. x stays as built (credits needed per term from this term to the target). No change.
2. Approved: reword F15 step 1 as you proposed.
3. M1 approved, <date>. Record it in docs/decision-log.md (Milestone checks, M1 row). Your choices in docs/milestones/M1.md part 5 are approved. I'll close the GitHub milestone myself.

Start M2. Tell me exactly what to set up and where, one step at a time. I set every secret myself — never ask me to paste a key in chat."

What it decides:
- **x** on the pace line of "Check my courses" stays as built: the credits needed per term
  from this term to the target. The other reading (what the terms after this one need) is
  not built.
- **F15 step 1** in `features.json` now reads: "With a transcript, Flow A asks the target semester and adds one line, for example "15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term.""
- **M1 is approved.** The choices listed in `docs/milestones/M1.md` part 5 are approved: what
  "counting credits left" and "semesters left to the target" mean; "Most" as the most
  credits per term of "See what I have left"; n as the number above "Count toward CIS"; the
  term as the target when the target is earlier; no summers on this line; the owner's
  words used exactly for every number; the caveat kept under the line.
- **The owner said "Start M2."** The owner sets every secret themselves; a key is never asked for in
  chat. The owner closes the GitHub milestone "M1: Working prototype" themselves.

*Agent's notes, not owner decisions:*
- The message has "<date>" where a date was meant. The approval is recorded with
  2026-11-16, the day the message arrived.
- The message approves M1 and the choices of part 5. The items of `docs/milestones/M1.md`
  part 3 were not mentioned one by one; they stay listed there as the agent's choices, and
  the question about the review step stays under "Open questions to the owner".

### 2026-11-16 — No pull request before the owner's setup

The owner's message, in full, sent while F21's contract was being reviewed:

"do not create pull request until I setup the system from the 3 steps you provided."

The three steps are the Netlify project, the paid Gemini key in Google AI Studio, and the
key stored in Netlify as `GEMINI_API_KEY` (given in chat on 2026-11-16).

*Agent's notes, not owner decisions:*
- F21 is built and tested on its branch meanwhile, with local commits only: no push and no
  pull request until the owner says the setup is done.
- After the first instructions the owner was told to choose the Deploy Previews context
  only for the key, not Production, until F22 is merged (contract review of F21).
- A question was put to the owner the same day and has no answer yet: whether the privacy
  sentence ("Your PDF is read, then deleted. Only your result stays in this browser.")
  should say that the PDF goes to Google Gemini, and that Google may keep it for a limited
  time to check for abuse. F21 is not marked passing before the answer.

### 2026-11-17 — The setup is done; publishing is locked; the address of a page

The owner's message, in full:

"I opened the project and it said. https://pathcheck.netlify.app/#/left lets make sure we have it as https://pathcheck.netlify.app  . Find the cause so we can fix it.
1. GEMINI_API_KEY is listed and hidden.
2. Google AI Studio: billing set up with the $5 prepay, and a $5 monthly spend cap.
3. I locked auto publishing. Merges must not publish to pathcheck.netlify.app; I'll publish myself. Previews stay automatic.
4. what are the options so I can make a choice?"

What it decides:
- **The setup of F21 is done:** the Netlify project `pathcheck` (https://pathcheck.netlify.app),
  the paid Gemini key with a $5 prepaid balance and a $5 monthly spend cap, and the key
  stored in Netlify as `GEMINI_API_KEY`, hidden.
- **Publishing is locked.** "Merges must not publish to pathcheck.netlify.app; I'll publish
  myself. Previews stay automatic."

*Agent's notes, not owner decisions:*
- The key was entered on the project's creation form with "Contains secret values" and the
  Deploy Previews context only (the owner's screenshots of 2026-11-17). The agent has not
  seen and cannot see the key.
- The project is Private: the agent's check of the address was refused (401). The owner was told not to make it public for now.
- With the setup done, the hold on the pull request ("do not create pull request until I
  setup the system") is over: F21's pull request is opened. It is not merged before the
  checks on the hosted preview (the owner's answer about the privacy sentence came later
  the same day).
- **The address.** The cause was looked for and nothing is changed: every page of PathCheck
  has its own address (`#/` Start, `#/check`, `#/left`), so the address ends in `#/left`
  whenever "See what I have left" is open: after its link, or after a file is chosen or
  dropped on Start. Opening https://pathcheck.netlify.app itself shows Start, and nothing
  in the code moves from there by itself (shown in a browser on localhost). Whether the
  address should stay bare on every page is put to the owner as a choice.
- **The hosted checks.** The agent's tools cannot log in to Netlify, and the repository's
  guard stops the agent from sending a file to an outside address. How the reader check
  and the look at the hosted page are done is put to the owner as a choice.
- "4. what are the options": the three wordings of the privacy sentence are given again
  in chat.

### 2026-11-17 — The privacy sentence for M2; the address stays; previews opened briefly for the test

The owner's message, in full:

"This iis what got shown: Upload isn’t available right now — try again tomorrow.
1. Keep the address as it is.
2. Privacy sentence: "Google reads your PDF and may keep it briefly. Your result stays in this browser." Record it in docs/decision-log.md.
3. Open previews briefly. Give me the exact clicks to open and to close them, and the command to run. Remind me to close them when the run finishes.
4. The M2 milestone on GitHub is called "Transcript upload""

What it decides:
- **The privacy sentence** is now: "Google reads your PDF and may keep it briefly. Your result
  stays in this browser." It replaces "Your PDF is read, then deleted. Only your result
  stays in this browser." (answer i on PR #4) next to every upload control.
- **The address stays as it is:** each page keeps its own address (`#/`, `#/check`,
  `#/left`).
- **The test against the real Gemini** is run by the owner with the Deploy Previews opened
  for the length of the run and closed again afterwards. The agent gives the clicks and
  the command, and reminds the owner to close them.
- **The GitHub milestone of M2** is called "Transcript upload".

*Agent's notes, not owner decisions:*
- On the private preview the owner's first try of `sample-a.pdf` gave "Upload isn’t
  available right now — try again tomorrow". The likely cause, not yet confirmed: the
  page's request to the function was sent without the browser's cookies, and a private
  Netlify deploy answers only a logged-in visitor, so Netlify refused it before the
  function ran. The request now goes with the site's own cookies (to this site only).
  PathCheck sets no cookie of its own, and the function reads nothing of a request but its
  type and its length. Listed for the owner in the pull request.
- The sentence is used as the owner wrote it. The mockups of M0 keep the earlier sentence:
  they are the record of what was approved then.

### 2026-11-17 — The model is gemini-3.5-flash-lite; the Google project is still on the free tier

On the owner's preview the function answered "unavailable"; its log line, read by the
owner, was "read-transcript: unavailable (refused 404)": Gemini did not find the first
model, `gemini-2.5-flash-lite`. The agent put the change of model and of price to the
owner (a normal transcript under one cent, at most about 12 cents an upload, instead of
about 0.1 cent and 3 cents). The owner's message, in full:

"Let's use gemini-3.5-flash-lite but provide the step needed to set my monthly billing to $5 a month. I just found out I'm still on free tier. Do not make any change on code for the free tier information just provide me instruction"

What it decides:
- **The model is `gemini-3.5-flash-lite`.**
- **Nothing in the code changes because of the free tier.** The owner sets up billing
  themselves, with the steps given in chat.

*Agent's notes, not owner decisions:*
- The entry "The setup is done" above records the owner's words that billing was set up
  with a $5 prepay and a $5 monthly spend cap. By this message the project is still on
  the free tier: billing is not yet in place. Until it is, the brief's "paid Google
  Gemini" (§7) does not hold: on the free tier Google's terms let it use what is sent to
  improve its products, and people may read it. Only the made-up transcripts are sent
  meanwhile. The owner was told not to upload a real transcript before the paid tier is
  on.
- F21's hosted checks can be run with the made-up transcripts on either tier; F24 (the
  owner's own transcript) cannot be done before the paid tier.

### 2026-11-17 — Billing is set; the reader check with the real Gemini passed

The owner's message, with two screenshots of the review step on the preview:

"I've also successfully set the billing tier to $5 monthly."

Then the owner ran the reader check in the session
(`node scripts/reader-check.mjs https://deploy-preview-32--pathcheck.netlify.app`): six
runs, each "PASS", model gemini-3.5-flash-lite, and "reader-check: every run read the
made-up transcripts as prepared."

*Agent's notes, not owner decisions:*
- The agent cannot see the Google account: that the project is on the paid tier with a $5
  limit is the owner's word.
- Netlify offers no setting that opens the previews and keeps the main site private. The
  agent told the owner so before the run; the owner ran the check with the project
  opened, and was reminded to set it back to private.

### 2026-11-17 — Show on the page why another file was not read

While testing F21 on the preview, with an earlier result still kept in the browser, the
owner wrote: "After I uploaded the pdf file it went straight to show Pace." The agent
explained that the new file had not been read, and that the reason was said only to a
screen reader, and asked whether to show it on the page. The owner's answer, in full (with
two screenshots for F21):

"Also Make the fix  so the sentence is shown on the page as well"

What it decides:
- The sentence "To use another transcript, choose “Use another transcript” first." is shown
  on the page as well as read out.

*Agent's notes, not owner decisions:*
- Where it stands (under the heading), how it looks (a quiet box in the design's colours)
  and when it goes away are the agent's choices, listed in the pull request.

### 2026-11-17 — "Synthetic transcript result" only over the made-up transcripts

The agent had asked what the label on the result page should do on the hosted site, where
it would be untrue over a real transcript. The owner's answer, in full:

"1. Show "Synthetic transcript result" only for the made-up transcripts in synthetic/transcripts/. A real transcript's result never shows it. Add a test for both cases. Settle this before I upload my own transcript."

What it decides:
- The label is shown only for the made-up transcripts in `synthetic/transcripts/`; a real
  transcript's result never shows it; a test covers both cases; it is settled before the
  owner's own upload (F24).

*Agent's notes, not owner decisions:*
- The made-up transcripts are recognised by their bytes, which only a development server
  can do: the built site holds nothing of them. So on the hosted site the label never
  shows, also when one of the made-up PDFs is uploaded there.
- The owner also sent a screenshot of Google AI Studio's Spend page the same day: Tier 1
  (the paid tier), a monthly spend cap of $5.00 with $0.04 spent, after about nine
  readings of the made-up PDFs with `gemini-3.5-flash-lite`: under half a cent a reading
  (Google notes that costs can take hours to show). Google's month resets on the first
  day of the month, Pacific time.

### 2026-11-17 — F22 on the hosted preview: the limits work with the real services

The owner ran the hosted steps of F22 on the preview of pull request #35 and sent
screenshots: an upload of `sample-a.pdf` read (Cloudflare's script and frame loaded when
the file was chosen; one request to PathCheck's function, answered 200; none to Google);
three uploads read and the fourth refused (the browser's console line "429 (Too Many
Requests)"; the page: "Upload isn’t available right now — try again tomorrow"). Then the
owner opened the project and ran the reader check in the session: six runs, each "PASS",
model gemini-3.5-flash-lite.

*Agent's notes, not owner decisions:*
- This is the first run of Netlify Blobs and of Cloudflare's check (with its test keys, as
  on every Deploy Preview) for PathCheck. The owner's real Turnstile keys are for the
  published site and are looked at with F24.
- The owner was told again that an opened project leaves a preview protected by the
  month's cap only, and was reminded to close it after the run.

### 2026-11-17 — F24, step 1: the bot check's two keys are set for Production

The owner created a Cloudflare Turnstile widget (name `PathCheck`, hostname
`pathcheck.netlify.app`, mode Managed, pre-clearance off; a screenshot of the form before
"Create") and stored its two keys in Netlify for Production only. The owner's words:
"both variables are listed, with TURNSTILE_SECRET_KEY hidden."

*Agent's notes, not owner decisions:*
- Cloudflare's form showed no "Region" field, which the agent's step had named from
  Cloudflare's documentation ("No option for Region."). The owner was told to skip it.
- The agent saw neither key. Nothing is built or published yet: that is step 3.

### 2026-11-17 — F24, step 2: the Gemini key has a Production value

The owner added a Production value to `GEMINI_API_KEY` and sent a screenshot of
Netlify's list: `GEMINI_API_KEY` (secret; scoped to Builds, Functions, Runtime) with a
hidden value for Production and for Deploy Previews and the other contexts empty;
`TURNSTILE_SECRET_KEY` (secret) and `VITE_TURNSTILE_SITE_KEY` (not secret) with one
value in one context each.

*Agent's notes, not owner decisions:*
- Netlify's list shows the last characters of a hidden value; they are not recorded.
- Nothing is built or published yet: that is step 3.

### 2026-11-17 — F24, step 3: the owner built `main` with the keys and published it

The owner started a build in Netlify ("Trigger deploy") and published it by hand. The
owner's screenshots of the deploy's page: first "Deploy successful for pathcheck", today
at 6:04 AM, "Production: main@8770a71", every stage of the log complete; then, after
"Publish deploy", "Published & locked deploy for pathcheck" with "Publishing is locked to
this deploy." and the control "Unlock to start auto publishing".

*Agent's notes, not owner decisions:*
- So the staging address serves commit 8770a71 (F21, F22 and F23), and publishing stays
  locked after a publish by hand: a later merge still publishes nothing.
- Still to be reported by the owner: that the plan shown by Netlify is Free.

### 2026-11-17 — F24, step 4: a made-up transcript is read on the staging address

The owner opened `https://pathcheck.netlify.app` (a screenshot of Start with that address
and Netlify's "Private" mark), chose `sample-a.pdf` and sent screenshots: "Check what was
read" ("This is what PathCheck read from sample-a.pdf."), then the result: 81 credits
left, "On pace for Spring 2029", "about 16 credits a term", 27 counted, 13 in progress,
121 total, and no label "Synthetic transcript result". The owner's words: "cloudflare did
not show any box to thick."

*Agent's notes, not owner decisions:*
- This is the first read with the owner's own Turnstile keys and the Production Gemini
  key. The function takes a token only for the action `upload` and the hostname
  `pathcheck.netlify.app`, so a read on that address is the proof of the real bot check.
- The browser's console showed, with the developer tools open, four errors and two
  warnings whose source is `normal?lang=auto`, Cloudflare's widget frame: a font warning,
  "Connecting to 'data:,' violates the following Content Security Policy directive:
  connect-src 'self' https://…challenges.cloudflare.com …" three times, "Fetch API cannot
  load data:,", "No available adapters." PathCheck sets no content security policy, so
  the policy and the requests it blocks are Cloudflare's own; none names a PathCheck
  file. The Sources panel showed a `debugger` line from the same frame. They are put to
  the evaluator against the feature's "no console errors".
- Not yet sent: the Network list of an upload, and the number of rows on "Check what was
  read" (17 expected).

### 2026-11-17 — F24, step 5: "Check my courses" on the staging address

The owner's words: ""Check what was read" listed 17 rows". Then two screenshots of "Check
my courses" on the staging address with sample-a.pdf in use: "Transcript added", "Your
answers use your transcript (sample-a.pdf).", "17 rows taken on."; MGT 321 "Counts toward
CIS — Business core" (no "unless …"), BIO 230 "Doesn’t count toward CIS — not in the CIS
curriculum", FLS 161 "Doesn’t count toward CIS. Legacy students only." after "No"
("Legacy CIS student: No"); 9 total credits, 3 count, 6 don't; "3 of these 9 credits
count. To finish by Spring 2029, you need about 17 counting credits a term."

*Agent's notes, not owner decisions:*
- The Console, shown whole this time, holds the same six lines as in step 4, all from
  Cloudflare's widget frame (`normal?lang=auto`); "Check my courses" added none.

### 2026-11-17 — F24, step 6, first try: the owner's transcript prints three decimals

The owner uploaded their own transcript on the staging address. It was read, and every
row asked to be fixed: "Needs fixing: the credits, the earned credits, the points". The
owner sent one screenshot of "Check what was read".

*Agent's notes, not owner decisions:*
- What is kept of that screenshot is how the transcript prints a figure: with three
  decimals ("3.000"). Nothing else of it is recorded or copied into the repository.
- The check took at most two decimals (a sanity mark of F10, not an academic rule). It
  now takes three: pull request #37, merged; see the row "(2026-11-17, F10)" above and
  the last section of `docs/sprints/F10.md`. It reaches the staging address with the
  owner's next build and publish.
- A result kept from before the fix keeps its rows as rows to fix; the owner uploads
  again after "Use another transcript".
- The evaluator's rule for the feature's "no console errors": lines from Cloudflare's
  widget frame are recorded and not counted when the Console shows that they are
  Cloudflare's and that the page itself has none, the widget did its job in the same
  run, and they are written down here; an error naming a PathCheck file fails.

### 2026-11-17 — F24, step 6: the reader passes on the owner's own transcript

After the owner built and published the fix (pull request #37) and uploaded their own
transcript again on the staging address, the owner's words:

"Every course is one row under the right term, with its code, credits and grade as printed, and no row that isn't on the PDF.
No row still asks to be fixed.
No "Synthetic transcript result" label is shown.
None. because I did not take  a summer term, and No transfer credit.
All credit figure are a whole number."

What it settles:
- The reader passes on the owner's real transcript (brief §9; F24's check 7).
- The label "Synthetic transcript result" is not shown over the owner's own result.

*Agent's notes, not owner decisions:*
- The owner's transcript has no summer term and no transfer credit, so it cannot answer
  how those are printed: the questions stay open, and the made-up PDFs keep following
  the owner's description. "None." is read as also answering that no grade is printed as
  "P" or "Passed"; the owner is asked to confirm.
- Not yet said by the owner: that the credits left and the requirements of the result
  are what they expect.
- The owner sent a screenshot with the Console filtered to leave out Cloudflare's frame:
  it holds no error and no line of PathCheck's (only the browser's own warning about
  pasting into the console). Nothing of the result on that screenshot is recorded.

### 2026-11-17 — F24, step 6: the result looks right; the request seen in the browser

The owner's words, about the result of their own transcript and the browser's Network
list of that upload: "The credits look accurate." · "read-transcript is status 200" ·
"google list is empty." With a screenshot of the Network list filtered on "google": 0 of
22 requests.

*Agent's notes, not owner decisions:*
- So the browser asked PathCheck's function once and nothing of Google's: the key and
  the call to Gemini stay on the server, on the staging address too.
- No grade of the owner's transcript is printed as "P" or "Passed": such a row would
  have asked to be fixed, and the owner reported that none does. Whether such a grade
  counts stays a rule for the owner, for when a transcript shows one.
- Nothing of the result on the screenshot is recorded.

### 2026-11-17 — F24, step 7: the upload works on the owner's phone

The owner opened the staging address on their phone. At first: "I typed
https://pathcheck.netlify.app but it says it is private." (Netlify's page for a visitor
who is not logged in); after logging in to Netlify in the phone's browser, a screenshot
of the phone: `pathcheck.netlify.app`, "Check what was read", "This is what PathCheck
read from sample-a.pdf.", the first rows under "Fall 2025".

*Agent's notes, not owner decisions:*
- This is the first time the file picker ("Browse files") is used on a real phone with a
  real PDF, open since M1 (F11's review): it opens, the PDF is chosen and read.
- The first screenshot is of the review, before "Continue". A second one followed: the
  result on the phone, 81 credits left, "On pace for Spring 2029", 27 counted, 13 in
  progress, 121 total, on `pathcheck.netlify.app`.
- Netlify's own bar for the logged-in owner ("Make public") lies over the page on the
  phone; a visitor of a public site does not get it.

## Open questions to the owner

These are questions, not answers. The rule each one mentions is the agent's cautious
stand-in until the owner answers; it is not an owner decision.

- **2026-11-16 (F11; to be looked at by the owner at the M1 check at the latest).** The
  approved design has no screen for the review step (what was read from the transcript,
  with rows to correct). It was built from the design's own pieces, and its layout and
  words are the agent's. The owner was told in chat on 2026-11-16 before it was built, and
  it is listed in F11's pull request. Does the owner want to change it, or design it?
  Status: no reply yet. M1 was approved on 2026-11-16 without an answer to this; it stays
  open.
- **2026-11-16 (for M2).** The other questions without an answer are listed in
  `docs/milestones/M1.md` part 3, "Questions without an answer". Four of them need the
  owner's real transcript at M2: how a summer term is printed; what the grade column
  shows on a transfer row; the layout of the transfer section; and whether a grade
  printed as "Passed" or "P" counts (an academic rule: the owner decides).
- **2026-11-16 (F21).** The privacy sentence once the PDF goes to Google Gemini. Answered
  on 2026-11-17 (see "Owner answers").

Nothing else is open. (Answered on 2026-11-16, see "Owner answers": the grade column of transfer
rows; whether CIS 304 and CIS 415 count; the credits of a course PathCheck doesn't know;
F08 step 5; the new F09 step; the last-reviewed line; the semester in the heading of
"Check my courses"; and the three F08 questions.)

The review date (kept "to ask later" for F17 and F18) was answered on 2026-11-16: the
owner reviewed the curriculum on 2026-11-15 (see "Owner answers").

## Milestone checks

| Milestone | Date | Owner's answer |
|---|---|---|
| M0 | 2026-11-15 | Approved: "I approve Pr 4". The design in `docs/design/` and the mockups in `mockups/` are what the app is built on. (Sequence rule confirmed the same day, see above.) |
| M1 | 2026-11-16 | **Approved:** "M1 approved". First answer the same day: "Everything works as intended except for one thing.": the pace line of "Check my courses" was replaced (pull request #30), and the owner then approved M1 and the choices of `docs/milestones/M1.md` part 5, and said "Start M2." (see "Owner answers"). The owner closes the GitHub milestone themselves. What was checked: `docs/milestones/M1.md`. |
| M2 | | |
| M3 | | |
