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
**Recommendation:** optional contract addition `outlook.reasonRefs: string[]` (finding ids that determined `kind`), owned by L/E.
**Decision needed:** Yes, by L, when convenient. It does not block PR #6.

## Contract conflicts

None. No changes to `src/contracts/**`, the engine, persistence, Gemini or state ownership.
