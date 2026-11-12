# PathCheck — Product Specification

**Status:** Scope frozen; engineering handoff for a NEW coding session. **Date:** 2026-11-11. **Version:** 1.0 planning baseline.  
**Authority:** Approved product/UX scope. `DECISIONS.md` records rationale; `ARCHITECTURE.md` defines interfaces; `TEST_PLAN.md` defines completion.

## 1. Product promise and bounded claim

PathCheck helps a student understand whether their **selected or proposed courses** follow applicable degree requirements, identify overlooked prerequisites and requirements, and construct a *conditional* graduation plan. It is **not** the university's registrar, an official degree audit, registration system, seat-availability checker, or graduation guarantee. Never describe projected dates as guaranteed; keep evidence/assumptions visible.

**Initial supported institution/program:** Alabama State University (ASU), undergraduate **B.S. in Computer Information Systems (CIS)**. **Applicable catalog year is not yet confirmed for the student's governing rules.** The public 2025–2027 undergraduate bulletin is the *working reference*, not license to silently apply it to every cohort. At implementation kickoff, **ask the human for their verified CIS catalog interpretation/document before encoding actual degree rules**. Validate its governing year and reconcile inconsistencies against the official source; unresolved items remain unresolved. No second university/program in this agreed MVP.

## 2. Frozen MVP feature inventory (all mandatory)

| ID | Feature / outcome | Required behavior | Acceptance reference |
|---|---|---|---|
| F01 | Three screens | Get Started → Academic Record → Graduation Planner; detail panels are not additional primary screens | T-UI |
| F02 | Two planner entries | Student has selected courses **or** asks for one preliminary generated plan | T-UI, T-SCH |
| F03 | Manual academic record | Add/edit course attempts, terms, credit, grade/status, transfers; manual path always works | T-DATA |
| F04 | Gemini transcript upload | Optional PDF upload; disclosed consent; secure server-side Gemini; extraction review/summary, rejection/manual fallback | T-GEM, T-SEC |
| F05 | Normalized academic record | Attempted/earned credits, repeats, incomplete and uncertain records distinguished | T-DATA |
| F06 | Source-linked degree audit | Bounded requirement groups, elective alternatives, allowed counting, disputed rules unresolved | T-CAT, T-ENG |
| F07 | Prerequisites/corequisites | Nested ALL/ANY, grade conditions, term ordering, conditional future completion and unresolved policies | T-ENG |
| F08 | Unselected-course detection | Analyze all outstanding requirements, not only selected upcoming courses | T-SCH |
| F09 | Graduation outlook | Concise, evidence-aware, clearly conditional target-semester feasibility, separate from issues and unknowns | T-SCH, T-UI |
| F10 | Student-assisted availability | Ask up to 3 high-impact **course+term** questions, Listed / Not listed / Unknown; allow skip/edit | T-AVAIL |
| F11 | Recommendations | Up to 3 prioritized concise issues, source/reason/next action and contextual explanation | T-SCH, T-UI |
| F12 | Interactive plan | Semester timeline; add/move/remove courses; no drag-and-drop required | T-UI, T-SCH |
| F13 | Candidate workflow | Preview → explicitly Apply or Reject → Undo; atomic swaps; downstream revalidation | T-SCH, T-UI |
| F14 | Preliminary generator | Produce ONE conditional multi-term draft through same real validated engine; never auto-adopt | T-SCH |
| F15 | Guest access | No signup wall; guest can perform entire planning flow | T-AUTH, T-UI |
| F16 | Supabase accounts | Optional email sign-in; secure per-user saved plans and structured academic record | T-AUTH |
| F17 | Guest→account migration | Preserve draft through auth; default Save as new; never silent merge/overwrite | T-AUTH |
| F18 | Returning students | List/open/edit/resave owned plans; detect stale analysis and write conflicts | T-AUTH, T-DATA |
| F19 | PDF export | Generate downloadable advisor-readable PDF with active plan, provenance, important uncertainties | T-EXPORT |
| F20 | Responsive UX | Approved desktop hierarchy, stacked/accordion mobile timeline, accessible controls | T-UI |

**Not authorized:** Dropping any item from the MVP to meet a clock. A smaller hackathon checkpoint can be discussed separately, but is not the MVP. A failing feature must be truthfully marked incomplete, not silently swapped with a mock. No artificial “successful graduation” responses.

## 3. Screen-level requirements

### Screen 1 — Get Started

- Pick supported university/program; display applicable catalog year and source status (cannot imply verified if not).
- Provide graduation target semester, with honest guidance that changing targets changes projections.
- Guest continues immediately; optional sign-in/save is secondary.
- Recognize unsupported catalog year/program and stop unsupported degree claims; allow user to adjust supported inputs.

### Screen 2 — Academic Record

- Default: clear manual add/edit for course code, title when resolved, credits, term, grade/status, origin and attempts. Unresolved transfer equivalents remain unresolved.
- Optional Gemini PDF upload: **before sending** show explicit third-party disclosure and ask consent; do not use a free/unpaid Gemini processing service for personal, unredacted academic transcripts. Secure function only. Synthetic/deidentified development fixtures can use free tier.
- Process to normalized *proposed* attempts; verify structure, evidence, page/row coverage where possible, duplicate/repeat handling and catalog matching. Show concise summary with optional full list and focused edit—not mandatory per-course confirmation.
- **Never** silently count uncertain grades/credits, unsupported transcript formats, unmapped courses, or unverified transfers. Reject unreliable extraction and immediately allow manual path.
- Do not persist the original uploaded PDF automatically, whether guest or signed-in.

### Screen 3 — Graduation Planner

**On entry show exactly two optional starting actions:**

A. **“I already selected courses”** — student enters only chosen upcoming-term courses. App audits those *and unselected requirements*; selected courses remain student-owned until explicit edit.

B. **“Help me build a plan”** — run the bounded scheduler once and show **one preliminary PathCheck-generated draft**, visibly unadopted until explicit acceptance.

After entry the desktop information hierarchy is **compact graduation outlook → up to 3 prioritized issues → dominant interactive semester timeline**. Mobile uses a stacked layout with expandable semesters/context sheets; avoid wide desktop-only grids. Keep issue list separate from evidence gaps, with progressive disclosure (“Why?”, “See prerequisite chain”, “View in plan”).

- Status/provenance distinguish **student-selected active**, **PathCheck suggestion adopted/active**, and **unadopted projection**. Never mix them semantically.
- Let student add, move, remove. Candidate recommendations preserve baseline and show meaningful delta (issue resolved, new issue, changed forecast, uncertainty); preview never mutates active plan. Explicit apply/reject and undo.
- Verify up to three high-impact unknown **course/semester** offerings when helpful; answer choices Listed, Not listed, Unknown/Can't check and Skip. Edits accessible near relevant course/issue. Reports are **student-reported, timestamped, unverified**; not proof of open seats, enrollment or recurring offerings. No private portal credentials requested or accessed.
- Export active accepted plan as PDF with date, catalog version, source labels, projections and unresolved items. Do not export unadopted proposals as official selections.
- Auth/save controls secondary; guests retain full analysis capability and can opt to save later.

## 4. Wording, truthfulness and evidence

- Prefer concise deterministic text from coded reason keys, not chatbot paragraphs. Gemini **only extracts academic record data**, never determines whether a course fulfills a degree, eligible prerequisites, likelihood of graduating, or recommended plan.
- Valid high-level outlooks: `conditional_path_found`, `target_at_risk`, `insufficient_evidence`, `known_constraints_block_current_plan`, `not_evaluated`; never `graduation_guaranteed` or unqualified `impossible`.
- Three separate views: **outlook** (what scenario suggests), **issues** (known conflicts and priorities), **evidence gaps** (unknown or disputed facts). It is possible to display all simultaneously.
- “Potential bottleneck” when offerings or constraints unverified; only “hard conflict” for sourced model violations. “No validated alternative found in bounded search” ≠ no university-approved path.
- External sources and student declarations remain distinguishable in the UI and report.

## 5. Critical journeys

1. **Manual selected-course journey:** choose program/target → enter history manually → selected course list → see prerequisite conflict and overlooked course → inspect sourced reason → student reports relevant offering → preview safer move/swap → apply → undo → export or save. Reopen and edit with authenticated account.
2. **Gemini journey:** choose program → optionally consent to sending transcript via approved paid-tier service → structured extraction → coverage/validation → summary/edit or reject/manual fallback → planner. Every step works with benign failure states.
3. **Generator journey:** enter history/target → Help me build a plan → obtain one conditional multi-term draft → inspect assumptions and dependencies → explicitly adopt/edit → export/save.
4. **Guest migration:** work while guest → sign in → draft survives → Save as new by default, even if account owns older plans → returning student later opens and revises without silent overwrite.
5. **Unavailable/unknown offerings:** report Not listed or Unknown for a course+term → engine reevaluates all dependent placements; never invent a seat or next offering.

## 6. Non-goals / boundaries (do NOT delete agreed features)

- No access to or scraping of private registration portals, passwords, seats, or personalized enrollment status.
- No generalized support for arbitrary university degree policies; unsupported restrictions are reported explicitly.
- No chatbot-based academic planning, perfect optimality assertion, or official university certification.
- No stored raw PDFs by default; no automatic externally sent transcript; no silent rule changes based on LLM interpretation.
- Future multi-university expansion is separate from the initial one-program MVP.

## 7. Release definition

Every F01–F20 feature must meet the corresponding pass/fail conditions in `TEST_PLAN.md`; unresolved external dependencies (catalog verification and suitable Gemini paid-tier configuration) are blockers for production claims. Implementation stages in `PARALLEL_IMPLEMENTATION.md` **do not change scope**. The human engineer alone authorizes public release after seeing test evidence; agents may not waive gates.
