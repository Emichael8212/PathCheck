# PathCheck design

This is the design source for M1. It is the owner's own design, published at
https://color-nicks-25285809.figma.site/ (view "Combined · Your picks"), with the owner's
answers of 2026-11-15 applied (`docs/decision-log.md`, "Answers to the nine conflicts on
PR #4"). Colors, type, spacing and radii were read from the published site's computed styles.

- **Visual reference:** the screenshots in `docs/design/screens/`. They show the mockups
  after the owner's answers. If this file and a screenshot disagree, the screenshot wins.
- **The owner's site as published**, before the answers: `docs/design/screens/published/`.
  Use it for everything the answers did not change; where the two folders differ, the
  difference must be one listed at the end of this file.
- **Working example:** `mockups/` (`style.css`, `view.js`) is this design in plain project code.
- **Where it differs from the published site:** see "Differences from the published site"
  at the end. Each one comes from the brief or from a dated owner answer.

## Screenshots

`docs/design/screens/<page>-<light|dark>-<desktop|phone>.png`. Desktop is 1440 wide, phone
is 375 wide.

| Page | Files | Extra states |
|---|---|---|
| 1 Start | `start-*` | `start-demo-step2…4-light-*`: the other three demo steps |
| 2 Check my courses | `check-*` | `check-typing-*`: typing "mgt 3", suggestion open, MGT 321 not yet added |
| 3 What I have left | `left-*` | `left-open-*`: every requirement opened, the three Done ones included; `left-notes-*`: Fewest at 11 and Most at 19, both notes showing |

`docs/design/screens/published/` has the same file names (without `left-notes-*`), taken
from the published site on 2026-11-15, before the owner's answers. There, `left-open-*`
shows every requirement opened.

## Color tokens

Every color is a CSS variable with a light and a dark value. Nothing else sets a color.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f7f8fa` | `#0d1117` | Page background; the example card on Start |
| `--surface` | `#ffffff` | `#161b22` | Cards, inputs, table, requirement rows |
| `--surface-2` | `#eceff4` | `#21262d` | Table header, semester label band, reminder note, empty bar track |
| `--ink` | `#202735` | `#e9edf3` | Text |
| `--ink-2` | `#5b6473` | `#a3adbb` | Secondary text, labels, "Still needed" mark |
| `--line` | `#d9dfe8` | `#30363d` | Card and row borders |
| `--line-strong` | `#7f8999` | `#768392` | Control borders, empty bar segments, dashed outlines |
| `--accent` | `#4052a6` | `#b0bfff` | Primary button, links, current tab, headline second line, "Show courses" |
| `--accent-soft` | `#e9edf9` | `#242c40` | Pill badge, current nav item, "See what I have left" panel, pressed filter |
| `--on-accent` | `#ffffff` | `#151d33` | Text on the primary button |
| `--counts` | `#23664f` | `#8bd5b4` | "Counts", "Done", counted credits |
| `--counts-soft` | `#e7f2ed` | `#182c25` | Reserved (not used on the three pages) |
| `--nocount` | `#9d3e36` | `#ffb3a6` | "Doesn't count" text, mark and row edge |
| `--nocount-soft` | `#fcf0ed` | `#35221e` | "Doesn't count" row background |
| `--progress` | `#415fb0` | `#a9c0fa` | "In progress" mark, hatched part of the credit bar, ring |
| `--progress-soft` | `#eaf0fb` | `#202c43` | Background under the hatching |
| `--focus` | `#4052a6` | `#b0bfff` | Keyboard focus ring |
| `--shadow` | `#0000001a` | `#00000066` | Shadow under the suggestion menu |

Dark mode follows the device (`prefers-color-scheme`). Print uses its own values on white
(`@media print` in `mockups/style.css`), taken from the design's print rules.

## Fonts

| Role | Font | Notes |
|---|---|---|
| Everything | **Manrope** (variable, 400–800) | `--f-body`. Falls back to `system-ui, sans-serif`. |
| Course codes | **JetBrains Mono** (variable, 400–700) | `--f-code`. Slashed zero (`font-feature-settings: "zero"`), tabular figures, `white-space: nowrap`: a code never breaks across lines. |

Both are open-licence (SIL OFL 1.1) and are shipped in `mockups/fonts/` with their licences.
Numbers that are compared (credits, totals) use tabular figures with a slashed zero.

## Type sizes

Size / line height, weight, letter-spacing. Sizes are the same on phone and desktop unless
two values are given (phone → desktop).

| Use | Size | Weight | Spacing |
|---|---|---|---|
| Wordmark "PathCheck." | 23px / 1.5 | 800 | −1.1px; the dot is `--accent` |
| Start headline | 28px → 38px (≥650) → 40px (≥1000) / 1.2 | 800 | −1.1px; second line `--accent` |
| Page heading (pages 2, 3) | 30px / 1.2 | 800 | −1.15px |
| Section heading ("Requirements", "Draft plan") | 24px / 1.5 | 750 | −0.7px |
| "See it work" | 28px / 1.5 | 800 | −0.8px |
| Pace answer "On pace for Spring 2029" | 25px / 1.35 | 800 | −0.7px |
| Entry titles on Start | 23px / 1.5 | 800 | −0.6px |
| Ring number "81" | 48px / 1.1 | 800 | −2px |
| Summary numbers (page 2) | 32px / 1.5 | 800 | −1px |
| Course code in the result table | 18px / 1.5 | 600 | mono |
| Pace detail "about 16 credits a term" | 18px / 28px | 400 | |
| Body, inputs, sequence line | 16px / 1.5 | 400 (sequence 700) | |
| Requirement name | 15px / 1.5 | 700 | |
| Buttons | 14px / 1.45 | 700 | |
| Field labels, card text, course titles, conditions | 14px / 20px | 400–600 | |
| Table rows, answers, plan codes, intro paragraph | 13px / 1.5–1.8 | answers 600 | |
| Table header (desktop only), summary labels and condition, field notes | 12px | 400 | normal case, `--ink-2` |
| Nav links, filters, tabs, status words, "Show courses" | 11–12px | 600–700 | |
| Footer; bar labels (the number is 700) | 11–12px | 400 | |
| Section label (eyebrow) | 11px / 1.5 | 700 | 0.12em, uppercase, `--ink-2` |
| "Open choice" label | 10px | 700 | 0.06em, uppercase |
| Header note, example condition | 10px | 400 | |

## Spacing

- **Page container:** `min(1160px, 100%)`, centred; side padding 24px, 30px from 1000px.
  Page 2 is wider: max 1280px, padding 30px 22px 48px → 44px 44px 60px from 1000px.
- **Top bar:** max 1232px, min height 84px, padding 16px 30px, gap 28px. Below 650px the two
  nav links sit on a second row, 4px under the first.
- **Between sections:** 36–38px (intro → entry panel), 65px (→ demo), 44px (→ Requirements),
  50px (→ Draft plan), 34px (→ actions).
- **Card padding:** 28px → 35px (entry panels), 26px → 32px (overview), 22px (demo frame,
  summary cells), 20px (transcript card), 19px (example), 16px (requirement rows, notes).
- **Lists:** requirement rows 8px apart; semesters 14px apart; filters 8px apart.
- **Controls:** every control is at least 44px tall. Buttons 46px, the add field and the
  major dropdown 48px, the target-semester select, the steppers and the switch 44px, Remove
  44×44, "Move later" 44px. The demo's step dashes are 32×44.
- **Layout steps:** 650px (two columns on Start, nav on one row, plan in three columns),
  768px (pace controls two by two, requirement row on one line), 1000px (desktop table,
  four pace controls in a row, semester label beside its courses).

## Radii

| Radius | Used for |
|---|---|
| 24px | Entry panel on Start, overview card on page 3 |
| 20px | Demo frame |
| 16px | Example card |
| 12px (`--radius`) | Buttons, inputs, selects, notes, requirement rows, semesters, filters |
| 11px | Number chips (01, 02, 1, 2, 3) |
| 8–9px | Result table, transcript card, summary strip |
| 4px | "Move later" |
| 2px | Bar segments |
| 99px / 50% | Pill badge, nav items, tabs, "Synthetic transcript result", credit bar, switch, upload icon circle, ring |

## Status marks

Each status is a word plus its own shape, never color alone. The five shapes all differ.
Marks are inline SVG drawn in the project (20-unit grid); no icon pack.

| Status | Word | Shape | Color |
|---|---|---|---|
| Counts | "Counts toward CIS — …" | **Outlined** ring with a tick | `--counts` |
| Doesn't count | "Doesn't count …" | Solid rounded square with a cross; the row is tinted with a 4px left edge | `--nocount` |
| Done | "Done" | **Solid** disc with a tick | `--counts` |
| In progress | "In progress" | Ring, right half filled | `--progress` |
| Still needed | "Still needed" | Dashed ring | `--ink-2` |

- **Counts is never drawn like Done.** A no-transcript "Counts" is conditional, so its mark
  is an outline; only a finished requirement gets the filled tick.
- **Credit bar:** counted is solid `--counts`; in progress is hatched (`--progress` stripes
  on `--progress-soft`); the rest is the open track. Each part is labelled where it is:
  "13 in progress · Fall 2026" above the hatched part; "27 counted" and "81 left" under the
  start of their parts; "121 total" under the right end. There is no legend. The labels
  fit with this student's numbers; M1 must handle a part too narrow for its label (for
  example by stacking the labels) so that two labels never overlap.
- **Requirement bar:** one segment per credit, 12px high, 2px apart; counted segments are
  solid, the others outlined.
- **Open choice** (a pick or elective in the plan): a dashed left edge and the label "OPEN
  CHOICE". It is not a course.

## Shared pieces

- **Top bar:** wordmark (links to Start); two nav links, "Check my courses" and "What I have
  left", as pills (current page: `--accent` on `--accent-soft`); "Not an official degree
  audit." at the right. Below 650px the nav links are on a second row under the wordmark.
- **Footer:** top border; one line. At the left: "Not an official degree audit." (bold) ·
  "Curriculum last reviewed: Nov 2026" · "Report a mistake" (underlined email link). At the
  right, at the same height: "Not affiliated with Alabama State University". 12px. As the
  line narrows, the three items on the left wrap first and the affiliation line keeps its
  place at the right, level with the first of them. Under about 630px wide (a phone) it
  drops below the others, at the left (the agent's choice; the owner asked for the right).
- **Section label (eyebrow):** small uppercase label above a heading.
- **Buttons:** primary = `--accent` fill; secondary = `--surface` with a `--line-strong`
  border. Arrow icon after the label on buttons that move forward.
- **Focus:** 3px `--focus` outline, 2px offset, on every control.
- **Privacy sentence:** "Your PDF is read, then deleted. Only your result stays in this
  browser." It sits next to every upload control, so it is read before the first upload.

## Page 1: Start

**Desktop (1440).** Centred intro: pill badge "Before registration. Before you pay." with
a dot; two-line headline ("Does it count toward your degree?" / "Check before you select
your classes." in `--accent`); one line of supporting text; "Your major" with a 395px
dropdown. The dropdown has one option, "B.S. Computer Information Systems", already
selected: nothing has to be filled in before the two choices. No other majors are listed.

Then one bordered panel (1100px, radius 24) split in two equal halves:

- **Left, white:** chip "01", label "FOR NEXT SEMESTER", title "Check my courses", the
  question, an example card (MGT 321 · 3 cr · Principles of Management · the outlined
  "Counts" mark · "Counts toward CIS — Business core" · the condition), a full-width primary
  button "Check my courses →", and "~30 seconds · No transcript needed" centred under it.
- **Right, `--accent-soft`:** chip "02" beside label "FOR THE BIGGER PICTURE" and title "See
  what I have left"; the description; a dashed drop zone with the upload icon in a circle,
  "Drag & drop your transcript PDF here", "or", a secondary button "Browse files →", the
  privacy sentence and the mockup note.

Then "See it work": on the left the label "A QUICK LOOK", the heading, one line, and three
numbered steps; on the right a framed demo (min height 265px) with a round pause/play
button, four step dashes and a caption "n/4 …". The four frames: typing "mgt 3" with the
suggestion; the MGT 321 answer with its condition; BIO 230 added below it as "Doesn't count"
(red outline, hatched edge, credits struck through); a transcript file with "81 credits
left", the bar, "On pace for Spring 2029" and "Credits only — course order may add semesters."

**Phone (375).** Same order in one column. The panel stacks: "Check my courses" above "See
what I have left" (separated by a line). The demo text comes first, then the frame, then
the controls with the caption wrapping under them.

## Page 2: Check my courses

**Desktop (1440).** Label "CHECK MY COURSES", heading "Spring 2027", and "No transcript
added" at the right. A three-cell summary strip:

- **18** Total credits
- **12** Count toward CIS (`--counts`), and under it, without a transcript, "unless you've
  already passed them or filled their slots". With a transcript the condition is dropped,
  because the answer is exact.
- **6** Don't count (`--nocount`)

A two-column row: "Add a course" with a text field ("Course code or title") and an "Add"
button (dimmed until something is typed); beside it two filter buttons, "All courses"
(pressed) and "Doesn't count" (with the square-cross mark).

The result table (white, radius 8): a header row "Course · Credits · Does it count?" in
normal case on `--surface-2`; one row per course with columns `0.85fr 54px 1.3fr 36px`: the
code (mono, 18px) over the title; credits; the mark and answer with the condition under it;
a Remove (×) button. "Doesn't count" rows are tinted `--nocount-soft` with a 4px `--nocount`
left edge. A course that is not in the curriculum has one answer only: "Doesn't count
toward CIS — not in the CIS curriculum".

Below: the reminder note on `--surface-2` with a document icon; then a card "Add your
transcript for an exact answer" with the privacy sentence and a primary button "Choose
transcript PDF →" at the right. The footer spans the full width.

**Typing state.** The field holds "mgt 3", "Add" is active, and a suggestion menu drops
from the field (white, `--line-strong` border, shadow) with one highlighted row: "MGT 321
Principles of Management".

**Phone (375).** The summary stays three cells across, the middle one wider (1 : 1.5 : 1) so
the condition fits. The add field and the filters stack. There is no visible header row;
each course is a block: code and title, "3 cr" and Remove at the top right, then the mark
and answer across the full width. The transcript card stacks with its button under the text.

## Page 3: What I have left

**Desktop (1440).** Label "WHAT I HAVE LEFT", heading "Your degree, in focus.", and a pill
"Synthetic transcript result" at the right.

**Overview card** (radius 24): a ring (175px; counted, in progress, remaining) with **81**
"credits left" in the middle; beside it "LOOKING AHEAD", "On pace for Spring 2029", "about
16 credits a term" and "Credits only — course order may add semesters." Under them the
credit bar (12px) with its parts labelled directly (see "Status marks").

Under a divider, "MAKE THE ESTIMATE YOURS" with four controls in a row:

- **Target semester:** a select (Spring 2029).
- **Fewest credits per term:** − 12 credits +
- **Most credits per term:** − 18 credits +
- **Summers:** a switch (Off).

Both ends of the credit range can be changed, and PathCheck sets no hard limit (the portal
enforces the real one). A neutral note appears under the control when it applies: under 12,
"Below 12 credits: below full-time; may affect scholarships."; over 18, "Over 18 credits:
may cost extra." At 12 and 18 there is no note. The note is plain grey text, not a warning,
and it is announced to screen readers when it appears. The two ends never cross: pushing
one past the other takes it along. Neither goes below 1 credit, where its "−" is switched
off. In the app the pace answer above must follow these controls (F14); in the mockup it
does not.

**Requirements.** Label "THE REST OF YOUR DEGREE", heading, and an "All / Not done" pill
toggle at the right; one line: "Credits counted / needed." Nine cards (white, radius 12,
8px apart). Each has a row with columns `220px 150px 1fr 80px 112px`: name · status mark
and word · segmented bar · "3 / 12 cr" · the toggle "Show courses" / "Hide courses".
Every requirement has the toggle.

- **In progress and Still needed** requirements start open, so their courses show straight
  away, under the row: up to three columns (Done, In progress, Still needed), each a small
  titled list of code + title. "Hide courses" closes them.
- **Done** requirements start closed. "Show courses" opens the list of the courses that
  filled them.

Under the list, a dashed box: "Still needed: HIS 132 or ENG 210 to complete a history or
literature sequence."

**Draft plan.** Label "A STARTING POINT, NOT A SCHEDULE", heading, a dashed label "Draft —
Order not checked — your portal checks prerequisites", and a line of explanation. Five
semester bands: a 158px label column on `--surface-2` (term, credits) and the courses in
three columns. Each entry: code, title, and a "Move later" button. Open choices have a
dashed left edge and the label "OPEN CHOICE". MGT 462 carries "Always the final semester".

**Actions:** primary "Print / save PDF for your advisor" and secondary "Clear my data".

**Phone (375).** One column. The ring (155px) sits above the pace answer; the four pace
controls stack. The toggle moves under the heading. A requirement row becomes three lines:
name and status, the bar, then credits with the toggle at the right. The course lists
stack. Each semester is a header band (term left, credits right) over a list
with "Move later" at the right of each entry. The two action buttons wrap.

**Print.** The top bar, the "All / Not done" toggle, "Show courses" / "Hide courses", "Move
later" and the action buttons are not printed; every requirement prints opened; the ring,
bars and tinted rows are printed;
the page is white.

## Differences from the published site

Each difference comes from the brief or from a dated owner answer in `docs/decision-log.md`.

**Kept from the brief** (owner's decision of 2026-11-15):

- All colors are tokens with light and dark values; contrast meets WCAG AA.
- At 375px nothing is hidden or overlapping; keyboard focus is always visible. Because of
  this the two nav links are shown on a phone, on a second row of the top bar.
- Every result shows "Curriculum last reviewed: <date>", "Not an official degree audit",
  "Report a mistake" and "Not affiliated with Alabama State University".
- In the demo, "Counts toward CIS — Business core" is followed by "unless you've already
  passed it or filled this slot", and "On pace for Spring 2029" by "Credits only — course
  order may add semesters."
- "Report a mistake" is an email link (the address is a placeholder until the owner gives it).

**The owner's answers to the nine conflicts** (2026-11-15):

- a. The major dropdown is kept, with one pre-selected option.
- b. The count at the top of page 2 carries its condition when there is no transcript.
- c. No third answer; the filter says "Doesn't count".
- d. In progress and Still needed requirements show their courses; Done ones open with
  "Show courses". Every requirement has the Show / Hide toggle.
- Footer: "Not affiliated with Alabama State University" at the right, level with the
  other three items (the published site has it on a line of its own).
- e. "Fewest" and "Most" credits per term, both editable, with neutral notes and no hard limit.
- f. No uppercase grey table header; no legend (the bar is labelled directly). Pill-shaped
  tabs, the indigo main button and the numbered chips are kept.
- g. "Counts" and "Done" have different marks; all five statuses differ.
- h. 12 count toward CIS, everywhere.
- i. The privacy sentence is "Your PDF is read, then deleted. Only your result stays in this
  browser."

## Where the app differs from the screenshots

The app (`src/`, from F06) is built from this design. Its stylesheet is `src/style.css`,
which started as a copy of `mockups/style.css`. These differences are intended:

- **"Curriculum last reviewed: Nov 2026" in the footer comes from the curriculum file**, not
  from fixed text: the owner reviewed the curriculum on 2026-11-15 (answer of 2026-11-16,
  which replaces the earlier "leave out" of the same day). The line is shown only when
  the file has a date, as its month and year.
- **No "Mockup: opens synthetic student results." under "Browse files".** It was a note
  about the mockup.
- **On "Check my courses", a course PathCheck doesn't know has a small dropdown for its
  credits** (0 to 12, starting at 3) where the design shows "3" as text. The owner,
  2026-11-16: such a course "starts at 3 credits and the student can change it".
- **The summary strip and the two filters are drawn only when the list has a course.**
  The design shows a list that already has six.
- **"What I have left": what is drawn so far** (F13, F14). The heading, the pill, the
  ring and the credit bar, the pace answer beside the ring with its four controls, the
  requirements with "All / Not done", and the sequence box are drawn as designed. The
  draft plan and the two action buttons come with F16, F17 and F19. Pace, where the
  design shows one case only ("On pace for Spring 2029", "about 16 credits a term"), in
  the agent's words: "Not on pace for <target>"; "At 18 credits a term you finish Spring
  2029, one semester after your target." and the same with "before" for the fewest; "No
  credits left to plan"; "Pace can't be estimated: the latest term on your transcript
  could not be read." (then no controls). The Summers switch has an "on" look (knob at
  the other end, accent color); the design shows it off only. Additions, in the
  agent's words unless said otherwise:
  - above the result, when rows of the transcript still need fixing: "<m> rows of your
    transcript still need fixing and count nothing. A requirement, or the sequence, may
    show as still needed because of them. The credits left and the pace may change too."
    with "Fix them";
  - before the result, when the answer would change it: the legacy question (the owner's
    words) with "Your transcript has <code>, which counts as an elective only for legacy
    students.";
    afterwards "Legacy CIS student: Yes" with "Change";
  - notes on a course: "Repeat; the earlier D doesn't count." (the design's); "Must be
    repeated; the D doesn't count."; on a pick, "<code>: the D doesn't count. It must be
    repeated, or another course of this pick taken."; on the electives, "<code>: the D
    doesn't count. It must be repeated, or another elective taken.";
  - the sequence box with one pick open ("Still needed: ENG 210 to complete a literature
    sequence.") and with none ("Needed for the history or literature sequence (3 extra
    credits): HIS 132 or ENG 210."), and then under the credit bar "Plus 3 extra credits
    for the history or literature sequence." (from the owner's answer of 2026-11-16);
    when a sequence course is in progress while a passed course holds its pick, "In
    progress: HIS 132 for the history sequence (3 extra credits). It fills the sequence
    requirement only." with the in-progress mark, and under the bar "Plus 3 extra credits
    in progress for the history sequence.";
  - the labels of the credit bar start where their parts start, as designed, and wrap
    instead of overlapping when a part is very small (a new student; a nearly finished
    one);
  - under the requirements, closed until opened: "<n> courses on your transcript are not
    counted toward CIS", each with its reason;
  - at the end: the line of counts of the review, "Check what was read" and "Use another
    transcript"; with no row taken on, "No row of your transcript was taken on, so there
    is nothing to show yet.";
  - the cards are in the curriculum's order (the screenshots show the done ones first).
- **The pace line on "Check my courses"** (F15; the brief's Flow A step 5). The design has
  no place for it: it is one line under the three numbers, shown only with a transcript,
  in the owner's sentence of 2026-11-16 with two small lists inside it: "15 credits in
  [Spring 2027 ▾] — at this pace you finish Fall 2029, one semester after your target
  [Spring 2029 ▾]." and under it "Credits only — course order may add semesters." In the
  agent's words where the owner's example does not reach: "12 of your 15 credits in
  [Spring 2027 ▾] count toward CIS — at this pace you finish …" when some typed credits do
  not count; "… at this pace you finish in your target semester [Fall 2029 ▾]."; "None of
  these credits counts toward CIS, so this list doesn't bring you closer to finishing.";
  "Answer “Are you a legacy CIS student?” to see your pace."; and the legacy question
  itself in the line's place when no typed course shows it. The lists are 44px high and
  named for a screen reader ("Term for these courses", "Target semester").
- **The draft plan** (F16; the owner approved these choices on 2026-11-16). Drawn as the
  design has it: the section head, the dashed label, the line under it, the semester
  bands, the entries, "Open choice", "Move later", "Always the final semester". Where it
  differs from the screenshot:
  - **the order is by course level** (the brief), then the curriculum's order. So the
    three open picks whose lowest course is 100-level (the two Humanities picks and the
    Social sciences pick) are in the first semester, and MGT 201 and MGT 204, which the
    screenshot shows there, are in the second; within a level the order is the curriculum's
    (CIS 329 before CIS 302 and CIS 300). The five semesters, their credits (18, 18, 15,
    15, 15) and the 27 entries are the screenshot's. Every entry that sits in another
    semester than in the screenshot, for the design's student:
    - Spring 2027 has the Social sciences pick and "Humanities pick (ENG 210 or another)"
      (the screenshot: Fall 2027), and no longer MGT 201 and MGT 204 (now Fall 2027);
    - Fall 2027 has FIN 321 and MGT 321 (the screenshot: Spring 2028), and no longer
      CIS 300 and CIS 302 (now Spring 2028);
    - Spring 2028 has CIS 329 (the screenshot: Fall 2028), and no longer CIS 341 (now
      Fall 2028);
    - Fall 2028 has MGT 422 (the screenshot: Spring 2029), and no longer a CIS elective
      (all three are in Spring 2029);
  - a line the design has no place for, under the plan and only when it ends later than
    the pace answer implies: "This draft ends in <term>, later than the pace estimate
    above: courses can’t be split across semesters." or "…: you moved courses later.";
  - the agent's words: "<block> pick (<courses>)" for a pick with three or fewer courses
    left and "<block> pick (<code> or another)" follow the design's two examples for
    other picks; "HIS 132 or ENG 210, for the history or literature sequence" for the
    sequence course when both sequence picks are held; said to a screen reader only:
    "<entry> moved to <term>."; a button's name for a screen reader starts with its visible
    words and counts entries that read the same ("Move later: MGT 321", "Move later: CIS
    elective, 2 of 3"; the mockup had "Move MGT 321 later");
  - "Clear my data", which ends the design's page beside the print button, is not drawn
    until F19.
- **The printed summary** (F17). "Print / save PDF for your advisor" is the design's
  button, in the design's row of actions after the draft plan, and the paper follows the
  design's print rules. What the design has no place for:
  - two lines on paper only: at the top, "PathCheck summary — <program>, <institution>"
    with "Not an official degree audit. Not affiliated with Alabama State University.
    Curriculum last reviewed: Nov 2026" under it; and, where the pace controls are on the
    screen, "Target semester: Spring 2029. Fewest credits per term: 12 credits. Most
    credits per term: 18 credits. Summers: Off.";
  - also not printed, beyond the design's list: the pace controls, "Change" beside the
    legacy line, "Fix it", "Check what was read", "Use another transcript" and its
    sentence, and the "Report a mistake" link;
  - on paper the plan's entries have no lines between them (the lines sit under "Move
    later", which is not printed);
  - under the print button, "17 rows taken on." and the two buttons of the review (the
    agent's, from F11 and F13) follow the design's row of actions;
  - the button is not drawn in a browser that cannot print.
- **"Check my courses" with a transcript** (F12). The heading note and the card "Add your
  transcript for an exact answer" are drawn as designed ("Choose transcript PDF" opens
  the file picker). The design shows them only without a transcript; the other states
  use the same note and the same card, in the agent's words:
  - the note: "Transcript added";
  - the card while the transcript waits in the review step: "Your transcript is waiting
    to be checked." with a button "Check what was read";
  - the card with a reviewed transcript: "Your answers use your transcript (<file>).",
    the review's line of counts, and "Use another transcript" with "Choosing another
    transcript forgets your corrections."; when rows still need fixing, "<m> rows of your
    transcript still need fixing, so these answers are not exact yet. The pace may change
    too." with "Fix them";
    when no row was taken on, "No row of your transcript (<file>) was taken on, so these
    answers don't use it.";
  - under the card, why a file was not taken (the sentences of the upload);
  - the answers: "You already passed this" and "This slot is already filled" (the
    brief's), "Already in progress." (the owner's, 2026-11-16), all three drawn as
    "Doesn't count"; a "Counts" keeps its outlined mark and loses its
    condition; under the legacy question on a row that is no legacy course, "Your
    transcript has <code>, which counts as an elective only for legacy students.";
  - a sequence course whose pick another course already holds (the owner's words,
    2026-11-16): while the other sequence's pick is open, "Doesn't count — same slot as
    <course>. Take ENG 210 for the sequence.", drawn as "Doesn't count"; when both picks
    are held, "Needed for the history sequence (3 extra credits).", with no mark and no
    tint, its credits in the total only;
  - in the review step, under "Continue": "You'll go back to “Check my courses”."
- **Lines the design has no place for, on "Check my courses"** (agent's wording unless
  said otherwise; each listed for the owner in its pull request): with no courses, "Add
  the courses you plan to take next semester."; under the field, what to type and
  "<code> is already in your list."; the legacy question on a course's row (the owner's
  words) and, on a row that depends on it, "Answer “Are you a legacy CIS student?” to see
  this."; under the list, "Legacy CIS student: Yes" with "Change"; under "Total credits",
  the note below 12 or over 18 (the sentences of the pace controls); under the two counts,
  "Waiting for your legacy answer."; with the "Doesn't count" filter and nothing to
  list, "No course in your list is marked “Doesn't count”.".
- **"See what I have left" before the result: the upload and the review step** (F11). The
  approved design has the result page only. The upload is the Start page's drop zone,
  "Browse files" and privacy sentence, on its own. The review step is new, made of the
  design's pieces: under the heading "Check what was read", the terms as headings, each
  with its rows (code over the printed description; credits; the grade as printed and
  how the row stands); under each row "Edit" and "Not on my transcript" / "Put back"; at
  the end how many rows still need fixing, "Continue" and "Use another transcript". An
  open edit is a strip across the row with its fields, "Save" and "Cancel"; one row is
  edited at a time. A transfer row shows no credits when the transcript prints none.
  The layout and every word of it are the agent's, listed for the owner in F11's pull
  request (open question in `docs/decision-log.md`). Its words, all in `src/left.ts`:
  - the introduction: "This is what PathCheck read from <file>. Correct anything that was
    misread before you continue."; a heading "Term not read" for rows without a term;
    the columns "Course", "Credits", "Grade and what it means";
  - how a row stands: "Passed"; "In progress" with "No grade was read. Edit this row if
    the course already has one."; "Transfer credit"; "Doesn't count — below C";
    "Doesn't count — W" and "Doesn't count — I"; "Not in the CIS curriculum"; "<code>
    isn't in the current CIS curriculum" (the second half of the owner's sentence);
    "Needs fixing: <what>" (the term, the course code, the credits, the grade, …); "This
    line could not be read"; "Not on my transcript";
  - the edit: "Term", "Prefix", "Number", "Credits", "Grade" ("No grade yet" or a grade),
    "Transfer credit", "Save", "Cancel";
  - the end: "<n> rows still need fixing. They count nothing until fixed."; "Continue";
    "Use another transcript" with "Choosing another transcript forgets your
    corrections."; "No courses were read from this transcript."; after "Continue", "<n>
    rows taken on. <n> left out because they still need fixing. <n> left out as not on
    your transcript.";
  - when a file is not taken: "PathCheck can only read its two made-up transcripts for
    now. Nothing from this file was kept or sent."; "That file is not a PDF. Choose the
    unofficial transcript PDF from the portal."; "That file is too large to be a
    transcript. Nothing from it was read."; "That file could not be opened. Choose it
    again."; and, while a transcript is there, "To use another transcript, choose “Use
    another transcript” first.";
  - said to a screen reader only: "<code> saved.", "<code> still needs fixing: <what>.",
    "<code>: Not on my transcript.", "<code>: Put back."
- **The heading of "Check my courses" is "Check my courses", not a semester**, and the
  small label above it is left out so the page does not say it twice. The owner,
  2026-11-16: "no semester in the heading. It says "Check my courses". Nothing is derived
  from today's date."

## Open conflicts

None. Anything found later that conflicts with the brief is listed in the PR for the owner
and is not decided by the agent.
