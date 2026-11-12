<!-- PathCheck PR: concise technical evidence, normally 100–200 words or fewer. Delete prompts and irrelevant evidence. Never invent PASS results. A required FAIL/BLOCKED/NOT RUN prevents merge readiness. Only the human personally performs GitHub merges. Except for the working contracts/CI foundation PR, feature PRs must contain functional code and cannot be mockup/skeleton/stub-only. -->

## Summary

- <Change 1 — link to MVP feature ID, e.g. F07>
- <Change 2, if needed>
- <Change 3, if needed>
<!-- One sentence explaining why, only if not obvious. -->

## Tests

- `<exact executed command>` — <PASS (N tests) | FAIL (details) | BLOCKED (reason) | NOT RUN (reason)>
<!-- Include only relevant checks. Report actual results; no default PASS text. -->
<!-- If a required check is BLOCKED/NOT RUN, add compact handoff: missing access/dependency; exact command or manual steps; expected result; failure indicator; evidence to return. Link a detailed test note only if necessary. Do not assign already-passed tests to the human. -->

## Evidence

- <UI: screenshot link + browser interaction result; OR logic: input → expected → actual; OR security: allowed/denied access test. Omit inapplicable categories.>

## Known Issues

- <Actual limitation, blocker or failing test; write "None" only if genuinely none known.>

<!-- PR readiness requires executable tests actually passing and functioning owned implementation; a screenshot or test double alone is not proof. The lead sends PR URL, test status, risks and recommendation. Agents never push main or merge, including after approval; human alone merges in GitHub. Production deployment needs separate human approval. -->
