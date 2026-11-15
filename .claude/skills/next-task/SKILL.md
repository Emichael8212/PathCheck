---
name: next-task
description: Implement, verify, merge and record the next failing feature in features.json (or the one named in the arguments), using a sprint contract agreed with the evaluator before coding. Stops at milestones.
---
Feature: $ARGUMENTS (if empty, the "Next feature" printed by `node scripts/status.mjs`:
the first entry of the current milestone in `features.json` with `"passes": false` that
is not BLOCKED: a line starting with BLOCKED under "## Result" in its `docs/sprints/<id>.md`). Never start a feature of a later
milestone before the owner has checked the current one.

You build. The `evaluator` subagent is QA. The `reviewer` subagent reviews code. They
talk through files in `docs/sprints/`. The spec is `docs/BRIEF.md` plus the owner answers in `docs/decision-log.md` (a dated
answer wins over the brief); if it does not
answer something, choose the simplest option and record it in `docs/decision-log.md` —
except academic rules, which you never invent: stop and ask the owner.

1. Run the session-start routine in CLAUDE.md. Fix regressions first.
2. `git fetch origin`. Resume check first: `git branch -a --list '*feat/<id>-*'` and
   `gh pr list --state open --search 'head:feat/<id>-'`. If a branch or open PR exists,
   check it out, read its `docs/sprints/<id>.md` and continue from the last recorded
   step. Otherwise create `feat/<id>-<short-name>` from `origin/main`.
3. Read only the brief sections this feature touches.
4. **Sprint contract.** Copy `docs/sprints/_template.md` to `docs/sprints/<id>.md` and
   write what the student gets, numbered acceptance checks (each names the test that
   will prove it) and out-of-scope items. Ask the `evaluator` (Mode 1, CONTRACT REVIEW)
   to review it; revise until it says AGREE (max 3 rounds; record each round). If there
   is still no AGREE after round 3, record BLOCKED with the disagreement, ask the owner
   if it is a scope or academic-rule question, and move to the next feature in the same
   milestone. Commit.
5. Implement with real behavior and tests; synthetic data only. Prefer deleting and
   simplifying over adding. Commit at each working step.
6. Self-check: `npm run check` (lint, typecheck, tests, build), plus any browser tests the
   change affects.
7. **QA.** Run the `evaluator` (Mode 2) against the contract. Record the round in the
   sprint file (verdict, scores, defects). On FAIL, fix and re-run. After 5 FAIL rounds,
   record BLOCKED in the sprint file with the remaining defects and move to the next
   feature in the same milestone.
8. Run the `reviewer` subagent on the diff; fix blockers and should-fix items.
9. In the same PR, set the feature's `"passes": true`, a one-line `"evidence"` (sprint
   file + QA verdict) and `"tests"` (the automated tests that prove it).
10. Open the PR following "PR format" in CLAUDE.md.
11. `gh pr checks --watch`. Green CI on the exact head and no reviewer blocker →
    `gh pr merge --squash --delete-branch`. Red CI → fix and repeat. Never use `--admin`.
12. If `node scripts/status.mjs` now shows the milestone is complete, **stop**: give the
    owner the URL and a 3–5 step checklist of what `features.json` `milestones` says they check.
    Record their answer in `docs/decision-log.md` and any disagreement with QA in the
    evaluator's Calibration section. Otherwise report in two lines and continue.
