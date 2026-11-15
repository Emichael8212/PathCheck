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
| `lastReviewed` in the curriculum file is `null`. | The owner provides the date of the last curriculum review before M3 (brief §12). | Set the date. |
| Evaluator calibration lives in `.claude/agents/evaluator.md`; there is no separate status or calibration document. | Fewer files to keep in sync. | Move the section to its own file. |

## Open questions for the owner

Asked in the setup PR (#1); answers get recorded here.

1. Titles and credits for FIN 201, FLS 161, MGT 220 and MGT 203 (the data has only their codes).
2. Elective courses matched only by the rule (e.g. a 400-level MKT course): what title and credits does Flow A show without a transcript?
3. Two typed courses for the same slot without a transcript (e.g. ENG 131 and ENG 140): what does the second one say?
4. "Below C": does the transcript show plus/minus grades (is C− below C), and do pass-type grades (P, S, CR) count?
5. Sequence rule reading (M0).

## Milestone checks

| Milestone | Date | Owner's answer |
|---|---|---|
| M0 | | |
| M1 | | |
| M2 | | |
| M3 | | |
