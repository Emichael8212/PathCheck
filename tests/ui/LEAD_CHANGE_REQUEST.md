# U → L change request: PR #6 redesign (UX-006 amendment)

Owner of every file below: **Codex Agent 1 (L)**. U has not edited any of them.

## 1. Integration journey helper (lead-owned `tests/e2e/integration/journey.spec.ts`)

**Issue:** The approved record flow replaces Review record → Accept this record → Continue to planner with automatic E
normalization and a single explicit "Accept and continue". That button still calls L `acceptRecord` with an
`accept_record` action.
**Evidence:** On a local, uncommitted scratch merge (L `09ee8cb`, E `645111c`, U `50f200d` (re-verified after the second refinement round), S `8d28602`, G `b37f4c2`;
port 5181 was occupied, so the scratch copy used 5182):
- Unchanged specs: `application.spec` PASS 1; journeys FAIL 9 at the removed `Review record` button.
- With the replacement below: `npm run test:integration` PASS 10/10. `PATHCHECK_TEST_BUILD=1` build smoke PASS 1. Units PASS 505 (2 skipped). U browser suite PASS 45 in the combined tree. Lint and typecheck PASS.

**Recommendation:** apply exactly this diff.

```diff
@@ async function start(
   await row.getByLabel('Grade (optional)', { exact: true }).fill(attempt.grade);
-  await page.getByRole('button', { name: 'Review record' }).click();
-  await expect(page.getByTestId('proposed-record')).toBeVisible();
-  await page.getByRole('button', { name: 'Accept this record' }).click();
+  await expect(page.getByTestId('record-summary')).toContainText('1 course checked');
+  await page.getByRole('button', { name: 'Accept and continue' }).click();
   await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
-  await page.getByRole('button', { name: 'Continue to planner' }).click();
   await page.getByRole('button', { name: /I already selected courses/ }).click();
@@ (two places)
-  await expect(page.getByTestId('issues')).toContainText('Prerequisite');
+  await expect(page.getByTestId('issues')).toContainText(/prerequisite/i);
```

`application.spec.ts` needs no change: with no rows the record screen still offers "Continue to planner".
The record summary keeps the `N course(s) checked` prefix that this diff waits for, including when E adds grade notes.
**Decision needed:** No (the user approved the flow); L applies the diff.

## 2. PR #6 human acceptance guide (`docs/acceptance/pr-6/PR_ACCEPTANCE_TEST.md`)

Re-pin from `541ba01` to the current PR #6 head and replace the record steps with the single "Accept and continue".
The visual design steps are in `tests/ui/VISUAL_ACCEPTANCE.md`; link or fold them in.

## 3. UX-006 amendment for `DECISIONS.md` (approved by the user 2026-11-13)

> **UX-006 amendment (approved):** Apple-inspired macOS-style workspace with restrained Liquid Glass.
> - **Glass:** only on the functional layer: toolbar, status/undo capsule, row popovers, record action bar, catalog search list and recommendation preview. Academic content stays on opaque surfaces. Opaque fallbacks for no `backdrop-filter`, reduced transparency, increased contrast and forced colors. No decorative gradients.
> - **Typography:** system stack `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; body 15/22, titles 26–32.
> - **Color:** accent #0B63CE, canvas #F5F6F8. All text tokens meet WCAG AA.
> - **Controls:** at least 40px on desktop and 44px below 1024px. Light theme only.
> - **Record flow:** automatic E normalization plus one explicit "Accept and continue" (L `acceptRecord`, `accept_record`).
> - **Planner:** Option B, a full-width semester list with a jump strip, plus a single-panel inspector. Previews name both affected semesters and show the finding delta, with no projected outlook (not in the `CandidatePreview` contract).
> - **Catalog status:** a synthetic or provisional catalog is identified on every screen.
> - Plain on-screen wording is mapped from engine codes; PDF wording is unchanged.

## 4. UX follow-up (no action now)

Searchable planner course selection: the planner "Course" stays a native `<select>` for this PR.
`journey.spec.ts` `add()` calls `selectOption` on it. A future combobox needs a coordinated selector change.
Existing selectors should not permanently dictate usability (user direction, 2026-11-13).

## 5. Contract limitation (report only; no UI workaround)

**Issue:** `AnalysisResult.outlook` carries `assumptionRefs` and `evidenceRefs`, but no reference to the findings that
set its `kind`. The UI cannot say *why* an outlook is `target_at_risk` without copying E's rule (service.ts:113–143) into
UI code, which the architecture forbids.
**Evidence:** Real E, empty plan, scratch merge with U `50f200d`:
- Fall 2027 with SYN 101 completed → `insufficient_evidence`.
- Spring 2027 → `target_at_risk` via `target_at_risk_chain` and `no_feasible_term_in_horizon`.
- Fall 2027 with an empty record → `target_at_risk` via the same chain findings.

The UI shows these as findings and "scheduling risks", but cannot link them to the outlook.
**Recommendation:** follow-up only, outside the current integration scope. An optional `outlook.reasonRefs: string[]`
(finding ids that determined `kind`), owned by L/E, would let the UI say "at risk because of…".
It is not needed for correctness: the UI shows E's outlook and findings verbatim and makes no causal claim.
**Decision needed:** No for now. Revisit after the MVP release gate; any change needs the usual contract approval.

## 6. Read-only candidate verification (2026-11-13) and observations for L

Candidate: L `09ee8cb` + E `645111c` + U `1103ab1` + S `8d28602` + G `b37f4c2` (local, uncommitted, discarded).
- **Checks:** lint PASS, typecheck PASS, units PASS 505 (2 skipped), build PASS. The build warns about a 553 kB chunk, a known nonblocking issue.
- **Lead specs as committed:** application PASS 1; journeys FAIL 9, all at the removed "Review record".
- **With the section 1 diff (scratch only):** integration PASS 10/10; `PATHCHECK_TEST_BUILD=1` smoke PASS 1; U browser suite PASS 48.
- **Foundation scaffold smoke** fails in the assembled tree. Your README says it is superseded there, so this is expected.
- **Real E in Chromium:**
  - Blocked record: alert, focus moves to Status, `recordRevision` unchanged.
  - Valid record: accepted once (`recordRevision` 1, SYN-101 provisional).
  - Empty planner: `insufficient_evidence`, plus the "no courses planned" line.
  - Draft: 2 rows; adopting gives `conditional_path_found`; Undo restores.
  - Empty record, Fall 2027: `target_at_risk` from chain findings.

Observations, none blocking U:
1. **E (question for the engine owner):** with SYN 101 completed and target Fall 2027, the empty-plan outlook is
   `insufficient_evidence`. `generateDraft` immediately finds a 2-course plan, and adopting it yields `conditional_path_found`.
   That is conservative rather than unsafe, but you may want E to confirm it is the intended empty-plan semantics.
2. **G:** `feat/gemini-extraction` (`b37f4c2`) exists only locally, with no remote branch or PR.
3. The PR #6 acceptance guide and UX-006 entry remain lead actions (sections 2–3).

## 7. Transcript review blockers after `0f1f258` (2026-11-13), U-owned fixes

These fixes were found in an independent review of `0f1f258`. Immediate revoke was fixed first in `b8aafc8`, and this change builds on it.
- **Revoke identity:** a revoke answer no longer updates global receipt/withdrawn state. Each send starts a UI run, and each run has at most one receipt. The answer applies only while its run is current. The server revoke for an older receipt is still always sent. A late success for upload A used to clear receipt B and show "Consent withdrawn". A late failure used to replace B with A.
- **Validated summary:** the success outcome now carries `validated.value.extraction` (G's envelope), not the raw extract response. The summary heading, completeness line, flagged count and row tables all use it.
- **Regressions:** 1 unit test and 4 browser tests, all using synthetic receipt IDs `receipt-1` and `receipt-2`:
  - optimistic raw → downgraded validated envelope (unit and browser);
  - late revoke success for A after B;
  - late revoke failure for A after B;
  - stopped A with held revoke, then B.
  The stopped-A test also asserts that revoke is sent before the held extract is released.
- **Against `b8aafc8` source with the new tests:** unit FAIL 1/20; browser FAIL 4/4.
- **Actual results with the fix:**
  - lint PASS;
  - typecheck PASS;
  - `npm test` PASS: 485 passed, 2 skipped, 25 files (1 skipped);
  - build PASS;
  - `npx playwright test -c tests/ui/browser/playwright.ui.config.ts` PASS 63/63;
  - `npm run test:e2e` PASS 1.
  
  Screenshots were not captured. No human acceptance is claimed.
- **Observation (not changed):** for an `invalid` outcome (G validation failed), the summary still renders the raw envelope next to the validation-failure alert. It never enters the record. It could, however, display a raw "Accepted"/"demonstrated" claim. A suggested follow-up is to hide those claims when validation fails.

## Contract conflicts

None. No changes to `src/contracts/**`, the engine, persistence, Gemini or state ownership.
