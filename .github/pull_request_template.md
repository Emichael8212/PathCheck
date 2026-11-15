<!--
Title: 60 characters or fewer, "<type>(<ID>): <what changed>",
e.g. "feat(F09): answer whether each course counts". Without a feature ID use
"chore: …" or "docs: …". No vague words ("update", "misc").
Body: plain language, for a reader who has not followed the work.
Never invent PASS results. Merge only when CI is green on the exact head and the
reviewer reports no blocker; never bypass CI.
-->

## What changed
<!-- 2–4 sentences: what a student (or the developer) can now do, or what is fixed. -->

## Why
<!-- The problem this solves and the feature / brief section it delivers. One short paragraph. -->

## How to check it yourself
<!-- 3–6 numbered steps with what you should see.
     For config/docs-only PRs write "Not applicable — no visible change" and say what to read instead. -->
1.
2.
3.

## Tests and evidence
- Sprint contract and QA rounds: `docs/sprints/<ID>.md` — evaluator verdict <PASS/FAIL>, scores <Functionality/Clarity/Visual/Truthfulness> (omit for chore/docs PRs)
- `<exact command>` — <PASS (N tests) | FAIL (details) | NOT RUN (reason)>
- Reviewer: <No blocker | findings fixed>

## Risks
<!-- Known limitations, anything not verified, open questions for the owner. Write "None" only if genuinely none. -->
