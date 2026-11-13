# PathCheck — ARCH-005 Test and Release Plan

**Status:** User approved ARCH-005 gates on 2026-11-11. **Owner of final signoff and personal execution of each GitHub PR merge, plus separate production deployment authorization:** Human engineer; lead integrator reviews and produces evidence.  
This document defines **feature completion**, not relative priority. Every F01–F20 feature in `PROJECT_SPEC.md` is required for a complete MVP. Synthetic tests prove algorithmic behavior but are not substitutes for independently reconciled real academic rules or authorized real-transcript testing.

## 1. Test levels, evidence and release decision

- **Unit/property tests (Vitest):** shared contract schemas, credit allocations, prerequisite evaluator, scheduling search and state transitions. Repeat runs yield same results.
- **Academic source review:** manually reviewed matrix mapping every modeled rule to a primary official source, user-provided interpretation, policy qualification and resolved/unresolved state. Independent spot checks of source values.
- **Gemini benchmark:** labeled PDF fixtures with attempt- and field-level ground truth; compare extracted rows against *all* actual rows; test rejection and consent, not just schema validity.
- **Supabase security tests:** SQL RLS/grants checks with two users + anonymous role; permitted and denied CRUD; account deletion and redirect/migration tests.
- **E2E/browser tests (Playwright):** both journeys, manual and Gemini paths, guest and signed-in, responsive timeline, PDF download and recovery; no mocked happy-path engine in final E2E.
- **Release evidence:** a dated report per gate with fixtures, exact commands and actual outcomes, known blockers, source version, human review and explicit production authorization; no release when any mandatory gate fails.

**Statuses:** `PASS` (tested and evidence logged), `BLOCKED` (missing authoritative external input), `FAIL` (known defect), `NOT_RUN` (unverified). Only PASS is complete. A successful build or green UI screenshot is never enough.

## 1A. Required PR testing and professional evidence format

**No mockup-only feature PRs:** Except for the initial working contracts/CI foundation PR, every feature PR must implement functioning behavior within its assigned module, with passed independent tests. Static UI, inert buttons, PDF shells, stub-only integrations and canned academic results do not qualify. Gemini/Supabase PRs require actual integration implementations and applicable tests; isolated test doubles are permitted during development but do not prove integrated/live behavior. Screenshots never replace interaction tests. The foundation exception must still pass contract, build and CI acceptance checks.

**Applies to every PR, including lead-owned contracts, integration and CI changes.** All five agents must run every test reasonably executable in their own isolated worktree, fix owned failures, commit/push and open a PR. CI checks run independently on each PR. Use `.github/pull_request_template.md` with exactly these sections: `Summary`, `Tests`, `Evidence`, `Known Issues`. Routine descriptions should be **100–200 words or fewer**, with up to three summary bullets, technical facts only; do not copy large design explanations into PRs.

- **Tests:** list exact executed commands, real outcome (`PASS`, `FAIL`, `BLOCKED`, `NOT RUN`) and actual counts/error summaries when available. Examples such as `npm run typecheck`, `npm test`, `npm run build` are **not** pre-approved PASS evidence. Never invent screenshots, logs, results, scan output or successful graduation outcomes. A checked box is not evidence.
- **Evidence when applicable:** UI screenshot **plus actual interaction test**, logical test input → expected → actual (especially audit/scheduling), security negative/positive authorization cases (especially RLS/grants); omit inapplicable evidence classes. Preserve actual test files and non-sensitive fixtures in the repository.
- **Unexecutable mandatory test:** mark `BLOCKED` or `NOT RUN`, explain cause and missing dependency/permission; give **exact** human command/manual steps, expected successful observation, failure indicators and evidence to return. Link detailed steps only if the concise template cannot hold them. Do not ask the human to redo tests the agent already passed absent a justified independent check.
- **Review/merge status:** `Ready for review` means evidence submitted, not merge approval. If a **mandatory independently executable PR-level** check is failing, blocked or not run, lead recommendation must be `Blocked by failing tests`, `Blocked by missing external verification` or `Not ready for integration`, **never ready to merge**. Truly cross-component tests awaiting another agent are tracked as **integration dependencies** with an execution trigger, not misreported as passed or misclassified as a standalone PR failure; lead executes them on a temporary integration branch when both implementations exist. ARCH-005 full-MVP release acceptance remains separate and requires all integrated gates to PASS. Lead sends human PR link, change summary, PASS tests, BLOCKED/NOT RUN checks, risks, and recommendation.
- **Human control:** Agents commit/push **only to their assigned feature branches** and open PRs targeting `main`; they never push to `main`, merge a PR (even after approval), enable auto-merge, or bypass branch protection. **The human alone reviews and personally performs every GitHub merge.** Lead may test a **local, uncommitted and unpushed** temporary integration branch and resolve conflicts there; production deployment needs separate human authorization.
- **Revalidation:** any change to frozen contracts, catalog rules, persistence schema or extraction shape must trigger relevant per-agent regression tests; after every authorized merge, lead runs integrated checks. A green feature PR is insufficient for final application acceptance.

**Minimum agent-owned suites:**

| Agent | Executable checks to run when applicable | Human/external evidence that may block |
|---|---|---|
| Codex 1 Lead | contract validators, typecheck/lint/build, GitHub Actions on PR, cross-component integration, both student-journey E2E, staging/deploy verification if approved | Required CI check status, production-access limitations, release approval |
| Claude 1 Academic | degree audit/prerequisite/corequisite tests, credit allocation, source fixtures, bounded scheduler, unselected-course/recommendation regression tests | Verified ASU rules and approved catalog-year interpretations |
| Claude 2 Frontend | TypeScript checks, component/interaction tests, keyboard/a11y, desktop/mobile layouts, browser E2E when executable, PDF validity | Screenshots + actual browser interaction output; unavailable browser runner |
| Claude 3 Supabase | migration/SQL tests, authentication, two-account RLS/grants negative tests, cloud save/recovery, guest migration, conflict and deletion tests | Test Supabase/Docker or permission constraints; never claim RLS PASS from code review alone |
| Codex 2 Gemini | schema/row completeness tests, synthetic PDF benchmarks, failure/manual-fallback results, input/size/consent/privacy, abuse/secret tests | Live paid-processing terms, authorized real transcript, provider quota/billing for real-data testing |

**CI gate:** Lead creates `.github/workflows/**` in the implementation session. Run available lint/typecheck/unit/build checks on each `pull_request` to protected `main`, plus domain and E2E checks where the runner can execute them. Do not use privileged service-role secrets in untrusted PR jobs or store student data in CI artifacts. Required checks must reflect real executable workflows; external checks stay reported as `BLOCKED` until verified. A green generic workflow does not replace real academic, Gemini or RLS evidence.

## 2. T-CAT — Source fidelity, versioning and data correctness

**Fixture design:** validated ASU CIS degree interpretation supplied at kickoff, applicable year established, official URLs/document sections, approved credit totals and policy exceptions. Include synthetic disputed-rules fixtures distinct from production catalogs.

| ID | Scenario | Pass criterion |
|---|---|---|
| CAT-01 | All required courses and groups represented | Catalog review sheet has zero unaccounted mandatory requirements for modeled year |
| CAT-02 | Source conflicts (ORI credits, major totals, etc.) | Contradictions explicitly flagged, not silently selected; affected outcomes unresolved |
| CAT-03 | Elective AND/OR and minimum credits | Accurately model choose count, required classes, eligible options, applicable credits |
| CAT-04 | Course used across restrictive groups | No unauthorized double-counting; allocation reports one permitted assignment |
| CAT-05 | Wrong catalog year | Reject unsupported year or request correct governing version; never silently migrate |
| CAT-06 | Unverified waiver/permission/transfer | Explicit unresolved status with next action |
| CAT-07 | Catalog rule update | Changes invalidate prior result and saved-plan derived calculations |

**Release stop:** any known incorrect degree rule or unsupported policy automatically counted as satisfied. Official source ambiguity may be represented as unresolved but must not produce unqualified completion.

## 3. T-DATA — Academic record and schema

- At least 12 representative data cases: duplicates/repeats; completed vs in-progress; withdrawal; fail; unknown letter grade; attempted vs earned credits; transfer pending; rejected/unmapped code; course aliases; impossible negative credit; term chronology; wrong schemaVersion.
- Round-trip serialized academic record preserves all attempted rows and metadata; repeats never collapsed by course code alone; raw transcript PDF is not part of saved record.
- App rejects invalid cross-reference/active flag combinations and stale revisions; changing record invalidates analysis and candidates. **Exact full `InputFingerprint` equality** is required before apply: alter catalog version/content, record revision/content, plan revision/content, target term, authoritative availability revision/record content, scenario capacity/policy assumption, or engine/search version/options individually and assert `stale_preview` with no mutation.
- **Availability single source test:** edit `Plan.availabilityEvidence`, assert one `availabilityRevision` increment, recompute from `PlanningScenario.plan` only and round-trip persistence in `plan_json` without `availability_json` or another scenario evidence array. Evidence-content change with a reused revision is still detected by the canonical digest.
- Stable input produces same normalized output; only explicit catalog-supported equivalency converts raw course into a requirement-satisfying attempt.

## 4. T-GEM — Gemini PDF extraction benchmark

### Corpus

Target **15–20** manually labeled test PDFs with a mix of *supported-layout*, multi-page and negative/unsupported formats. Include synthetic documents and **authorized representative real-format** samples when processing tier permits; do not imply that a handful of synthetic examples proves universal accuracy. Cover semester totals, different credit columns, repeated course attempts, withdrawals, transfer work, ambiguous grades, scanned PDF, order permutations, empty page, truncated file, and deliberately unparseable layout.

**Ground truth** is a separate human-labeled list of **every course attempt on every page**, including repeated attempts and courses absent from supported catalog. Also label term, code, title, attempted/earned credits, grade and status. Keep identifying details out of repository and test logs; synthetic fixtures can be committed if clearly labeled.

### Metrics

| Metric | Computation / gate |
|---|---|
| Attempt recall on **accepted** test PDFs | `correctly captured actual attempts / all actual attempts`; target **100%** for supported accepted fixtures |
| Silent omissions | **0** accepted-fixture course attempts missing without an explicit rejection/flag |
| Hallucinated accepted attempts | **0** |
| Critical field errors accepted as correct | **0** for course code, term, attempted/earned credits, grade/status |
| Unmapped attempts | Retained as unresolved, never deleted or counted as matched |
| Unsupported or low-confidence layout | `needs_review` or `rejected`; immediate manual entry offered |
| Consent/data-flow | 0 external calls before explicit consent; zero real unredacted document calls to unsuitable unpaid tier; secrets server-only |
| Performance/billing | Log **non-sensitive** latency, retries, model ID, token counts and cost per accepted doc; rate-limit endpoint and enforce budget |

**Hard limitation:** JSON schema conformity is not evidence of row completeness; for new formats a parser can fail silently. If absence of omitted rows cannot be established, refuse to claim complete extraction. Field confidence labels alone are insufficient. Human review summary and manual path are always available.

### Security cases

- File size/type/magic-byte rejection; empty, encrypted/malformed file, excessive pages; API timeout, quota, 429, malformed model JSON, schema-valid invented fields, missing pages.
- Network/cost abuse from anonymous guest, invalid server-verified bot proof, replayed/expired single-use signed guest extraction ticket, forged consent, forged origin, per-session/per-network rate and concurrency ceilings, provider-cost budget exhaustion, revoked consent and user declining AI; manual flow must still work. Test public endpoint is **fail-closed** without guest admission proof; no production synthetic-bypass route.
- Production real-document endpoint fails closed when paid processing eligibility unverified; verify current Google terms, consent copy, secrets, transient retention, no raw content logs, no original PDF storage.
- When user supplies authorized real transcript **after paid-tier upgrade**, do not commit it, share across agents unnecessarily, or feed it to unpaid model testing.

## 5. T-ENG — Rule evaluation fixtures

Minimum **25** deterministic scenarios (count independent cases, not just assertions):

1. Required course completed at qualifying grade.
2. Required course not attempted.
3. In-progress does not count as earned credit.
4. Failed attempt does not satisfy rule.
5. Repeat passed after fail, with sourced policy.
6. Repeat policy unknown -> unresolved.
7. Transfer course unverified -> unresolved.
8. Verified equivalency satisfies appropriate requirement.
9. AND with all prerequisites satisfied.
10. AND with one missing prerequisite.
11. OR with one valid branch.
12. OR with both branches invalid.
13. OR with one branch unresolved.
14. Nested AND(OR(...),...).
15. Min grade met.
16. Min grade not met.
17. Min grade unknown.
18. Prior-term prerequisite wrongly placed same term -> conflict.
19. Future earlier-term prerequisite -> conditional eligibility.
20. Valid same-term corequisite.
21. Unverified same-term corequisite -> unresolved.
22. Legitimate corequisite pair is not misdiagnosed as impossible cycle.
23. True unsupported prerequisite cycle flagged.
24. Restricted credit double-count prevented.
25. Choose-N elective satisfied by appropriate alternatives, missing electives not all mandatory.
26. Credit-threshold with attempted but unearned credits.
27. Catalog discrepancy prevents certainty.
28. Snapshot invalidation after catalog/record change.

**Gate:** 100% pass for reviewed fixtures; **0 known false-positive prerequisite or degree-satisfaction conclusions**. Explicit unresolved is acceptable only when sourced rule truly cannot be determined.

## 6. T-SCH / T-AVAIL — Scheduling and recommendation

At least **15** scheduling fixtures using actual validated program examples plus synthetic alternative graphs.

| ID | Scenario | Pass criterion |
|---|---|---|
| SCH-01 | Student selected eligible courses but omitted time-sensitive requirement | Identify overlooked requirement and specific downstream dependency |
| SCH-02 | Many dependencies but ample scheduling slack | Do not falsely rank as universally critical |
| SCH-03 | OR prerequisite alternatives | No false mandatory edges |
| SCH-04 | Elective group already satisfied | No unnecessary elective recommendation |
| SCH-05 | Candidate fixes one issue, causes another | Both effects shown; not labeled unconditional improvement |
| SCH-06 | Future term unknown offering | Conditional placement; no invented guarantee |
| SCH-07 | Student `listed` for course+term | Source-stamped conditional evidence, never seat claim |
| SCH-08 | Student `not_listed` | Recalculate and exclude placement under reported scenario |
| SCH-09 | User edits availability report | Invalidate prior preview/outlook and recalculate |
| SCH-10 | Top-three evidence check selection | Highest decision-impact checks, including unselected courses |
| SCH-11 | Candidate preview | Active plan identical before apply; reject leaves unchanged |
| SCH-12 | Atomic swap and undo | Entire multi-operation change applied/reverted coherently |
| SCH-13 | Generator with valid known-source rules | **One** multi-term unadopted draft evaluated by same validator |
| SCH-14 | Bounded search exhausted / unsupported policy | Honest `no_valid_draft`/unresolved message, not `impossible` |
| SCH-15 | Target term, record or catalog revised | All downstream snapshots/outputs invalidate and recalc |
| SCH-16 | Unverified course capacity or summer offering | Explicit assumption or unresolved; not treated as official fact |
| SCH-17 | Unchanged exact scenario searched repeatedly, including chunked execution | Identical canonical candidate, ranking, findings, expansion count and stop reason under fixed node/beam/horizon limits |
| SCH-18 | External browser watchdog interrupts search | `search_interrupted`/`not_evaluated`, active plan unchanged; **never** `no_valid_draft` or a speed-dependent academic conclusion |
| SCH-19 | Every full-fingerprint constituent changed independently after preview | Apply returns `stale_preview`, including same revision with modified evidence/record/content; never changes Plan |
| SCH-20 | Apply/reject/undo plus cloud conflict | Explicit apply performs fresh validation and one atomic revision increment; reject changes no plan state; undo restores previous placements as a *new* revision if checkpoint matches; stale undo or cloud conflict cannot overwrite later edits |

**Gate:** zero hidden new known hard conflicts in a recommended “improvement”; no fabricated generated outcomes; all asserted changes traceable to real engine computations. A mathematically valid *conditional* future plan is not a guarantee of course availability or passing.

## 7. T-AUTH / T-SEC — Supabase and privacy

Test **three personas:** guest (not signed in), User A, User B. For every student-data table and operation (SELECT, INSERT, UPDATE, DELETE), verify permissions and forbidden access. Test owner spoofing in inserts/updates, anonymous requests, guessed UUIDs, payload ID changes, concurrent revision conflicts, and account deletion. Inspect grants as well as RLS. Security tests must run against a realistic local/test Supabase configuration; no production admin keys in browser.

Functional tests:

- Guest can plan from first to last screen; optional auth does not block engine.
- Guest draft survives same-tab refresh/OTP and failed sign-in via validated session draft; cross-tab magic-link recovery requires **explicit opt-in** to a local structured draft with expiry ≤24h, shared-device warning, clear-on-save/cancel/expiry/sign-out, and **no raw PDF**. Test expiry, corrupt/mismatched schemas, shared-device decline, and no silent cloud creation; on authenticated save default **Save as new**, no merge or overwrite without explicit user choice.
- Returning user retrieves only owned plans, edits a plan, updates the revision, reopens on another device, sees stale analyses recalculated.
- Conflicting writes return visible conflict rather than overwriting newer state.
- Delete own plan and request account removal by secure privileged flow; confirm lifecycle and any identity-provider retention exceptions disclosed.
- With script inspection/browser network: no Gemini API secret, service-role key, raw PDF in local/cloud plan, sensitive prompts in logs, or transcript data sent before consent. Verify **server-side anonymous-ticket issuance/attestation, expiry/replay rejection, per-session/network rate+concurrency caps, cost ceiling and fail-closed behavior** for the guest Gemini endpoint. Synthetic-only tests do not enable real-document processing.
- **Gemini normalization boundary:** malicious/ambiguous schema-valid AI course code, credit or transfer match stays provisional after G validation; L routes raw proposed rows to **E-owned** `academic.normalizeAttempts`, which alone makes catalog-equivalence and earned/applicable credit decisions. Reject any shortcut where Gemini fields directly satisfy requirements.
- Supabase anonymous **database role** is not confused with a Supabase Auth anonymous identity; avoid broad read grants.

**Gate:** zero known cross-account reads/writes/deletes, zero unauthenticated access to private records, and demonstrated consent/privacy controls. Never label authentication or saving production-ready on the strength of a successful sign-in alone.

## 8. T-UI / T-EXPORT — Browser and output

Run desktop ~1280px and mobile ~375px with keyboard navigation, tab focus, and accessible controls. Verify three screens (no extra mandatory wizard page), both planner paths, compact outlook + up to three priority issues + dominant timeline, mobile accordion, contextual availability, visual distinction of user-selected/adopted/unadopted, edit and undo. No drag/drop required.

- Error/recovery cases: invalid course; unsupported catalog; malformed upload; Gemini unavailable; auth expired; cloud write failed; no viable bounded draft; race between plan edit and preview apply.
- Usability assertions: manual fallback immediately visible; student not forced to confirm every extracted row; evidence/unknown labels visible; no long AI chatbot explanation replacing structured UI.
- Browser PDF: click Export downloads a valid readable PDF; includes saved/adopted active placements, catalog version, target, date, important issues/uncertainties/student-reported offerings; **not** provisional unadopted placements represented as adopted. Check multi-page wrapping, file open, no secrets or raw transcript content inadvertently embedded.
- UI must consume real engine outputs for final E2E. Skeletons/mocks may exist only as temporary internal development/test aids; **never submit mockup-only feature PRs or claim a placeholder UI, PDF, or external service as working**. Feature PRs must show actual interactive behavior and applicable independent test results.

## 9. Feature-by-feature release traceability

Lead must track each feature ID independently. A row is PASS only when its actual implementation and listed objective tests pass (not merely because a parent milestone is merged).

| ID | Required capability | Implementation milestone | Primary tests |
|---|---|---|---|
| F01 | Three primary screens | U1, L1 | T-UI browser navigation |
| F02 | Both planner starting paths | U1, E2, L1 | T-UI, T-SCH journey cases |
| F03 | Manual course input/edit | U1 | T-DATA, T-UI |
| F04 | Gemini optional transcript flow and manual fallback | G1, U1, L1 | T-GEM, T-SEC, T-UI |
| F05 | Normalized course attempts/credits/statuses | E1, L1 | T-DATA, T-ENG |
| F06 | Catalog-based degree audit | E1 | T-CAT, T-ENG |
| F07 | Structured prerequisite/corequisite evaluation | E2 | T-ENG |
| F08 | Strategically important unselected courses | E2 | T-SCH, T-ENG |
| F09 | Evidence-aware graduation feasibility outlook | E2, U1 | T-SCH, T-UI |
| F10 | Up to 3 student-assisted availability reports | E2, U1 | T-AVAIL, T-SCH, T-UI |
| F11 | Proactive sourced recommendations | E2, U1 | T-SCH, T-UI |
| F12 | Interactive semester timeline Add/Move/Remove | U1, E2 | T-UI, T-SCH |
| F13 | Preview/Apply/Reject/Undo including swap | E2, U1 | T-SCH, T-UI |
| F14 | One validated multi-semester draft | E2, U1 | T-SCH, T-UI |
| F15 | Full guest planning without registration | U1, S1 | T-AUTH, T-UI |
| F16 | Supabase sign-in and owned cloud saving | S1 | T-AUTH, T-SEC |
| F17 | Guest-to-account safe Save as new migration | S1, L1 | T-AUTH, T-SEC, T-UI |
| F18 | Returning student plan recovery/update | S1, L1 | T-AUTH, T-DATA, T-SEC |
| F19 | Downloadable PDF export | U2 | T-EXPORT |
| F20 | Responsive approved visual interaction | U1, U2 | T-UI keyboard/mobile |

## 10. Final release checklist — all mandatory

- [ ] User-provided ASU CIS interpretation received, governing catalog year resolved, contradictory policies resolved or explicitly kept uncertain without false completion claims.
- [ ] All F01–F20 integrated, no disabled/placeholder feature misrepresented as complete.
- [ ] Typecheck, lint, unit/academic, full scheduling and transcript benchmark pass.
- [ ] Gemini paid/data handling verified for real transcripts; consent/server proxy/abuse controls tested; unauthorized raw data not retained.
- [ ] RLS grants + policies tested with two users and guest; save/migrate/recover/delete tested.
- [ ] Both E2E journeys pass against **real implemented engines**, not canned responses; responsive and export verified.
- [ ] Complete scenario fingerprints prevent stale preview apply; one authoritative Plan availability record; deterministic bounded search reproducible independent of elapsed time; atomic apply/reject/undo and cloud conflicts verified; no known major security, privacy or hard-academic correctness defects.
- [ ] Gate 0 security and normalization boundaries tested: guest Gemini admission/abuse protection, consent-safe short-lived draft recovery, G raw rows → E normalization; real-transcript AI disabled until approved processing terms and authorized testing pass.
- [ ] Each PR contains working feature code (except the tested contracts/CI foundation), short professional evidence (actual commands and results); GitHub Actions ran available PR checks, and the **human personally performed each merge through GitHub**. Lead supplies run/deploy instructions, integrated test report and unresolved known limitations.
- [ ] Human engineer explicitly approves production deployment/release **separately from PR merge approvals**; no agent may override a blocked gate to satisfy one-day goal.

If deadline arrives and any gate fails, report **incomplete full MVP**, list remaining work and blocker, and preserve current code. A partial integrated demonstration can be shown honestly but is not the complete approved MVP.

## Gate 0 execution mapping — 2026-11-12

Mandatory foundation commands: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`; PR `foundation` GitHub check must run and pass. `npm run check` composes all but install. Run `npm audit` and address material findings. Unit suites in lead-owned `src/contracts/*.test.ts` and `src/app/*.test.ts`; browser boot test in `tests/e2e/` exercises the actual built foundation without external egress. Synthetic routing tests do not prove E normalization; parsed tickets do not prove admission. Curriculum configuration validation proves faithful transcription/credit arithmetic, not academic graduation eligibility.

| Pending integration test | Modules / owners | Trigger |
|---|---|---|
| SCH-17/18 deterministic bounded/chunked search + cancellation | E engine, L/U worker integration | E2 implementation available |
| SCH-19/20 stale apply/reject/atomic undo/adoption + evidence edits | E validation, L commands, U controls | E2 + L1 + U1 available |
| T-AUTH recovery/Save-as-new, CAS, RLS/grants A/B/guest | S persistence/auth/SQL, U controls, L composition | S1 + U1 available in test Supabase |
| T-GEM/T-SEC atomic ticket/replay/quota/budget/file/consent gates | G endpoint, S private admission tables, L configuration | G1 + S admission migration on local/test backend |
| T-SEC malicious raw rows → unresolved actual academic record | G validation, L routing, E normalization | G1 + E1 available |
| T-CAT applicability and policy reconciliation | E and human authoritative sources | Sufficient policy evidence; no inference from personal-record notation |

All pending integration tests are NOT RUN until evidence exists; no independent executable check may be reclassified to avoid a failure. Detailed frozen boundaries: ARCHITECTURE.md §8.

## Mandatory human PR acceptance

The user requires independent hands-on verification for every PR in addition to all
existing automated/independent-review gates. This explicitly authorizes repeating a
focused agent-verified test for human evidence. Use `docs/acceptance/pr-N/PR_ACCEPTANCE_TEST.md`
for the existing PRs; do not duplicate those documents in feature-owned directories.
Each specifies immutable tested code/dependency SHAs, exact setup/interactions,
expected results, screenshot checkpoints, cleanup and limitations. Lead owns the
status in IMPLEMENTATION_STATUS.md; initial human status is NOT RUN. Only the human's
reported outcome sets PASS or FAIL; unavailable prerequisites make eligibility
BLOCKED. No screenshots are captured on the user's behalf. Screenshots supplement
assertions/CI and never replace them. No merge recommendation until human PASS and
all applicable automated/security/correctness/review gates pass. Acceptance of a
subset does not clear a blocked whole-PR requirement. Revalidate changed behavior
when the PR head changes; documentation-only changes retain the tested code baseline.
