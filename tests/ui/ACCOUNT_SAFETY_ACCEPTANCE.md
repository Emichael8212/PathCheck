# PR #11 U account safety and guest recovery: human acceptance procedure

For L to index under `docs/acceptance/pr-11/`. Human status: **NOT RUN**. Agent test results never imply a human PASS.

## What is being accepted

- **Implementation:** branch `feat/frontend-account-safety`, merged with `origin/main` `ef6ba14ae69986f8fbdeb4e55f930b25482f2cd8` (includes S PR #13). Tested SHA = the PR #11 head named in the PR's Evidence section. Check it with `git rev-parse HEAD`.
- **Scope:** independent UI behavior only, in `AccountPanel` and the `PathCheckWorkflow` account/recovery wiring.
  - **Real S code used:** recovery service, `clearSavedGuestDraft`, `listGuestRecoveryChoices`/`selectGuestRecoveryChoice`, and (for step 5) `createSupabaseAuth` against a synthetic in-page Auth endpoint.
  - **Synthetic:** cloud storage and the normal auth path are test doubles.
- **Not covered here:** the real OTP email, live Supabase saves, opening plans and the real account composition. Those are L's integration, accepted separately. The PR #11 behavior that needs human acceptance is the UI behavior below.

## Prerequisites

Node ≥24, `npm ci`, Playwright Chromium installed, port 5179 free. Use Chrome with DevTools available. All data is synthetic.

## 1. Automated checks (expected PASS, with zero skips in the UI suites)

```sh
git rev-parse HEAD
npx playwright test -c tests/ui/browser/playwright.ui.config.ts tests/ui/browser/account.spec.ts   # 33 passed, 0 skipped
npx playwright test -c tests/ui/browser/playwright.ui.config.ts                                     # 101 passed, 0 skipped
npm run lint && npm run typecheck && npm test                                                       # 724 passed, 2 skipped
npm run build
```

- The 2 skipped tests in `npm test` are the documented live-database checks. Any other skip, any failure, or a lower count is a **FAIL**.

## 2. Manual checks

Start the harness: `npx vite --host 127.0.0.1 --port 5179 --strictPort`. The base URL is
`http://127.0.0.1:5179/tests/ui/browser/harness/index.html`. Before each check, open a **new tab** for the given query.

"Reach the planner" means: choose a program and Fall 2028, add a completed `SYN 101` row, click Accept and continue, choose "I already selected courses", then add SYN 201 in Spring 2027.

| # | Open | Steps | Expected (PASS) | FAIL if |
|---|---|---|---|---|
| 1 | `?recovery=real` | Reach the planner. Reload the page. Click Restore draft. | A "Recovered draft" banner appears. Restore brings back SYN 201 and the menu says assumptions use the defaults. *Screenshot.* | No banner, or SYN 201 is missing. |
| 2 | `?recovery=real` | Reach the planner and reload. Before clicking Restore, run `window.__pathcheckHarness.advanceClock(7*3600000)` in DevTools, then click Restore draft. | The message says the draft is no longer available. The start screen remains and nothing is restored. | The plan is restored. |
| 3 | `?recovery=real&hold=save` | Reach the planner. Sign in (any email, code `123456`) and click Save as new. While it shows "Saving…", add SYN 202. Run `window.__pathcheckHarness.release('save')`. | Both courses stay on screen and the menu doesn't say "Saved". The message says the newer changes aren't saved. *Screenshot.* | Either course disappears, or the menu says "Saved". |
| 4 | `?signout=unconfirmed` | Reach the planner, sign in, Save as new, then Sign out. | The message says the server didn't confirm. The menu says "Guest, not saved", the start screen shows, and no saved plans are listed. | Signed-in UI or plans are still shown. |
| 5 | `?auth=real&hold=verify&recovery=real` | Reach the planner. Request a code, enter `123456`, click Verify, then click Cancel. Run `window.__pathcheckHarness.release('verify')`, then `await window.__pathcheckHarness.currentUser()`. | The menu stays "Guest, not saved" and the guest work is unchanged. `currentUser()` returns `{ ok: true, value: null }`. | Anything shows a signed-in state. |
| 6 | `?hold=open` | Sign in and Save as new twice, adding a course in between. Open My saved plans and click Open on the first plan. Add a course, then run `window.__pathcheckHarness.release('open:cloud-1')`. | "…so it was not opened" appears and the edit stays. *Screenshot.* | The edit is lost. |
| 7 | `?recovery=real` | **Several drafts.** In tab A, reach the planner. Open the account menu, tick "Also keep a recovery draft… 24 hours", enter an email and click Email me a code. In tab B, repeat with a different course (SYN 202). In a fresh tab C, open the same URL. | C shows a "Recovery drafts" banner with two entries, each with target, date and counts, and nothing is auto-restored. "Restore this draft" on one restores it. *Screenshot.* | A draft is restored without a click, or the problem is not shown. |
| 8 | `?recovery=real` | Repeat step 7 up to tab C's banner, without restoring. In tab C, click "Delete stored recovery drafts…" and read the warning. Click "Keep them", then open it again and confirm. | Before you confirm, the warning says drafts from other tabs are deleted, that a draft saved by another tab at the same moment may not be removed, and that this is not erasure of other browser data. If work is on screen, it names that work as the exception. Afterwards DevTools → Application → Local Storage has no `pathcheck.guestDraft.v1*` keys. *Screenshot of the warning.* | The text claims all data was erased, or drafts are deleted before you confirm. |

## Cleanup

Stop vite and close the harness tabs. Then, in DevTools for `127.0.0.1:5179`, clear the `pathcheck.*` keys from Local Storage.

## Limitations

- Every check uses synthetic doubles; none uses live Supabase or real email.
- S's guarantees on concurrent cross-tab writes were accepted under S PR #13.
- Stale-choice and partial-delete failures are covered only by automated tests.

## Evidence to return

The SHA, each command's counts, PASS/FAIL for each manual step, the screenshots marked above, and any message text that differs from the expected wording.
