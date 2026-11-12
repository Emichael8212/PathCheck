# PathCheck — Five-Agent Parallel Implementation Handoff

**Status:** Final planning handoff for a NEW VS Code coding session; **no coding or external setup authorized in this conversation**. **Target:** one calendar day, low-confidence, not a guarantee. **Scope:** every F01–F20 approved MVP feature remains mandatory; only the human can approve scope changes and authorize production deployment, and **the human alone personally performs each GitHub PR merge**. ARCH-005 release gates in `TEST_PLAN.md` are not negotiable to meet a deadline.

## 1. Five agents and single integration authority

| ID / runtime | Role | Exclusive deliverables | Review / merge authority |
|---|---|---|---|
| **L — Codex Agent 1** | **Lead Integrator** | Repo foundation; frozen shared TypeScript contracts; dependency/config ownership; integration adapters; worktree coordination; GitHub Actions; PR evidence review; E2E; deployment preparation and verification | Reviews **all** PRs, resolves conflicts in its own integration worktree and recommends; **human personally performs GitHub merges; separately approves production deployment** |
| **E — Claude Agent 1** | Academic Engine | Versioned catalog, degree audit, AND/OR prerequisite/corequisite logic, conditional scheduling, unselected-course detection, recommendations, deterministic tests | Feature PR; no merges |
| **U — Claude Agent 2** | Frontend and UX | Three screens, both planning paths, planner timeline, extraction interface, availability controls, preview/apply/reject/undo, responsive UI, PDF export, browser/component tests | Feature PR; no merges |
| **S — Claude Agent 3** | Supabase | Auth, Postgres schema and migrations, RLS/grants, owned cloud save/recovery, guest conversion, revision conflicts, deletion and security tests | Feature PR; no merges |
| **G — Codex Agent 2** | Gemini Transcript Processing | Secure Gemini Vision function, PDF handling, structured proposals, provisional catalog matching, completeness/failure validation, rate limits/privacy, synthetic transcript benchmarks | Feature PR; no merges |

These are **five roles, four implementation agents + one integrator**; do not create additional agents by default. L is accountable for **one integrated application**, not five implementations that happen to compile separately. The human is the sole authority for actual ASU rules, external service access, **personal execution of every GitHub PR merge**, and production release authorization. AI agents may use local mock services and synthetic fixtures to develop independently, but never substitute them for real integration or academic decisions at release.

**Subscription/computer limits:** two Codex CLI terminals and three Claude Code terminals can exhaust subscriptions' shared quotas, RAM, concurrent process capacity or paid API budgets. Verify available CLI usage and local machine capacity at kickoff; pause or stagger a role rather than sharing a worktree or rewriting ownership. Claude Pro/ChatGPT Plus do not pay the separate Gemini API by implication.

## 2. Gate 0 — Must finish BEFORE concurrent implementation

Owned by L; human approves foundation PR before agents branch from it.

1. **Request the user's verified undergraduate Alabama State University B.S. CIS catalog interpretation and applicable catalog year immediately.** Compare with official source before encoding actual academic rules. Record contradictions and mark unverified items unresolved. If document is delayed, E may only use synthetic fixtures for engine implementation; U/S/G proceed against frozen contracts.
2. Confirm toolchain/permissions: VS Code, installed/authenticated Codex CLI and Claude Code, Node/npm/Git, GitHub repository authorization, local/test Supabase where feasible, Vercel access, Gemini project with an approved processing arrangement for any real student document. Never request secret values in chat. External platform access and quota availability remain dependencies, not assumed facts.
3. Establish a repository with a **protected `main` branch** and no automated merges or production deploys. Human configures/enables GitHub branch protection or explicitly authorizes its configuration. Required PR reviews/status checks; PR-only updates to `main`; appropriate permissions. The lead may prepare changes to settings but must not bypass protections.
4. Lead works in **its own isolated worktree/feature branch** to create React/TS/Vite scaffold, root dependency manifests, test scripts, GitHub Actions CI, `.gitignore`, `.env.example` (no credentials), test harness, and strict public contracts. Include tests for contracts and an importable, buildable **working foundation**, with real contract validation/CI (the only PR exempt from a completed user-facing feature); no fabricated catalog data.
5. Freeze and document `src/contracts/{academic,planning,transcript,persistence,index}.ts` plus runtime validators. Publish `contracts-v1` with exact fields, strict unions, **complete `InputFingerprint` / `CandidatePreview.baseFingerprint`, one `Plan.availabilityEvidence` + `availabilityRevision` source, typed apply/reject/undo commands, normalized-extraction-to-engine boundary**, typed errors, frontend service boundaries, and representative **synthetic** fixtures; run typecheck/tests/build. All domain agents review contracts and submit concerns before baseline PR approval. L handles shared change requests; feature agents never directly edit contract files.
6. **Resolve three Gate 0 integration decisions before feature branches:** (a) **Guest Gemini admission**: G + L specify server-verified bot attestation, one-use expiring guest session ticket, consent proof, quotas/concurrency, cost ceiling and replay/failure tests; a guest needs no account, and no public test bypass is allowed. (b) **Guest draft recovery**: U + S + L freeze same-tab email OTP with session draft recovery; optional cross-tab magic-link recovery requires explicit opt-in to a 24h-or-shorter local structured draft, shared-device warning, expiry/clear and Save-as-new ownership tests; never retain raw PDFs. (c) **Gemini → E normalization**: G returns validated *proposed raw rows/provisional matches*, L transports them, E alone creates authoritative catalog-matched `AcademicRecord` attempts; errors/unmatched rows stay unresolved. Record Gate 0 tests and owning paths in `ARCHITECTURE.md`. Real Gemini processing remains disabled until all external data-handling conditions pass.
7. Lead pushes foundation branch, opens PR using the required template, shows command/output evidence. Human reviews and **personally merges** the baseline PR through GitHub; no agent performs the merge. **Only after it is on `main`** are four isolated feature worktrees based on that commit created. Contract or dependency revisions require new reviewed PRs and targeted revalidation.

**Gate 0 complete when:** human-reviewed baseline PR merged, contracts build, GitHub Actions runs on PRs, repo paths exclusive, required input requested, **guest admission, draft recovery, and raw-extraction/academic-normalization boundaries each have frozen interfaces and acceptance tests**, and four feature branches originate at the same reviewed baseline. Target ~2–4 hours if all setup/approvals proceed smoothly; it is a dependency, not an optional warm-up.

## 3. Canonical source contracts (lead owns the actual files)

The normative fields, semantics and APIs are specified in `ARCHITECTURE.md` and `ACADEMIC_ENGINE.md`. Before feature agents write production code, L must freeze at least:

| Boundary | Shared types/functions and invariant | Producer → consumer |
|---|---|---|
| Program/catalog | `CatalogRef`, `SourceEvidence`, `CourseDefinition`, `RequirementGroup`, `CatalogModel`; `loadValidatedCatalog` | E → L/U; unverified ASU rules remain unresolved |
| Academic record | `CourseAttempt`, `AcademicRecord`, term/credits/status/attempt IDs; `normalizeAttempts` | G/U produce raw proposals; E normalizes authoritatively; L composes |
| Academic rules | `PrerequisiteExpr` with `all/any/course/corequisite/unresolved`, plus versioned policy flags | E → L/U |
| Planning | `TermId`, `PlanPlacement`, `Plan`, `AvailabilityEvidence`, `PlanningScenario`, `ChangeSet`, `GeneratedDraft`; **only `Plan.availabilityEvidence` is mutable/persisted**, scenario reads its Plan; revision+content fingerprint | U inputs → E calculations, L coordinates persistence |
| Evaluation | `DegreeAudit`, `RuleFinding`, `Outlook`, `AnalysisResult`, **`InputFingerprint`**, `CandidatePreview.baseFingerprint`; pure `audit/evaluate/preview/validateCandidate/generateDraft`, deterministic search node budgets | E → L facade → U; immutable full-versioned previews, no LLM academic conclusions |
| Transcript | `TranscriptExtraction` → G-owned `ValidatedExtractedRows` (raw/provisional only) → E-owned `academic.normalizeAttempts` → `AcademicRecord`, with field/page/row provenance, consent and typed failures | G → L → E; U reviews accepted proposal; never promote unverified equivalence |
| Plan command / auth/storage | **L-owned atomic `applyPreview/rejectPreview/undoLast`** with E's fresh validation, U intent-only UI, S optimistic cloud save/Save as new; `schemaVersion`, full fingerprints, `planRevision`, auth identity; typed stale/conflict results | E validates → L mutates session → S persists → U renders; no raw PDF in DB |
| System errors | Normalized `unavailable`, `unresolved`, `validation_error`, `forbidden`, `conflict`, `rate_limited`, `external_failure` (or equivalent frozen discriminated union) | All modules; never fake success on error |

**Change control:** L owns `src/contracts/**` and root package/dependency changes. An agent needing a change sends: current contract limitation, exact proposed diff/type, affected callers/tests, migration strategy. L stages it in its worktree, opens a contract PR and awaits human-approved merge; other agents update from new `main`, rerun typecheck/relevant tests and report new evidence. Don't let incompatible agent-local definitions drift.

## 4. Exact worktrees, branches and exclusive paths

**At kickoff only** (not executed in planning). Git root `pathcheck/` stays clean on protected `main` for review; each CLI process launches from its **own directory**. Initial L branch is `feat/contracts-foundation`; after its PR is approved and merged, L switches its clean worktree to `feat/integration-01` based on updated `main` (subsequent integration work gets additional PRs). Each other role has a distinct baseline branch:

```bash
# Example only — run in the NEW coding session, not this planning chat.
# Base repository exists on main; L creates bootstrap worktree first:
git worktree add ../pathcheck-lead -b feat/contracts-foundation main
# After human-approved bootstrap PR is merged and main updated:
# In the clean lead worktree: switch to a fresh feat/integration-01 from updated main.
git worktree add ../pathcheck-engine   -b feat/academic-engine main
git worktree add ../pathcheck-frontend -b feat/frontend-ux main
git worktree add ../pathcheck-supabase -b feat/supabase main
git worktree add ../pathcheck-gemini   -b feat/gemini-extraction main
git worktree list
```

| Worktree | Branch | Agent / terminal | Exclusive writable implementation paths |
|---|---|---|---|
| `../pathcheck-lead` | `feat/contracts-foundation` → `feat/integration-01` | Codex Agent 1 | `src/contracts/**`, `src/app/**`, `src/main.tsx`, `tests/e2e/**`, root manifests/config/lockfiles, `.github/**`, docs, shared `supabase/config.toml` |
| `../pathcheck-engine` | `feat/academic-engine` | Claude Agent 1 | `src/catalog/**`, `src/engine/**`, `tests/engine/**`, `tests/fixtures/engine/**` |
| `../pathcheck-frontend` | `feat/frontend-ux` | Claude Agent 2 | `src/screens/**`, `src/ui/**`, `src/styles/**`, `src/export/**`, `tests/ui/**`, `tests/fixtures/ui/**` |
| `../pathcheck-supabase` | `feat/supabase` | Claude Agent 3 | `src/auth/**`, `src/persistence/**`, `supabase/migrations/**`, `supabase/tests/**`, `tests/auth/**`, `tests/persistence/**` |
| `../pathcheck-gemini` | `feat/gemini-extraction` | Codex Agent 2 | `src/transcript/**`, `supabase/functions/extract-transcript/**`, `tests/transcript/**`, `tests/fixtures/transcripts/**` |

**Git push/merge boundary:** Every agent commits and pushes **only to its assigned feature branch**, and may open a PR targeting `main`. No agent pushes to `main`, enables auto-merge, bypasses protection, or merges a PR even after the human approves. The **human personally executes every merge in GitHub**. L uses only a **local, uncommitted, unpushed** temporary integration branch to combine candidate commits for testing (noncommitting merge/cherry-pick; discard scratch state); integration corrections committed for review go on L's assigned feature branch/PR.

**Cross-team boundary decisions:**

- L alone composes dependencies in `src/app/**` and owns API adapters, **the authoritative Plan command state machine (`applyPreview/rejectPreview/undoLast`)**, routing and E2E tests. U sends user intents and renders results; it must not directly mutate `Plan` or import private engine internals. E provides pure candidate validation; S provides optimistic remote persistence.
- E owns authoritative `academic.normalizeAttempts` / catalog equivalency decisions for academic eligibility. G may parse raw rows and propose course-code matches with confidence only; output must be `ValidatedExtractedRows` (not a final `AcademicRecord`). L routes G output to E's normalization boundary. G does not edit E files.
- U owns the **consent and manual-fallback interface**, user-triggered apply/reject/undo controls and recovery messaging. G owns upload validation, guest endpoint ticket/attestation/rate controls, typed failures and response validation; L owns shared integration/security configuration and plan-command state. S owns auth/storage and guest-recovery persistence coordination, **not** the Gemini function.
- S owns DB migrations and RLS; shared `supabase/config.toml`, deployment secrets/config, and GitHub Actions belong to L. G proposes any function config edits to L. S and G coordinate API requirements **through L** and frozen types, not overlapping files.
- Root package manifest/lockfile edits: L only. Agent requests dependency name/version/purpose and L lands approved shared change before agent consumes it. Avoid globally formatting another agent's source tree or editing another worktree.
- Local fixtures/mocks/test doubles are permitted **only for isolated implementation and tests** while dependencies are unavailable; they are not evidence that external services or integrated journeys work. Each feature PR must contain working functionality within its owned paths (functional UI, real academic algorithms, actual Gemini/Supabase integration) and passing applicable independently executable tests. **No static UI-only, PDF-skeleton, inert-control, stub-only or fake-result feature PRs.** The initial foundation/contracts/CI PR is the sole non-user-facing exception and must pass its own real tests. Release E2E and academic tests must use **real deterministic engine logic**, not precomputed successful outputs.

## 5. Dependency-aware parallel waves

| Wave | Codex L | Claude E | Claude U | Claude S | Codex G | Dependency / checkpoint |
|---|---|---|---|---|---|---|
| **0 — Baseline** | Contract freeze, CI PR baseline, solicit catalog; freeze guest/preview/availability boundaries | Review search/input fingerprint contracts | Review command intent and guest recovery | Review guest/save recovery contracts | Review guest extraction ticket and raw-row proposal | No feature coding until reviewed contracts on `main` |
| **1 — Independent foundations** | Build/test integration facade as shared code | Implement/test requirement evaluator on synthetic fixtures | Develop interactive three-screen flows, manual input and export logic; internal prototypes cannot be standalone PRs | Implement/test migrations, RLS and auth against test project | Implement secure function and file guards; test with synthetic documents | Four parallel tracks after Gate 0; only functional, tested feature PRs may be submitted |
| **2 — Domain functionality** | Review incremental PRs; compose first engine vertical | Validated ASU rules after human document; complex scheduling and candidate search | Two planner paths, availability, preview/apply/undo, export | Cloud save/recover, migration, conflicts/deletion; auth tests | Structured extraction, row completeness, privacy/abuse tests | Catalog rules depend on source; UI can use typed fixtures until E is ready |
| **3 — Integration PRs** | Integrate via isolated branch, run combined checks; present PRs/merge recommendations | Fix engine integration failures | Wire real engine and extraction states | Wire account state and persistence to facade | Verify proposal-to-record adapter; test failures | Each merge needs **human approval**; lead cannot bypass |
| **4 — Release verification** | CI, both E2E journeys, cross-feature regressions, staging/deploy-readiness review | Verify official fixtures | Responsive/interactions/PDF check | RLS/grants test results and secure lifecycle | Real processing only after approved paid tier and consent; privacy benchmark | All F01–F20 gates pass; human separately authorizes prod deploy |

**Parallel work independent of external blockers:** U may build functional, interactive UI with typed fixture responses while real adapters are pending; E may test a real deterministic engine against synthetic academic graphs; S may implement real migrations/RLS/auth with a local/test project; G may implement a real Gemini function tested against synthetic documents; L can build CI, working shared contracts, tested adapters and an E2E harness. Development-only mocks/stubs are not completed feature PRs. **Not independent:** real ASU catalog rules need human document; full planner E2E needs real engine; real student transcript API calls need verified processing terms and consent; cross-device saves need working authenticated service and RLS; release requires human reviews and all gates.

## 6. Milestones, evidence and effort (one calendar-day target, not guarantee)

Each **feature PR** must deliver working, independently testable behavior in its owned module, not a visual mockup or code skeleton. The initial contracts/CI foundation PR is the sole non-user-facing exception and still must pass its actual acceptance checks. Each PR is **reviewable only with evidence** (see §7). Timings are rough *agent active hours* after dependencies; don't sum them as elapsed wall clock, and don't regard the lower bound as a commitment.

| Milestone / owner | Implemented features | Dependencies | Completion criterion and tests | Effort / blockers |
|---|---|---|---|---|
| **G0 — L** baseline/CI | Shared contracts, app scaffold, CI/test scripts, isolated ownership | Human repository permissions; source document requested | Contract/schema fixtures, typecheck, build and PR CI actually run; bootstrap PR human-approved | 2–4h; repository setup/review latency |
| **E1 — E** catalog + audit | F05–F07 requirements, records, source evidence | G0; verified catalog for actual rules | `T-CAT`, `T-DATA`, `T-ENG` reviewed fixtures; no unsourced satisfaction | 5–10h; catalog year/contradictions |
| **E2 — E** schedule/analysis | F08–F11/F13/F14 calculations, overlooked-course detection, candidate generation | E1 core evaluator; immutable plan contracts | `T-SCH`, `T-AVAIL`, **full-fingerprint previews**, fixed-budget deterministic generator; changes fully revalidated, no hidden conflicts | 7–14h; search complexity/unknown offerings |
| **U1 — U** interactive UI | F01–F03/F09–F13/F15/F20; Gemini input/consent UI | G0; lead service facade test doubles until E/G/S ready | Typecheck, component/interactions, responsive/a11y and browser tests with real engine once integrated | 7–12h; state and async sync |
| **U2 — U** export/finish | F19; mobile/export hardening, two planner paths F02/F14 UI | U1; accepted-plan export contract | PDF export contents and provenance, multi-page/mobile regression, component/browser tests | 2–4h; PDF layout |
| **S1 — S** auth/database | F15–F18; Auth, schema/RLS, owned cloud save/recover, safe migration/deletion | G0; Supabase local/test project and grant policy | SQL migrations, RLS two-user denied CRUD, sign-in/guest migration/save/reopen/conflict/delete tests | 9–17h; external config, database policies |
| **G1 — G** Gemini ingestion | F04 backend, proposal normalization, fallback errors, server security | G0 transcript contracts; synthetic labeled fixtures; real data later paid-tier only | 15–20 labeled synthetic/authorized fixtures, missing rows, failures, consent/no-transfer, key protection, abuse limits | 7–12h; model errors/terms/quotas |
| **L1 — L** incremental integration | Wire E/U/S/G modules, **validated apply/reject/undo command service**, shared contract revisions, UI-to-engine-to-storage, CI | Human-approved feature PR merges; tested adapters | Full typecheck/build/unit + integration regressions; stale-preview/undo and evidence edits; actual engine inputs/output | 5–10h overlapping; merge/review delays |
| **L2 — L** final quality | All F01–F20 and F01–F20 traceability, deployment readiness | Integrated modules, authorized external services, human approvals | `T-CAT`/`T-GEM`/`T-ENG`/`T-SCH`/`T-AUTH`/`T-UI`/`T-EXPORT` etc all PASS; two browser journeys; security review | 5–10h; latent defects, waiting for human/external controls |

**Estimated critical path:** G0 (2–4h) + longest parallel track (E 12–24h, U 9–16h, S 9–17h, G 7–12h) + a portion of final integration/security (5–10h), less only the integration demonstrably overlapped. This gives roughly **19–38+ elapsed hours before human/external waiting**, with **24–48+ hours** a more cautious planning envelope. These are estimates, not a guarantee. One-day completion has **low confidence** for all tested features. More agents do not remove human PR approval latency, academic verification, API paid-tier eligibility, security checks or integration rework.

If one day ends before every gate is green, preserve all scope, branches, evidence and known blockers. The complete MVP is not finished; do not represent a partial feature set as a reduced MVP without human authorization.

## 7. Mandatory professional PR evidence and test ownership

### Two acceptance levels — PR merge versus complete MVP release

- **Mandatory PR-level acceptance:** Each agent runs **every applicable test independently executable** for its owned change and environment before requesting merge. All mandatory PR-level tests must actually **PASS**; a `FAIL`, `BLOCKED` or `NOT RUN` for one makes the PR **not ready to merge**. Do not misclassify independently runnable tests as integration-only to bypass the PR gate. A passing PR may receive a favorable **lead merge recommendation**; this is not a merge, release approval, or deployment authority. **Only the human personally performs the GitHub merge** after reviewing it.
- **Tracked integration dependencies:** Tests requiring another agent's implementation that is not yet available are documented separately (dependent modules/PRs, responsible agent, exact test, trigger for execution, and `BLOCKED`/`NOT RUN` status) in the PR's `Known Issues` and the lead's integration checklist. They need **not** falsely block an otherwise complete, independently tested PR as if its author could execute them alone. The lead runs these tests using a **temporary integration branch** once the dependencies are present, before relying on integrated behavior; integration does not replace or excuse failing PR-level tests.
- **ARCH-005 full-MVP release acceptance:** PR merge readiness is **not** production readiness. Every `TEST_PLAN.md` ARCH-005 criterion must **PASS** across the combined app before anyone declares the full agreed F01–F20 MVP complete. Real Gemini transcript processing remains **disabled** until appropriate processing/privacy terms, consent, server-side handling and relevant tests are verified; passing synthetic transcript fixtures does not satisfy that release criterion. Supabase live authorization and cross-component E2E must likewise pass.

**All five agents, including L, may commit and push only their assigned feature branches and must open PRs to `main`**. Repository default `.github/pull_request_template.md` governs descriptions. Routine descriptions target **100–200 words or fewer**, with only four sections:

1. **Summary** — max three concise changed-behavior bullets with feature IDs; one why sentence only if needed.
2. **Tests** — each applicable executed command verbatim, actual `PASS`/`FAIL` with counts/details; required unexecuted checks `BLOCKED` or `NOT RUN` plus short reason. Commands such as `npm run typecheck`, `npm test`, `npm run build` are examples, not automatically PASS. If a blocked check genuinely requires the human: missing dependency, exact manual commands/steps, expected success, expected failure indicators, evidence to return. Provide detail in linked test notes only when necessary.
3. **Evidence** — **only if applicable**: UI screenshot plus browser interaction result; academic input → expected → actual; security authorization results. No fabricated screenshots/logs. A static screenshot does not prove functionality.
4. **Known Issues** — real blockers, limitations or `None` if genuinely none.

No generic model-generated walls of text, duplicated file lists or promotional claims. **Do not include an unsupported “ready to merge” claim inside a PR with a mandatory PR-level test failed, blocked or unrun.** Clearly label unavailable cross-component checks as integration dependencies in `Known Issues`; never imply they passed. The lead separately presents the human a merge recommendation and PR link after reviewing **working implementation code, genuine test evidence, and any integration dependencies**.

### Per-agent mandatory checks before PR submission

| Role | Agent-run tests (use exact configured commands; report each actual outcome) | Extra evidence |
|---|---|---|
| **L** | Full build/typecheck, shared contract tests, CI workflow execution on PR, integration regression, E2E where executable, deployed/staging checks when authorized | Contract compatibility, both student journeys, pipeline status, unresolved deployment risks |
| **E** | Unit/edge/regression tests, source-to-rule fixtures, prerequisite AND/OR/coreq tests, degree credit/allocation tests, bounded schedule and unselected-course tests | Concrete fixture input → expected → actual; source/uncertainty identifiers |
| **U** | Typecheck, component tests, keyboard/interaction tests, responsive/a11y checks, browser E2E when executable, PDF validity | Relevant screenshots + interaction test outputs; mobile/desktop dimensions and known defects |
| **S** | Migration and SQL policy tests, auth flows, two-account RLS/grants negative tests, CRUD/save/recovery/migration/deletion/revision tests | Two-principal allowed/denied matrix; no leaked secrets |
| **G** | Transcript schema validation, synthetic PDF benchmark, attempt completeness/omission tests, timeouts/fallback/error tests, consent/no-request tests, rate/file/security tests | Extracted attempt counts vs labeled ground truth, no real-record test on unpaid tier |

**CI policy:** L configures GitHub Actions with `pull_request` on `main` for available lint/typecheck/unit/build, plus tests feasible without secrets. Require these via repository branch protection subject to human control; avoid untrusted PR exposure to privileged tokens. Add domain checks (SQL/test Supabase, Playwright) when executable; if external tests cannot run, show blocked/not-run in PR rather than marking PASS or falsely treating green generic CI as complete. Artifacts must exclude PII and credentials. Each agent runs tests available locally **before PR**; CI supplements, does not replace, that responsibility.

### Blocked-test handoff format (concise)

`<test> — BLOCKED: <why>. Need: <permission/dependency>. Run: <exact command/steps>. PASS: <observable success>. FAIL: <error/access symptom>. Return: <log/screenshot/redacted evidence>.`

Only ask the human for tests genuinely impossible for the agent to run. Do not ask for reruns of its own PASS tests unless independent human verification is specifically required.

**PR review status:** `Ready for review` = author has submitted evidence; `Blocked by failing tests`, `Blocked by missing external verification`, `Not ready for integration` describe actual gates. Lead may recommend a PR **ready to merge** only when every applicable independently executable **PR-level** acceptance check passed, with no failing/blocked mandatory PR-level check. Outstanding tests that genuinely require another agent are tracked **integration dependencies**, with a named owner and execution trigger, and cannot be treated as PASS or as full-MVP completion evidence. Submit exact PR/head SHA to human. **No agent—including L—may merge `main`, enable auto-merge, push to `main`, bypass protection, or merge on the human's behalf after approval.** The human alone merges the reviewed PR through GitHub. Production deployment is separately human-authorized. If the PR head SHA changes, review again.

## 8. Incremental integration / GitHub protection

1. Feature agent commits/tests/pushes its **own** branch, opens a concise PR against `main`, and notifies L with URL, head SHA and evidence. L reviews diff for path ownership, contracts, versioning, fixture realism, leaks, security and real test results. L responds with a short summary, pass/block statuses, risks, and merge recommendation for human.
2. To execute **tracked cross-component integration dependencies** before a main merge, L creates or updates a **temporary integration branch within the lead's worktree** from current `main` (**local only; no commits or pushes to this scratch branch**), once dependent modules are available, stages candidate PR changes **without committing**, resolves merge conflicts **only in that temporary working state**, and runs the corresponding integration tests against actual implementations. L records PASS/FAIL/BLOCKED results, identifies owning agents for fixes, and reruns affected integration checks. This is **not** a main merge, does **not** bypass PR review or independently executable PR acceptance tests, and does **not** imply full ARCH-005 release acceptance. Feature agents fix owned defects on their feature branches; L fixes shared adapter conflicts in its own PR.
3. **Human personally reviews and merges each specific PR through GitHub. No agent executes a merge, even with approval; no auto-merge or branch-protection bypass.** Lead reruns affected checks on updated `main` after every authorized merge, then confirms CI and integration. **Do not postpone all integration until all agents finish.**
4. Lead-owned changes (contracts, root dependencies, API facade, CI, end-to-end specs, merge adaptations) also require feature/integration PRs with actual tests and the same human merge authorization. Contract changes trigger agent rebases/updates and **retest every affected module**. No direct commits to protected main as a shortcut.
5. Integration checkpoints: **I0** contracts/CI; **I1** E audit + U manual journey; **I2** E scheduler + U generation/preview; **I3** S auth/save/migrate; **I4** G transcript proposal → record; **I5** end-to-end/regression/export/security and deployment readiness. Every checkpoint must show real integrated behavior and evidence, not fixture-only success.
6. Production: L proposes deployment settings and verifies a safe staging build, secrets, redirects, RLS, privacy tier, test matrix and deployment plan. **Do not enable real Gemini transcript processing until its privacy, consent and processing requirements have passed; synthetic results alone never clear that gate.** Declare full MVP complete only after **every approved ARCH-005 release criterion passes** across the integrated application. **Human gives separate explicit production deploy authorization** after PR approvals and release readiness; L coordinates or executes only when authorized. No feature agent deploys production.

## 9. Human engineer review obligations and required inputs

- **At kickoff:** supply verified ASU B.S. CIS degree interpretation/document and governing year; evaluate flagged official inconsistencies. L must ask first. Without it, independent synthetic engine/UX/platform work may proceed, but no real ASU degree-completion claim.
- **GitHub:** create/authorize repo and branch protection, review each technical PR and test evidence, **personally perform each PR merge through GitHub**; make sure CI required checks reflect actually available tests. Review any contract change that affects semantics, not only code style.
- **Supabase/Vercel:** supply access through safe local/secret mechanisms (never paste credentials into chat), approve test vs production project settings, auth URLs, data retention/deletion design, and verify two-account authorization evidence.
- **Gemini:** permit free-tier synthetic testing only. When upgrading to a suitable paid/data-handling tier, verify current terms, consent, endpoint limits and supply one authorized real test transcript via safe means. Until then real transcript production processing is `BLOCKED`, not complete.
- **Review:** inspect one real catalog-backed degree scenario, one nontrivial generated schedule/overlooked prerequisite, one preview/undo, mobile UI, downloaded PDF, guest migration, and security matrix. Ask L for evidence, not repeated tests it already passed. Approve or reject production deployment explicitly.

## 10. Implementation session materials and kickoff messages

Copy the **nine** files (eight Markdown specs plus `.github/pull_request_template.md`) into repository root/`.github` paths exactly. Keep `AGENTS.md` and `CLAUDE.md` at root; do **not** invent `CODEX.md`.

**Tools/access required:** VS Code, authenticated Codex CLI ×2 and Claude Code ×3, Node/npm, Git/GitHub repo, Docker/local Supabase option if available, Supabase project and migrations permissions, Vercel access, Gemini project configuration, synthetic labeled PDFs and later approved real transcript, user's official CIS interpretation and catalog year. L should request any missing artifact at the kickoff, not in this planning conversation.

**Codex 1 / Lead message:** “Read `AGENTS.md`, `PROJECT_SPEC.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `ACADEMIC_ENGINE.md`, `TEST_PLAN.md`, `PARALLEL_IMPLEMENTATION.md`. Request my official ASU CIS catalog interpretation and governing year. In your own worktree, create a contracts/CI foundation PR with real tests and wait for me to personally merge it via GitHub. After baseline merge, coordinate four feature worktrees, review every PR, test integration, and request approval before merges or production deployment.”

**Claude 1 / Engine message:** “Read root `CLAUDE.md`/`AGENTS.md`, `ARCHITECTURE.md`, `ACADEMIC_ENGINE.md`, `TEST_PLAN.md`. Own only `src/catalog`, `src/engine` and their tests. Use frozen contracts, synthetic fixtures until human ASU catalog is reviewed. Implement/test deterministic audit, prerequisite and bounded scheduling. Push/open a concise PR with exact results; no merges.”

**Claude 2 / Frontend message:** “Read root `CLAUDE.md`/`AGENTS.md`, `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `TEST_PLAN.md`. Own screens/UI/styles/export and tests. Implement three screens, both planning paths, availability, transcript consent/manual entry, preview/apply/undo, responsive controls and PDF export. Use fixtures only for isolated development. Push/open an evidenced PR; do not merge.”

**Claude 3 / Supabase message:** “Read root `CLAUDE.md`/`AGENTS.md`, `ARCHITECTURE.md`, `TEST_PLAN.md`. Own auth/persistence and Supabase migrations/SQL tests, **not** Gemini function. Implement owned cloud save, guest conversion, RLS/grants and two-account tests. Push/open concise PR with actual security results; no merges.”

**Codex 2 / Gemini message:** “Read `AGENTS.md`, `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `TEST_PLAN.md`. Own `src/transcript`, `supabase/functions/extract-transcript` and their tests, **not** Supabase Auth/DB. Implement secure server-side Gemini Vision extraction of proposed records, schema validation, completeness checks, typed errors and synthetic fixtures. No real unredacted transcripts on unsuitable free tier. Push/open an evidenced PR; no merges.”

## 11. Reviewable engineering references (verify at implementation)

- Git worktrees: https://git-scm.com/docs/git-worktree
- GitHub pull-request template: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository
- GitHub branch protection/status checks: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub Actions `pull_request`: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Gemini terms and PDF understanding: https://ai.google.dev/gemini-api/terms and https://ai.google.dev/gemini-api/docs/document-processing
