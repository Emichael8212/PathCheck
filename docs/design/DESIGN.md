# PathCheck design

This is the design source for M1. It is the owner's own design, published at
https://color-nicks-25285809.figma.site/ (view "Combined · Your picks"), with the owner's
answers of 2026-11-15 applied (`docs/decision-log.md`, "Answers to the nine conflicts on
PR #4"). Colors, type, spacing and radii were read from the published site's computed styles.

- **Visual reference:** the screenshots in `docs/design/screens/`. They show the mockups
  after the owner's answers. If this file and a screenshot disagree, the screenshot wins.
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
| 3 What I have left | `left-*` | `left-open-*`: the three Done requirements opened with "Show courses"; `left-notes-*`: Fewest at 11 and Most at 19, both notes showing |

The screenshots of the published site as it stood before the owner's answers are in the git
history (commit c0169f4).

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
| Nav links, filters, tabs, footer, bar labels, status words, "Show courses" | 11–12px | 600–700 | |
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
  start of their parts; "121 total" under the right end. There is no legend.
- **Requirement bar:** one segment per credit, 12px high, 2px apart; counted segments are
  solid, the others outlined.
- **Open choice** (a pick or elective in the plan): a dashed left edge and the label "OPEN
  CHOICE". It is not a course.

## Shared pieces

- **Top bar:** wordmark (links to Start); two nav links, "Check my courses" and "What I have
  left", as pills (current page: `--accent` on `--accent-soft`); "Not an official degree
  audit." at the right. Below 650px the nav links are on a second row under the wordmark.
- **Footer:** top border; "Not an official degree audit." (bold) · "Curriculum last
  reviewed: Nov 2026" · "Report a mistake" (underlined email link); second line "Not
  affiliated with Alabama State University". 12px.
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
may cost extra." At 12 and 18 there is no note.

**Requirements.** Label "THE REST OF YOUR DEGREE", heading, and an "All / Not done" pill
toggle at the right; one line: "Credits counted / needed." Nine cards (white, radius 12,
8px apart). Each has a row with columns `220px 150px 1fr 80px 112px`: name · status mark
and word · segmented bar · "3 / 12 cr" · (on Done rows) "Show courses".

- **In progress and Still needed** requirements show their courses straight away, under the
  row: up to three columns (Done, In progress, Still needed), each a small titled list of
  code + title.
- **Done** requirements are collapsed. "Show courses" opens the list of the courses that
  filled them; it then reads "Hide courses".

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
name and status, the bar, then credits (and "Show courses" at the right on Done rows). The
course lists stack. Each semester is a header band (term left, credits right) over a list
with "Move later" at the right of each entry. The two action buttons wrap.

**Print.** The top bar, the toggle, "Show courses", "Move later" and the action buttons are
not printed; every requirement prints opened; the ring, bars and tinted rows are printed;
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
  "Show courses".
- e. "Fewest" and "Most" credits per term, both editable, with neutral notes and no hard limit.
- f. No uppercase grey table header; no legend (the bar is labelled directly). Pill-shaped
  tabs, the indigo main button and the numbered chips are kept.
- g. "Counts" and "Done" have different marks; all five statuses differ.
- h. 12 count toward CIS, everywhere.
- i. The privacy sentence is "Your PDF is read, then deleted. Only your result stays in this
  browser."

## Open conflicts

None. Anything found later that conflicts with the brief is listed in the PR for the owner
and is not decided by the agent.
