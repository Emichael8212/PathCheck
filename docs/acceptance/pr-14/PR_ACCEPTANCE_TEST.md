# PR Information

- PR number/title: #14 — Add cancellable asynchronous draft generation controls.
- PR head: `cbbf0df100e733543073120000ef8a0db4b53054`.
- Lead worker/command dependency: `c023b00ebb85d6e812d4aa1d81e820fcc8a96fda` (PR12 implementation, includes human-merged main b419682).
- Reproducible noncommitting candidate tree: `8bccb542f8914c74a2a2e1b277ba87ba43448412`.
- Test type: Chrome UI with real E academic engine, real L Worker/watchdog/commands and U controls. Synthetic catalog/time only; no canned academic result.
- Human status: **NOT RUN**. Eligibility: **HUMAN ACCEPTANCE REQUIRED**.
- Current-head CI43569084094 PASS; independent source and procedure review found no blocker.
- Agent verified exact Stage2 command4 PASS; full candidate741unit/18integration/114UI PASS.

# Before You Begin

Node24–26/npm, Git, Chrome and Playwright Chromium; port5181 free. No database,
API key, account, transcript or external service required. Preserve other worktrees.
This uses a local-only, uncommitted combination because the actual L Worker adapter
belongs to PR12. It does not authorize merging PR12 before PR14 or committing this
candidate. PR14's isolated UI checks supplement, not replace, this real-engine test.

**Stage1 — exact pinned composition:**

```sh
(
set -eu
cd /Users/_eman5michael/PathCheck
git fetch origin
test ! -e /private/tmp/pathcheck-pr14-human
git worktree add /private/tmp/pathcheck-pr14-human \
  -b integration/pr14-human c023b00ebb85d6e812d4aa1d81e820fcc8a96fda
cd /private/tmp/pathcheck-pr14-human
git merge --no-commit --no-ff cbbf0df100e733543073120000ef8a0db4b53054
npm ci --ignore-scripts
node node_modules/@playwright/test/cli.js install chromium
test "$(git rev-parse HEAD)" = c023b00ebb85d6e812d4aa1d81e820fcc8a96fda
test "$(git rev-parse MERGE_HEAD)" = cbbf0df100e733543073120000ef8a0db4b53054
test "$(git write-tree)" = 8bccb542f8914c74a2a2e1b277ba87ba43448412
printf 'PR14 pinned setup PASS — human cancellation tests NOT RUN\n'
)
```

Expected final message. Stop on failed pin/conflict; never commit or push this worktree.

# Step-by-Step Test

**Stage2 — actual Worker and UI assertions:**

```sh
cd /private/tmp/pathcheck-pr14-human
npm run test:integration -- --grep 'actual.*worker|real UI'
```

Expected4 PASS/0fail/0skip. Includes real Worker output equality and interruption
AFTER actual E work starts, UI cancel and watchdog, exact unchanged active Plan.

**Stage3 — Chrome cancellation:**

```sh
cd /private/tmp/pathcheck-pr14-human
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5181 --strictPort
```

Keep terminal running. Open in Chrome:
`http://127.0.0.1:5181/tests/e2e/integration/index.html?generation=held`

1. Choose the supported **synthetic** program and target **Fall2027**; Continue as guest.
2. Add course attempt SYN101, Fall2026, Completed, attempted3, earned3, gradeB.
3. Accept and continue. Choose I already selected courses. Add SYN201 in Spring2027.
4. Note the active timeline contains SYN201. Click Help me build a plan.
5. While Building a draft plan… appears, click **Cancel search** promptly (within30seconds).
6. Expect **Search interrupted**, **You cancelled the search**, and an explanation
   that no draft was evaluated/no feasibility conclusion drawn. SYN201 stays in
   Spring2027; no generated draft is adopted. Search again is offered.

This test-only Worker does one real E search step then holds continuation, making
cancellation observable. It does not fabricate a draft or academic result. The
ordinary production worker yields/resumes normally, verified by Stage2.

**Stage4 — automatic interruption:**

Open a fresh tab:
`http://127.0.0.1:5181/tests/e2e/integration/index.html?generation=watchdog`

Repeat Stage3 steps1–4 with the same data. **Do not click Cancel.** After about5seconds
expect **Search interrupted** and **The search was stopped before it finished**.
It must explain that no feasibility conclusion was drawn, preserve SYN201 in
Spring2027, and offer Search again. It must not claim no valid schedule exists.
The5second watchdog is an explicit test setting; no university/search policy changed.

# Expected Result

User cancellation and watchdog stop actual background engine work without applying
partial results, changing the active plan or concluding graduation is impossible.
The4 deterministic assertions verify state equality and real-work start beyond what
screenshots alone prove. Synthetic rules are not ASU requirements.

# Screenshot Checkpoint

Human captures each interrupted panel with unchanged Spring2027 SYN201 timeline and
Stage2 terminal4PASS summary; attach directly to GitHub. No screenshots by agents and
no screenshot paths requested. No sensitive data/secrets are used in this procedure.

# Pass/Fail Criteria

PASS requires4 assertions and both manual cases. FAIL if cancel is missing, search
never reports interruption, active plan changes, a partial draft is adopted, or an
interruption is presented as a completed no-valid-draft/feasibility conclusion.
If cancellation occurs after the30second watchdog, repeat only that manual case;
it has not verified user cancellation yet. Human status remains NOT RUN until report.

# Cleanup

Close these two synthetic tabs and press Ctrl-C in the5181 Vite terminal. There is
no account recovery/cloud data in this engine harness. Keep the uncommitted worktree;
do not commit, push, reset or remove it. No VM/database cleanup required.

# Known Limitations

This accepts PR14 controls with the actual unmerged L adapter. PR12 still requires
its own current-head CI after PR14 lands, independent review and broader account/
integration human acceptance. It does not clear public extraction/gateway/bot,
hosted isolation, real-data processing terms or deployment gates. Prior PR11/13/15
human acceptance is preserved, not repeated here.
