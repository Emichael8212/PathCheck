# PR Information

- PR: #12 — Compose real account services and audit final application acceptance.
- Implementation commit: `d0aa51ea5715d28f95b772549a79cea4d83c6678`.
- Test type: integrated browser, real local Supabase Auth/REST, real synthetic Gemini.
- Feature: account composition, safe save/reopen/conflicts, search interruption and isolated upload.
- Human status: **NOT RUN**. Eligibility: **BLOCKED**.

# Before You Begin

Do not run this branch as final application acceptance yet. Required unmerged changes:
PR13 `a7fa58d`, PR11 `a23b04c`, PR14 `dd275b3`, PR15 `ba2e325`.
The lead's local-only composition has passing automated evidence; standalone PR12
is missing those implementations. After their human merges, refresh PR12 and pin
its exact new head before publishing the final combined setup commands.

# Step-by-Step Test

Pending that refreshed pin. Verified automated commands on the composed candidate
are `npm run check`, `npm run test:integration`,
`node tests/e2e/accounts/run.mjs --test`, and the separately configured
`node tests/e2e/upload/runLive.mjs --test`. The latter two require the dedicated
local services and server-only configuration; they are not standalone instructions.
No additional service or credential setup is requested at this blocked checkpoint.

The final human procedure must cover actual sign-in/save/reopen/conflict/recovery,
manual academic record acceptance, draft generation/cancellation, availability,
preview/apply/reject/undo, PDF export and isolated synthetic upload. It must use
current pinned sources and preserve existing human evidence for unchanged behavior.

# Expected Result

See IMPLEMENTATION_STATUS.md for observed automated results. No human PASS is claimed.

# Screenshot Checkpoint

Only after eligibility is established: the human captures browser outcomes and
attaches them directly to GitHub. Never capture OTPs, keys or private startup logs.

# Pass/Fail Criteria

Current result is BLOCKED eligibility / NOT RUN human. Passing candidate automation
does not waive required merges, current-head CI, independent reviews or human tests.

# Cleanup

No human service is started by this document. Agent-owned local services were stopped
following verification. Existing worktrees and images remain preserved.

# Known Limitations

Public extraction entry/gateway/bot integration and hosted isolation are still
unfinished engineering work. Real-transcript authorization, processing terms and
production deployment remain separate release gates. This document is a truthful
blocked handoff, not a runnable final acceptance procedure or completion claim.
