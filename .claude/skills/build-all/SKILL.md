---
name: build-all
description: Work through the current milestone's features in features.json without waiting, stopping at the milestone and for logins/secrets, money and academic-rule questions.
disable-model-invocation: true
---
Build the current milestone of `docs/BRIEF.md` §10 without waiting for me.

- Repeat the `/next-task` workflow, one feature per PR, until every `features.json`
  entry of the current milestone passes with evidence.
- Start every new session with the CLAUDE.md routine so you never build on a broken base.
- Decide small, reversible things yourself (simplest option); record them in
  `docs/decision-log.md` and the PR.
- Stop and ask only for: the milestone check (M0–M3), logins/secrets, anything that
  costs money, and academic-rule questions. While waiting on a secret or a rule, continue
  with any independent feature of the same milestone. Never go past a milestone.
- Never weaken or delete a test, flip `passes` without evidence, change a feature's
  `description` or `steps`, or build anything on the brief's "Not built" list.

When the milestone is done, report: what to open, the 3–5 steps to check, PRs merged,
and anything still open.
