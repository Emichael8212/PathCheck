# PR Information

- PR number/title: #11 — Make account save, recovery and sign-out safe for current work.
- Exact head: `2a96a7763061a9657b72d462f2526e06a1e80fa4`.
- Base included: main `8fab5bfae66d38b5970db4d601f8325655962922` (PR13/15 merged).
- Test type: real React UI interactions and S guest recovery with synthetic auth/cloud doubles.
- Feature: preserve current work on late save/open/sign-in, explicit validated recovery choices, honest cleanup and disclosed restored assumptions.
- Human status: **PASS** (34 assertions and all eight manual cases reported by the human).
- Cleanup: **PASS**, executed by the lead under explicit user authorization. Status: **MERGED** personally as `b419682b83ecfa6d632bc8086b75737382e36496`.
- Current-head foundation CI43564599936 PASS; independent review retained because refresh changed no UI code.
- Reviewed UI implementation: `36c0624`; refresh changes no UI implementation/tests, only merged dependencies and guide counts.

# Before You Begin

Use Node24–26, npm, Git and Chrome. No API key, email delivery, database or transcript
is used. Port5179 must be free. Do not use an existing application tab or real data.
Reuse the owner's verified [detailed acceptance procedure](https://github.com/Emichael8212/PathCheck/blob/2a96a7763061a9657b72d462f2526e06a1e80fa4/tests/ui/ACCOUNT_SAFETY_ACCEPTANCE.md);
this index pins setup and stages without duplicating that guide.

**Stage1 — fresh pinned worktree:**

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-pr11-human
git worktree add /private/tmp/pathcheck-pr11-human \
  -b integration/pr11-human 2a96a7763061a9657b72d462f2526e06a1e80fa4
cd /private/tmp/pathcheck-pr11-human
npm ci --ignore-scripts
node node_modules/@playwright/test/cli.js install chromium
test "$(git rev-parse HEAD)" = 2a96a7763061a9657b72d462f2526e06a1e80fa4
printf 'PR11 pinned setup PASS — human UI tests NOT RUN\n'
)
```

Expected final setup message as printed. Stop on failure; never overwrite another worktree.

# Step-by-Step Test

**Stage2 — independently executable account UI assertions:**

```sh
cd /private/tmp/pathcheck-pr11-human
node node_modules/@playwright/test/cli.js test \
  -c tests/ui/browser/playwright.ui.config.ts tests/ui/browser/account.spec.ts
```

Expected34 PASS,0fail,0skip. This alone does not complete the human browser checks.

**Stage3 — interactive Chrome checks:**

```sh
cd /private/tmp/pathcheck-pr11-human
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5179 --strictPort
```

Open `http://127.0.0.1:5179/tests/ui/browser/harness/index.html?recovery=real`.
Follow the existing guide's eight numbered manual cases, one case at a time as
provided by the lead. Exact synthetic record: SYN101, Fall2026, Completed,
attempted3/earned3; target Fall2028. Explicitly Accept and continue, select the
already-selected-courses path and add SYN201 in Spring2027. The remaining cases
change query flags as specified, exercise late completions and multiple drafts,
and verify the exact visible outcomes. Synthetic sign-in uses student@example.test
and the fixture code123456; no real account or code is involved.

# Expected Result

Current work survives late async responses; canceled sign-in stays guest; expired
or changed stored drafts cannot be silently restored; multiple drafts require a
choice. Cleanup is confirmed and does not claim global erasure. See each case's
observable outcome/FAIL column in the linked guide. No academic claims come from
this UI harness; real engine integration is tested separately.

# Screenshot Checkpoint

Human captures the visible recovered course, preserved edits, explicit multiple-draft
choice and deletion warning at the guide's marked checkpoints, attaching directly to
GitHub. No screenshot path requested. The test fixture code is synthetic; do not
open real account or transcript information. Screenshots supplement assertions.

# Pass/Fail Criteria

Human must report all eight manual cases PASS plus34 automated assertions. Lost
edits, automatic ambiguous restoration, expired restore, canceled auth becoming
signed-in, false saved/deleted status, failed assertion or unexpected skip is FAIL.
Unavailable Chrome/tooling is BLOCKED. Agent execution never establishes human PASS.

# Cleanup

Stop Vite with Ctrl-C; close only these synthetic harness tabs. Clear only their
`pathcheck.*` Local Storage keys at origin `http://127.0.0.1:5179` as the owner's
guide specifies. Keep worktree; no database/VM cleanup is needed.

# Known Limitations

Real S recovery and real React components are exercised. Cloud/auth/academic services
are explicitly synthetic doubles except the noted real S auth client transport case.
This does not replace PR12's real OTP/REST/engine integration or final application
human acceptance. Previously accepted PR13 concurrency and PR15 security tests are
not being reopened. Public runtime and release/privacy gates remain separate.

# Recorded acceptance closure

Human reported34 automated assertions and all eight browser cases PASS at pinned
2a96a776. Case8 reused the two already-created synthetic drafts in a fresh tab
instead of recreating them; confirmation/cancel/explicit deletion and empty matching
storage checks passed. User explicitly delegated final cleanup to the lead.
Lead inspected Chrome's actual5179 origin with DevTools storage UI: local storage
had no keys and session storage was empty; old harness tabs were already closed.
Console pasting was blocked by Chrome; no security warning was bypassed. Temporary
account-disabled cleanup tab closed, only confirmed Vite PID74444 from the pinned
worktree stopped with SIGINT, port5179 verified without a listener. Other application
tabs/servers left intact; no screenshot captured.

Current head2a96a776 unchanged, CI43564599936 PASS, CLEAN against main. Independent
review applies to unchanged code; no blocking GitHub review threads. Human acceptance
is grounded in the user's reports, not the lead cleanup or automated reruns.
