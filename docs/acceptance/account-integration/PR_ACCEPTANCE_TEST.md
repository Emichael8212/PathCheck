# PR Information

- PR number/title: pending draft — Compose real account services and audit final acceptance.
- Implementation SHA: pending first commit on `feat/integration-03`; base `c6ab714bf5004bcc99d0c47e123e5c4750cfc09e`.
- UI dependency: PR11 `7beea3f4dd005147af933fb3e0b87c09abfa2827`.
- Test type: real local email OTP, browser and PostgreSQL/PostgREST.
- Feature: optional account composition, preservation of a synthetic record/plan through save and second-device reopen; build/diagnostic privacy guards.
- Human status: **NOT RUN**. Eligibility: **BLOCKED**, pending recovery-race correction, combined regression and current-head review/CI. This is not the final whole-application acceptance procedure.

## Before You Begin

Do not run as a final acceptance gate yet. The lead must pin the approved combined
candidate and close the named dependencies. These verified commands document the
local procedure; they do not authorize a merge or establish human PASS.

Tools: Node24–26, npm, Chromium, Colima, Docker, Supabase CLI. Required environment:
isolated `pathcheck-test` Colima profile/context `colima-pathcheck-test`; only
127.0.0.1 bindings API55431, DB55432, mail55434; project `pathcheck-local-test`.
No hosted project reference, production credentials, Gemini key or real student data.
The candidate's `supabase/templates/sign-in-code.html` must be accessible through
its Colima-mounted worktree. An unmounted path silently becomes a directory mount
and cannot deliver OTP codes. The existing mounted synthetic stack can be reused;
final pinned setup instructions will name its path before human eligibility changes.

From the pinned candidate, with that isolated stack already verified:

```sh
npm ci --ignore-scripts
node node_modules/@playwright/test/cli.js install chromium
npm run test:account-guards
node tests/e2e/accounts/run.mjs --test
```

Expected: four privacy/config guard tests PASS; one real OTP/save/reopen test PASS.
The two-device test takes at least61seconds to respect the server's email resend
limit. It never prints codes or tokens, and disables screenshots/traces/video.
It uses actual S services and the engine, not injected account tokens or canned
academic results. Guard probes intentionally cause child failures and assert
redaction; their outer tests must PASS.

## Step-by-Step Test

1. Start the browser entry:
   ```sh
   node tests/e2e/accounts/run.mjs --serve
   ```
   Open **http://127.0.0.1:5188/** in Chrome. Keep the terminal running.
2. Select ASU B.S. CIS **Current departmental curriculum**, target **Fall2027**,
   then Continue as guest. Enter one fictional attempt: **CIS300**, Fall2026,
   Completed, attempted3, earned3, gradeB. Require **In catalog**. Accept and
   continue, choose already-selected courses, add **CIS351** in Spring2027.
3. Open the account menu. Use a unique synthetic address such as
   `human-final-001@pathcheck.test`; request a code. Open
   **http://127.0.0.1:55434/**, read only that message, and enter its code in the
   original PathCheck tab. Do not photograph or share the code/email body.
4. Require signed-in status with the same record and timeline, and no implicit
   saved plan. Choose Save as new, then My saved plans. Require one saved plan.
5. At least61seconds after the first code request, open an Incognito Chrome
   window at **http://127.0.0.1:5188/** and sign into the same synthetic address
   using a fresh code. Open My saved plans and Open the plan. Require CIS351 in
   Spring2027 and an explicitly uncertain academic outlook. On Academic record,
   open Edit and verify CIS300, Completed, gradeB,3 attempted/3 earned.
6. Do not report complete-application PASS from these steps: cross-tab recovery,
   cloud conflicts, deletion and the remaining final integration scenarios require
   their own verified procedures before the final gate is eligible.

## Expected Result

The real local account holds the submitted structured course record and plan.
Reopening recomputes an uncertain result from actual engine rules. No verified
ASU graduation guarantee, official offering, or new academic policy is invented.

## Screenshot Checkpoint

After reopening, capture the planner showing CIS351/Spring2027, signed-in saved
status and uncertain outlook. Separately capture the reopened CIS300 record fields.
Never include the mailbox, OTP, developer network headers or local service status
JSON. You capture and attach evidence directly to GitHub; no file paths requested.

## Pass/Fail Criteria

PASS for this scoped test requires correct preserved record/plan, real OTP and
save/reopen, four guard assertions and zero browser/runtime failures. Missing local
infrastructure is BLOCKED. Wrong fields, implicit cloud creation, lost work or
misleading academic certainty is FAIL. Human status changes only on your report.

## Cleanup

Stop the launcher with Ctrl-C. Close the synthetic tabs. If no other acceptance
run is using the isolated stack, from its mounted candidate worktree:

```sh
DOCKER_CONTEXT=colima-pathcheck-test supabase stop
colima stop pathcheck-test
```

Synthetic local database backups remain; no production data or project work is deleted.

## Known Limitations

This procedure is **not yet eligible** and is not final F01–F20 acceptance. It does
not prove live transcript upload in this account entry, simultaneous recovery,
conflict resolution, protected deletion, browser search interruption, hosted
security, real-transcript approval or deployment readiness. Prior scoped human
acceptance remains valid for unchanged tested behavior.
