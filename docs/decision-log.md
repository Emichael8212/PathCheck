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

- F01 does not pass, and its PR is not merged, until the owner approves a design for PathCheck.
  The evaluator's PASS is not enough on its own.

## Milestone checks

| Milestone | Date | Owner's answer |
|---|---|---|
| M0 | | (sequence rule confirmed 2026-11-15, see above) |
| M1 | | |
| M2 | | |
| M3 | | |
