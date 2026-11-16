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
| Curriculum file keeps its name `docs/curriculum/provisional-current.json`; "CIS 300/400-level" is stored as course numbers 300–499. | Name kept as carried over. 300–499 is the plain reading of "300/400-level". | Rename the file / edit `electives.subjectRule`. |
| The curriculum keeps titles for FIN 201, FLS 161, MGT 203 and MGT 220 from the 2025–2027 catalog; every other title is from the departmental guide. | Sources as given by the owner. | Edit the data file. |
| `lastReviewed` in the curriculum file is `null`. | The owner provides the date of the last curriculum review before M3 (brief §12). | Set the date. |
| Evaluator calibration lives in `.claude/agents/evaluator.md`; there is no separate status or calibration document. | Fewer files to keep in sync. | Move the section to its own file. |

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

## Milestone checks

| Milestone | Date | Owner's answer |
|---|---|---|
| M0 | | (sequence rule confirmed 2026-11-15, see above) |
| M1 | | |
| M2 | | |
| M3 | | |
