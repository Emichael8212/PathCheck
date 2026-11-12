# PathCheck — Decision Record

**Status:** Approved design freeze for new coding session · **As of:** 2026-11-11.  
This is the canonical record of *why* a choice was made; precise contracts are in `ARCHITECTURE.md` and `ACADEMIC_ENGINE.md`. Do not reopen a locked choice without explicit human approval. “Pending external evidence” is not an invitation to fabricate a result.

## Product and user-experience decisions

| ID | Decision | Rationale / constraint | Status |
|---|---|---|---|
| UX-001 / UX-004A | Exactly three primary screens: Get Started, Academic Record, Graduation Planner; no mandatory account | Minimize navigation and data-entry friction | Approved |
| UX-002 | Manual coursework input plus optional Gemini transcript upload, one normalized academic record | Manual path remains reliable regardless of extraction availability | Approved; Gemini deployment subject to privacy gate |
| UX-002A-R1 / UX-002B-R1 | Extraction summary with optional details/focused edits, no per-course confirmation grind | Preserve usability without silently accepting incomplete or ambiguous records | Approved |
| UX-003A | Concise evidence-aware graduation outlook, separate issues and unknown-evidence sections | “On track” without assumptions would mislead | Approved |
| UX-003B | Up to three prioritized issue cards, explain-on-demand, source and recommended next action | Keep planner understandable | Approved |
| UX-003C | Dominant editable semester timeline; Add/Move/Remove, no drag-and-drop | Supports actual planning and easy validation | Approved |
| UX-003D | Preview → explicit apply/reject → undo; atomic swaps and downstream revalidation | No silent mutation or claims of improvement unsupported by constraint checks | Approved |
| UX-003E / UX-001A | Contextual student-assisted availability: up to three high-impact course+term questions, Listed/Not listed/Unknown/Skip, editable and dated | Registration portal is private; cannot infer offerings, open seats, or future patterns | Approved |
| UX-004B | Initial planner choices: “I already selected courses” vs “Help me build a plan”; one preliminary unadopted draft | Preserve student ownership; avoid automatic scheduling as a default | Approved |
| UX-004C | Guest-first with optional account, safe guest migration, cross-device save, PDF export | Entire planning journey should work without registration; saving optional to *user*, not optional to *MVP implementation* | Approved |
| UX-005 | Desktop: compact outlook → priority issues → timeline; mobile stacked accordion and contextual sheets; visual differentiation of provenance | Prioritize understanding and action | Approved |

## Technical and academic decisions

| ID | Decision | Why | Status |
|---|---|---|---|
| ARCH-001 | Bounded requirement groups: fixed required course, all-of, choose-N, minimum credits from eligible set, total degree credits; separate catalog, student records, plans, evidence and derived analysis | Covers the initial program while keeping rule semantics inspectable | Approved |
| ARCH-002 | Prerequisite Boolean expression tree (ALL/ANY/COURSE grade/COREQUISITE/UNRESOLVED) plus derived graph preserving OR semantics | A simple dependency graph cannot encode options, concurrency, or minimum grades | Approved |
| ARCH-003 | Deterministic audit and validation followed by **bounded** candidate search; detect unselected courses, slack, sensitivity to unknown offerings | Real planning requires evaluating impacts, but general academic rule solvers are out of scope | Approved |
| ARCH-004 | React + TypeScript + Vite client-first; pure framework-independent academic engine; Supabase Auth/PostgreSQL for accounts; Vercel deployment | Isolated domain correctness with guest functionality and manageable setup | Approved |
| ARCH-004-T | **Google Gemini Vision AI** selected for transcript data extraction, over PDF.js as primary extractor; manual selection fallback | Layout-aware PDF handling is desirable; choice does NOT assert proven accuracy | Technology locked; real-transcript operational safeguards pending |
| ARCH-005 | Catalog, extraction, academic correctness, scheduling, database authorization, UI and full E2E release gates | A polished UI is not evidence of valid graduation advice | **Approved by user** |
| SCOPE-001 | **All F01–F20 features are mandatory MVP**, regardless of build order | No P0/P1/P2 labels may be used to quietly delete features | Frozen |
| EXEC-001 | Planning conversation ends with Markdown package; implementation begins later in new VS Code session using Codex CLI and Claude Code | Preserve explicit authorization boundary | Approved |
| EXEC-002 | Target one **calendar day** using dependency-aware parallel agents and lead integrator; no guarantee | Parallelism may reduce elapsed time but not all sequential gates | Target locked; feasibility assessed in `PARALLEL_IMPLEMENTATION.md` |

## Working program baseline vs unverified academic rules

- **Locked program:** Alabama State University, undergraduate Bachelor of Science in Computer Information Systems.
- **Working official source:** [ASU 2025–2027 Undergraduate Bulletin — CIS Major](https://alasu.smartcatalogiq.com/en/2025-2027/undergraduate-bulletin/academic-offerings/degree-granting-colleges/percy-j-vaughn-jr-college-of-business-administration/department-of-computer-information-systems/computer-information-systems-major).
- **Not finalized:** applicable catalog year for the modeled student/cohort, and the user's verified interpretation of requirements. At implementation kickoff the lead **must ask user for the authoritative interpretation/document**, confirm its governing year and source, review each rule, and then publish the validated structured catalog. Do not substitute an automatically scraped interpretation.
- **Known catalog conflicts that require reconciliation:** the public 2025–2027 page labels orientation “1 hour” but shows ORI 130 = 3, claims 24 major-course credits yet its displayed entries sum to 22, and contains other credit/listing anomalies. Do not silently “fix” numbers or fill missing credits. An advisor/department source may be needed.
- **Source status:** `verified` / `disputed` / `unsupported` / `awaiting_document`; affected degree totals or projected feasibility remain conditional or unevaluated when requirements are disputed.

## Gemini privacy decision: selected technology ≠ permission to send protected data

- Gemini is used **only** to extract and propose normalized course attempts. The deterministic academic engine exclusively makes academic rule and scheduling evaluations.
- During development, use **synthetic or responsibly de-identified** test PDFs with the free tier; no actual personal/confidential student transcript there. User will supply a real testing transcript **after upgrading to an appropriate paid tier**, which must be verified first.
- The Gemini API **unpaid-service** terms state submitted content may be used for product improvement, may receive human review, and warn not to submit sensitive/personal information. The **paid-service** terms restrict model-improvement use but have other logging/retention conditions. Relevant official terms: https://ai.google.dev/gemini-api/terms and https://ai.google.dev/gemini-api/docs/zdr . Check current terms at implementation/deployment.
- Production: use secure server-side function, secret management, consent recorded at time of upload, reject unsafe environment/tier, no automatic cloud PDF storage, bounded file sizes/costs, no raw PDF or extracted sensitive text in logs. User may decline and continue manually.
- A structured JSON response **does not** prove semantic accuracy or completeness. See https://ai.google.dev/gemini-api/docs/structured-output . Validate against ground truth, catalog, row/page counts when possible; explicitly report uncertainty and reject unsupported output.
- **Unresolved:** paid-tier account/billing configuration, model choice/price as of actual implementation, data-processing eligibility, representative fixture set, and production extraction accuracy. None overrides ARCH-005.

## Build and collaboration decisions

- **Five specific roles (locked):** Codex Agent 1 lead integrator; Claude Agent 1 academic engine; Claude Agent 2 frontend/UX; Claude Agent 3 Supabase authentication/persistence; Codex Agent 2 Gemini transcript extraction. Separate **four implementation worktrees plus lead worktree** and exclusive paths; the lead alone authors/finalizes shared TypeScript contracts and integration adapters. Agent-role assignment does not change the approved F01–F20 MVP.
- **Human-controlled GitHub workflow:** Each agent commits/pushes a feature branch and opens an evidence-backed PR. The lead reviews, coordinates and tests integration, resolves conflicts in a separate worktree and gives a clear human-facing merge recommendation. **No agent—including the lead—merges to `main`, enables auto-merge, pushes to `main`, bypasses protections, or performs a merge even after human approval.** Agents commit/push only their assigned feature branches; the lead tests on a local-only, uncommitted, unpushed temporary integration branch. **The human personally performs each GitHub PR merge** and separately authorizes production deployment.
- **Mandatory professional PR style:** Use `.github/pull_request_template.md` with `Summary`, `Tests`, `Evidence`, `Known Issues`, normally **100–200 words or fewer**, max three summary bullets. Exact executed commands/results, applicable UI/logic/security evidence, and `BLOCKED`/`NOT RUN` actions are mandatory. No fabricated PASS/screenshots/logs; failing/blocked mandatory tests prevent ready-to-merge status. Lead establishes GitHub Actions PR CI and retests integrated application after approved merges.
- **Working feature PRs only:** Except for the tested contracts/CI foundation PR, each feature PR must contain functional code and passing independently executable tests. No UI-only mockups, placeholder controls, PDF skeletons, fake academic results or integration-stub-only PRs. Test doubles support isolated development but cannot count as integrated/live feature completion. **One integrated application** and one authoritative test suite remain mandatory.
- Human must review catalog decisions, privacy disclosure, payment/service setup, RLS tests, generated-plan edge cases, deployment settings, final feature matrix, and whether release gates are actually met.

## Outstanding external prerequisites (not open product-design questions)

1. User's correct CIS catalog interpretation and applicable year, at **start of coding**, not required in this planning chat.
2. Paid Gemini project and suitable data-handling terms before any **real** transcript upload, plus explicit informed consent; synthetic fixtures work before this.
3. Supabase project/admin access and authorized security migration deployment; Vercel project/domain access, environment secrets; plan for auth redirect URLs.
4. Reproducible representative labeled transcripts for extraction validation; 15–20 is a target, with supported layouts disclosed and unsupported formats rejected.
5. Claude Code/Codex CLI subscription availability and practical usage caps on the implementation date. Subscription access is not unlimited concurrency.
6. Official department clarification when published requirements conflict and could affect a completion claim.

## Change-control rule

When an external prerequisite is unavailable, agent must **record blocker and continue on independent work**; never invent academic rules, bypass RLS, process real transcript on unsuitable API tier, or quietly shrink MVP. Every source/contract change requires a dated update to this file approved by the lead and, for scope/safety changes, by the human.
