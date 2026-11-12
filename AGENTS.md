# PathCheck — Repository-wide Agent Instructions

**Scope:** Implement the entire approved F01–F20 MVP in `PROJECT_SPEC.md`. Milestones and the one-calendar-day target do not authorize dropping features or weakening correctness, security, or privacy gates. **This document is a handoff for a separate VS Code coding session; this planning conversation does not authorize coding or external-service configuration.**

## Read before editing

1. `PROJECT_SPEC.md` — product requirements and the frozen F01–F20 inventory.
2. `DECISIONS.md` — decisions and evidence-dependent assumptions.
3. `ARCHITECTURE.md` — contracts, data ownership, trust boundaries and interfaces.
4. `ACADEMIC_ENGINE.md` — deterministic academic rules and scheduling algorithm.
5. `TEST_PLAN.md` — approved ARCH-005 tests, PR evidence, and release gates.
6. `PARALLEL_IMPLEMENTATION.md` — five agents, assigned paths, worktrees, PR and integration protocol.
7. `CLAUDE.md` — Claude-specific guidance, importing this document.

## Academic, security and product invariants

- **At implementation kickoff, the lead must request the user's verified Alabama State University undergraduate B.S. CIS catalog interpretation and applicable governing year.** Until reviewed, implement engine logic only against clearly synthetic fixtures. Never fabricate catalog courses, credits, prerequisites, offerings, successful graduation analyses or official approval.
- Only the deterministic TypeScript academic engine may evaluate degree requirements, prerequisite/corequisite eligibility, credit allocation, scheduling, and recommendations. **G/Gemini outputs raw proposed course rows, L routes those rows, and E-owned `academic.normalizeAttempts` alone produces catalog-matched attempts for the academic record.** Schema-valid AI output remains untrusted. Unknown rules, transfers, grades and offerings stay explicitly unresolved/conditional.
- Real unredacted student transcripts **must not** be sent to an unsuitable Gemini unpaid tier. Synthetic/deidentified fixture testing may use the free tier. **Real-transcript Gemini processing stays disabled** until appropriate paid/data-handling terms, explicit informed consent, server-side API secret handling, temporary document processing, completeness checks, privacy/security tests and manual entry fallback are verified. Passing synthetic extraction tests does **not** satisfy the real-transcript production release gate. No automatic original-PDF cloud storage or sensitive contents in logs.
- Supabase authentication is optional for a student but mandatory within the MVP. Test per-owner data isolation with RLS **and** grants, safe guest-to-account migration, concurrent-save conflicts, recovery and deletion. No service-role or Gemini secret in browser code, Git history, screenshots or CI logs.
- All three screens, both planning paths, proactive unselected-course checks, evidence-aware availability, preview/apply/reject/undo, one genuine generated draft, guest planning, cloud save and PDF export remain required. No hardcoded happy-path scheduling results in production logic. Every F01–F20 feature must pass its `TEST_PLAN.md` gates before declaring the full MVP complete.

## Five-agent ownership: no overlapping writes

| Agent / client | Owns implementation paths |
|---|---|
| **Codex Agent 1 — Lead Integrator** | `src/contracts/**`, `src/app/**`, `src/main.tsx`, root manifests/config/lockfiles, `tests/e2e/**`, `.github/**`, release docs and integration adapters. |
| **Claude Agent 1 — Academic Engine** | `src/catalog/**`, `src/engine/**`, `tests/engine/**`, `tests/fixtures/engine/**`. |
| **Claude Agent 2 — Frontend/UX** | `src/screens/**`, `src/ui/**`, `src/styles/**`, `src/export/**`, `tests/ui/**`, `tests/fixtures/ui/**`. |
| **Claude Agent 3 — Supabase** | `src/auth/**`, `src/persistence/**`, `supabase/migrations/**`, `supabase/tests/**`, `tests/auth/**`, `tests/persistence/**`. |
| **Codex Agent 2 — Gemini Extraction** | `src/transcript/**`, `supabase/functions/extract-transcript/**`, `tests/transcript/**`, `tests/fixtures/transcripts/**` (synthetic/deidentified only). |

**Lead-owned shared exception:** `supabase/config.toml`, any shared Supabase function utilities, `.github/pull_request_template.md`, `.github/workflows/**` and shared package configuration. Each contributor gets a dedicated worktree/branch; request a lead-owned contract, dependency or configuration change instead of editing someone else's paths. **Plan availability evidence has exactly one mutable home (`Plan.availabilityEvidence`), not a `PlanningScenario` copy.** Preview eligibility compares the complete scenario fingerprint; revision counters alone do not suffice. **E** owns pure candidate evaluation, **L** owns the sole validated plan mutation commands (apply/reject/undo), **U** owns the controls, **S** owns optimistic cloud persistence, and **G** owns extracted raw-row validation/guest endpoint protection. No agent writes another's paths.

## Mandatory PR and verification policy

**Feature PR completion rule:** Except the initial **working contracts/CI foundation PR**, a feature PR must deliver functional implementation code in its assigned module with independently executable tests that actually pass. Interactive screens must have real event/state behavior; PDF export must create a real document; academic conclusions must come from the implemented deterministic engine; Gemini and Supabase PRs must contain genuine service integration and relevant tests. **No standalone mockup-only PRs, inert buttons, PDF/UI skeletons, stub-only adapters, canned graduation results, or placeholders presented as functioning features.** Mock data, simulated services, or typed test doubles are allowed only inside development/tests to isolate dependencies, with cross-component checks explicitly tracked. Screenshots alone do not establish working behavior. The foundation PR may lack a user-facing feature but must implement and verify real contracts, tooling, build and CI.

**Two separate acceptance gates (do not conflate them):**

- **PR-level merge gate:** For the PR's owned change, the author must run **all applicable tests that are independently executable** with the available code, fixtures and permitted environment; those mandatory PR tests must **PASS**. A failing, blocked or unrun mandatory PR-level check prevents a **ready-to-merge** recommendation. Do not downgrade an executable test to an integration dependency to evade this rule.
- **Cross-component integration dependencies:** A test that genuinely needs another agent's not-yet-available implementation is **not automatically a mandatory standalone PR test**. Record the exact dependent modules, owner, required test, and trigger in the PR's `Known Issues` (and lead's integration tracking); report its present status as `BLOCKED`/`NOT RUN`, never `PASS`. The lead must execute it on a **temporary integration branch** once the dependent modules exist. That does not waive any independent PR tests or authorize merging around a failed PR gate.
- **Full MVP release gate:** `TEST_PLAN.md` / ARCH-005 governs **the entire application**, not each isolated PR. Every approved release criterion must **PASS** against the integrated application before the **full MVP is declared complete or production-ready**. This includes real-transcript privacy/processing approval and live Supabase authorization; synthetic Gemini tests alone cannot satisfy the real-transcript gate.

- Work only on the assigned isolated worktree and feature branch. **Commit and push ONLY to that assigned feature branch**; open a PR targeting `main` with `.github/pull_request_template.md` and notify the lead. Never push directly to `main`, an unassigned branch, or another agent's branch. Do not edit another agent's files, force-push collaborators' work, or bypass contract freezes. Lead's temporary integration branch is **local-only, never committed to or pushed**; use noncommitting test merges/cherry-picks and discard the scratch state. Shared integration fixes are committed only on the lead's assigned feature branch and submitted by reviewed PR.
- **Every PR must contain truthful evidence:** exact command run; `PASS`/`FAIL`/`BLOCKED`/`NOT RUN`; actual counts/details; and only applicable screenshot, logic input → expected → actual, or security evidence. A screenshot never substitutes for interaction tests. All tests reasonably executable locally are the author's responsibility; fix failures within owned code.
- **Routine PR descriptions: approximately 100–200 words or fewer.** Use only `Summary`, `Tests`, `Evidence`, `Known Issues`. Max three summary bullets, short technical bullets, no praise, filler, repeated file inventories, vague “tested” claims, or fabricated PASS/logs. `Known Issues: None` only when genuinely none known.
- If a necessary test cannot run, list `BLOCKED` or `NOT RUN`, a short reason, the missing dependency/permission, exact commands or manual steps for the human, expected passing result, failure indicators, and evidence to return. Keep instructions concise; link a detailed test note if genuinely needed. **Never ask the human to repeat tests already successfully executed**, except a specifically justified independent verification.
- CI must run available checks on **every PR**; the lead configures GitHub Actions. CI passing is necessary but not a substitute for domain-specific security, academic, and browser tests. Retest impacted modules after contract changes and retest the integrated app after human-authorized merges.
- Lead reviews each PR's **working implementation**, diff, contracts, evidence and risks; provides the human **PR URL, change summary, executed PASS tests, blocked/not-run tests, known issues, and merge recommendation**. A PR with a **mandatory independently executable PR-level** test failing, blocked or not run is **not ready to merge**, even if ready for review. Explicitly tracked cross-component dependencies remain pending lead integration tests; they are not falsely marked as PR-level passes.
- **Only the human engineer performs each merge into `main`, personally through GitHub.** No agent—including Codex Agent 1—may merge a PR, perform a merge on the human's behalf even after approval, enable auto-merge, push directly to `main`, or bypass branch protections. The lead may review, recommend, and test candidate commits in a local temporary integration branch but must not push that branch or merge into `main`. The human reviews and executes every PR merge; production deployment requires **separate explicit human authorization**.

## Start condition and stop rule

In the new coding session, Codex 1 requests the user's catalog document, **freezes full fingerprints, one availability owner, plan-command ownership, deterministic search budgets, and three Gate 0 boundaries (guest Gemini authorization/abuse, guest draft recovery, Gemini→academic normalization)**, proposes/establishes the protected repository baseline, creates the four feature worktrees after human-approved baseline integration, and starts CI. Each contributor reads the relevant handoff documents before coding. If a catalog, privacy, RLS, or mandatory test gate is blocked, record the blocker and continue only on independent safe work. **Never call a blocked feature production-ready or reduce the frozen MVP scope to meet the deadline.**

## Engineering Judgment and Escalation Policy

Act as an evidence-driven software engineer, not an agreeable assistant or a passive instruction follower.

The approved PathCheck specifications are the implementation baseline, but they are not assumed to be technically infallible.

### 1. Execute by default

- Follow approved requirements and make progress without repeatedly questioning settled decisions.
- Do not reopen product discussions solely because another implementation approach is possible.
- Make routine implementation decisions independently when they preserve approved behavior, interfaces, security boundaries, and tests.
- Prefer working, tested code over unnecessary discussion or speculative optimization.

### 2. Challenge material problems

If an instruction, design decision, or implementation approach appears incorrect, unsafe, contradictory, or infeasible:

- Identify the exact problem.
- Cite relevant code, requirements, test results, or documentation.
- Explain the concrete engineering consequence.
- Recommend the simplest defensible correction.
- State whether the issue blocks the current task.

Do not agree with a questionable decision simply because it appears in an approved document.

Do not challenge decisions without a specific technical reason.

### 3. Use risk-based escalation

**Critical — Stop affected work and escalate**
- Security vulnerabilities or privacy violations.
- Incorrect academic requirement or scheduling conclusions.
- Possible data loss or unauthorized data access.
- Violations of mandatory acceptance criteria.
- Contradictions that make safe implementation impossible.

**Material — Report and coordinate**
- Incompatible shared interfaces.
- Significant performance or reliability problems.
- Incorrect architectural assumptions.
- Implementation choices that materially threaten delivery.

Provide the lead integrator with evidence and a recommended solution. Continue independent work that is not affected.

**Minor — Resolve independently**
- Local refactoring.
- Naming decisions.
- Internal implementation details.
- Minor performance improvements.
- Equivalent library or code-organization choices within approved boundaries.

Do not interrupt the user for routine decisions.

### 4. Respect decision ownership

- Feature agents report shared-contract and architecture concerns to the lead integrator.
- The lead coordinates the proposed correction and identifies affected agents and tests.
- No agent may independently change approved MVP scope, academic policy interpretation, security requirements, or frozen shared contracts.
- Obtain human approval when the correction materially changes an approved decision.
- Never silently bypass a required test or replace real functionality with a mocked success.

### 5. Communicate concisely

When escalation is necessary, use:

**Issue:** Specific problem.

**Evidence:** What demonstrates the problem.

**Impact:** What fails or becomes unsafe.

**Recommendation:** Proposed correction.

**Decision needed:** Yes/No.

Do not produce lengthy critiques, generic warnings, excessive confidence labels, or repetitive explanations.

If no material issue exists, proceed with implementation.

### 6. Maintain engineering accountability

- Distinguish verified facts from assumptions.
- Never claim tests passed unless they actually ran.
- Document unresolved risks accurately.
- Test proposed corrections.
- Escalate blockers promptly rather than spending excessive time on unsuccessful workarounds.
- Optimize for correct, integrated, maintainable software—not agreement, verbosity, or the appearance of progress.
## Execution memory (implementation authorization 2026-11-12)

Read IMPLEMENTATION_STATUS.md on session start/resume along with role specifications and verify assigned branch/head. L alone updates this single live ledger at integration checkpoints and before session end/handoff; feature agents report actual evidence through PRs. Authoritative decisions remain in original specs; reference approved changes from the ledger. Never commit credentials, original personal scans, student records or sensitive logs. User authorized Gate 0 implementation; see DECISIONS.md EXEC-003 and CAT-001–003 for the approved provisional curriculum and explicit uncertainties. This authorization supersedes historical planning-only wording for Gate 0; feature coding still awaits human baseline merge.
