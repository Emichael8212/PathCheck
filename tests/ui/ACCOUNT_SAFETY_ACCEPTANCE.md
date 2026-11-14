# U account-safety — human acceptance draft (for L to index under docs/acceptance/pr-N/)

Human status: **NOT RUN**. Agent test results never imply human PASS.

- Implementation: branch `feat/frontend-account-safety`, base `origin/main` c6ab714bf5004bcc99d0c47e123e5c4750cfc09e; tested SHA = PR head commit.
- Scope: UI only (`AccountPanel`, `PathCheckWorkflow` account wiring). Uses S's existing `clearSavedGuestDraft`, real `createGuestRecoveryService` and (for cancel) real `createSupabaseAuth` over a synthetic in-page Auth endpoint; storage is a synthetic test double. Root app still composes `account: null`, so the real OTP/Supabase browser journey is L's composition work and is not covered here.

## Prerequisites

Node ≥24, `npm ci`, Playwright Chromium installed, port 5179 free.

## Commands (expected PASS)

```sh
npx playwright test -c tests/ui/browser/playwright.ui.config.ts tests/ui/browser/account.spec.ts   # 19 passed
npx playwright test -c tests/ui/browser/playwright.ui.config.ts                                     # 87 passed
npm run lint && npm run typecheck && npm test                                                       # 674 passed, 2 skipped
```

FAIL if any test fails or a count is lower.

## Manual checks (harness, synthetic data)

Run `npx vite --host 127.0.0.1 --port 5179 --strictPort`, then open
`http://127.0.0.1:5179/tests/ui/browser/harness/index.html?recovery=real&hold=save`.

1. Choose a program and Fall 2028, add completed `SYN 101`, accept, choose "I already selected courses", then add SYN 201 in Spring 2027. Reload the page. Expected: a "Recovered draft" banner appears, and Restore brings back SYN 201. *Screenshot checkpoint.*
2. Open the account menu and sign in with any email and code `123456`. Click Save as new. While it shows "Saving…", add SYN 202. In DevTools run `window.__pathcheckHarness.release('save')`. Expected: both courses stay on screen, the menu does not say "Saved", and the message says your newer changes are not saved. *Screenshot checkpoint.*
3. Click Save as new again. Expected: "Saved". DevTools `sessionStorage` has no `pathcheck.guestDraft.v1`.
4. Open `?signout=unconfirmed`, sign in, save, then sign out. Expected: the message says the server did not confirm, the menu shows "Guest, not saved", the start screen appears and no saved plans are listed.

5. Open `?auth=real&hold=verify&recovery=real`. Reach the planner and request a code, enter `123456` and click Verify, then click Cancel. In DevTools run `window.__pathcheckHarness.release('verify')`. Expected: the menu stays "Guest, not saved", the sign-in form is shown, your guest work is unchanged, and `await window.__pathcheckHarness.currentUser()` returns `{ ok: true, value: null }`.
6. Open `?hold=open`, sign in and Save as new twice (adding a course in between), then open My saved plans. Click Open on the first plan and add a course before running `window.__pathcheckHarness.release('open:cloud-1')`. Expected: "so it was not opened" appears and your edit stays. *Screenshot checkpoint.*
7. Change planning assumptions to 18 credits with summer, then Open a saved plan. Expected: "15 cr/term, no summer" and a message stating the defaults.

Cleanup: stop vite and close the tab (sessionStorage is per tab). Limitations: these checks use synthetic doubles, not live Supabase. Cross-tab atomicity of the shared slot is an S/L item.
