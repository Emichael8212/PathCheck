# PR Information

- PR: [#8 — secure transcript extraction runtime](https://github.com/Emichael8212/PathCheck/pull/8).
- Implementation SHA: `6e29425404a7a53bf7e7a6da19d477b49e89469a`.
- Test type: live synthetic PDF browser/API integration.
- Feature: consent, admission, PDF extraction, raw-row proposals and bounded retries.
- Human status: **NOT RUN**. Eligibility: **READY for combined human verification**.
- Required `foundation` CI 43521373169 PASS; independent findings resolved.

## Before You Begin

Use only the generated synthetic fixture and existing private server configuration.
This test composes PR #8 with PR #6 UI, PR #9 integration and merged PR #7 admission.
Exact dependency SHAs, tools, setup and privacy safeguards are in the single
[combined acceptance procedure](../pr-9/PR_ACCEPTANCE_TEST.md). Do not create a
second checkout or repeat the completed extraction benchmark.

## Step-by-Step Test

Follow Stages 1–5 of that procedure. It supplies every command, exact Chrome URL,
fixture download, consent/upload action, expected raw fields, explicit academic
acceptance and real planner preview/apply/undo steps. PR #8's assertions are actual
Google extraction and raw-row validation under one admission; E retains sole
catalog-matching and academic authority. No simulated provider is used in that run.

## Expected Result

One real Google result contains exactly the labeled SYN 101 attempt: Fall 2026,
3 attempted/earned credits, B, completed. No extra/omitted rows. Explicit acceptance
alone commits the academic record and moves to the planner. The safe evidence page
shows one admission/dispatch/settlement and final Google HTTP 200.

## Screenshot Checkpoint

Capture the proposed-row summary and subsequent planner states as specified in the
combined guide; attach them directly to GitHub. No env files, cookies, tokens or
startup logs. The agent does not capture screenshots or request their paths.

## Pass/Fail Criteria

All combined assertions must pass. Human status stays NOT RUN until your report.
Wrong fields, omissions, silent acceptance or incorrect mutations are FAIL;
provider unavailability is BLOCKED. Agent live PASS is separate evidence.

## Cleanup

Use the combined guide's Ctrl-C, local Supabase stop and dedicated Colima stop
commands. Preserve the worktree and usage ledger. No hosted service is touched.

## Known Limitations

The local fixture-only runtime does not approve public bot/gateway enforcement,
resource-isolated PDF processing or real-transcript data handling. Those remain
mandatory for their applicable runtime/release scope. The public real-data endpoint
remains disabled. Simulated retry/revoke tests prove error handling separately;
the successful live run did not encounter a Google 503. Synthetic benchmark results
remain in [measured evidence](../../testing/transcript-synthetic-benchmark.md).
