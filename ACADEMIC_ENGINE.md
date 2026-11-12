# PathCheck — Deterministic Academic Engine

**Authority:** ARCH-001, ARCH-002, ARCH-003. **Implementation owner:** Claude Agent 1 (Academic Engine). **No LLM in rules or scheduling.**  
Data schema and interface names: `ARCHITECTURE.md`; tests and launch gates: `TEST_PLAN.md`.

## 1. Principle and scope

The engine answers: “Given *this versioned academic rule set*, *these student records*, *this target semester*, and *these stated assumptions*, what constraints can we validate and what conditional plan changes are defensible?” It must not certify official graduation, infer seat availability, assign equivalencies without authority, or make unsourced policy decisions.

Initial modeled degree: ASU B.S. CIS. A verified human-supplied interpretation/document is **required before building real ASU rules**. 2025–2027 bulletin is a working source; confirm applicable academic year and credit discrepancies. Until validated, use explicitly synthetic catalogs and fixture course codes for engine development. Test fixtures must label synthetic vs official. No production “121 credits complete” assertion based on disputed underlying rule interpretation.

## 2. Rule domains

1. **Catalog:** school/program/year/source/version; defined courses, credits and aliases; grouping of required/elective choices; supported prerequisite/corequisite rules; disputed/unsupported policy flags.
2. **Student history:** course *attempts*, not just unique course codes; term, grade, attempt/earned credits, transfer institution/equivalency state, in-progress/withdrawn/repeat statuses; grade standards not assumed unless sourced.
3. **Plan:** future course placements by term and provenance; active selections vs unadopted draft; target term; revision for conflict detection.
4. **Availability:** the single editable/source-of-truth state is **`Plan.availabilityEvidence[]` plus `Plan.availabilityRevision`**, keyed by (course, term), with source and observation timestamp. `PlanningScenario` references `Plan`, not a second evidence array. `listed` is not proof of a free seat. No future-semester recurrence inference without authoritative evidence.
5. **Analysis:** derived from the other four, never mutated as source truth; invalidated on version/revision change.

### Requirement group model

| Group | Semantics | Special checks |
|---|---|---|
| `course` | Named required course or accepted equivalence | Valid earned status and course match |
| `all` | Every child subrequirement satisfied | No accidentally shared restricted credits |
| `choose_n` | N distinct eligible alternatives | Don't recommend every listed alternative as mandatory |
| `min_credits` | At least required earned, **applicable** credits from eligible set | Distinguish raw total from degree-applicable total |
| `total_degree_credits` | Overall university/catalog requirement | Credits counted per sourced repeat/transfer policy; unresolved duplicates flagged |

The solver must allocate course attempts to requirement groups under actual overlap/double-count policies. Use a bounded assignment/flow/backtracking strategy appropriate to the small single-program model; do not simply sum groups independently. If multiple valid allocations exist, choose a deterministic tie-break (e.g., required groups first, then lexicographic requirement/course IDs) and expose allocations in tests. An unknown equivalency or conflict in counting must not silently satisfy a group. Some requirements may be satisfiable but allocation ambiguous; mark uncertainty and present evidence gap.

**Credit distinctions:** attempted ≠ earned ≠ applicable to degree ≠ assignable to specific group. Repeat policy, pass/fail, minimum grade for major, residence requirements, and transfer restrictions must be sourced or explicitly unresolved.

## 3. Prerequisite expression evaluator

Expression nodes (`all`, `any`, `course`, `corequisite`, `unresolved`) are parsed from approved catalog data, not generated ad hoc by Gemini.

- `course`: check qualifying completed attempt in **earlier term**, required minimum grade where the rule specifies one. In-progress earlier term only conditionally satisfies a *future* placement if assumed passed, never a present completed fact.
- `all`: all children must satisfy; any definite failure makes requirement unsatisfied; otherwise unresolved child makes it unresolved, with explicit conditional flags for future completion.
- `any`: at least one fully qualifying branch satisfies. If none satisfies and one could with missing evidence, unresolved; if all branches definitively fail, unsatisfied. Do **not** flatten OR into mandatory graph edges.
- `corequisite`: same-semester placement may satisfy only when the actual catalog rule authorizes it; prior completion is valid only if authorized by that policy. Evaluate coreq groups together, not as false cycles.
- `unresolved`: unsupported permission, academic-standing condition, ambiguous phrasing/transfer or catalog conflict; preserve source and reason; no optimistic pass-through.
- Strongly connected prerequisites: flag impossible/cyclic chains unless verified co-requisite equivalence explains allowed simultaneous enrollment; don't mistake legitimate coreq pairs for impossible cycles.

| Record / temporal scenario | Correct outcome |
|---|---|
| Required A earned, qualifying, earlier term | Satisfied |
| A planned same term as B, requires prior term | Unsatisfied |
| A planned previous future term, B later | Conditionally eligible, depends on future pass |
| A failed/withdrawn | Unsatisfied unless other qualifying attempt |
| A in progress without final grade | Conditional for eligible later term, unresolved as a completed credit |
| A credit transfer present but no verified equivalency | Unresolved |
| OR branch A satisfied, B absent | Satisfied (not two unmet prerequisites) |
| Requires C minimum grade, grade lower | Unsatisfied |
| Requires departmental permission | Unresolved until sourced confirmation |

## 4. Processing pipeline

1. **Validate inputs**: schema versions, catalog identifier and source status, term chronology, duplicate placement IDs, impossible credits, missing grade codes, contradictory active/projection flags; return typed errors not optimistic outcomes.
2. **Normalize and audit attempts**: course/term matching, earned vs attempted, repeats, transfer, unresolved, explicit requirement allocation.
3. **Check active plan**: degree coverage, term-aware prerequisite/corequisite constraints, credit-capacity assumption, duplicated future courses, already-completed-course choices (warn where appropriate), known unavailable course/term reports.
4. **Calculate conditional dependency pressure** across outstanding *necessary* requirements including alternatives, not just courses selected.
5. **Prioritize relevant unselected courses** and high-impact evidence checks.
6. **Explore bounded candidate changes** for selected-course path or **one** draft for generator path. Every candidate runs through identical validator.
7. **Return evidence-aware outlook, issues, unknowns, preview(s), and structured reason codes** with the **full `InputFingerprint`** from `ARCHITECTURE.md`: reviewed catalog identity/content, normalized record, current plan/target, authoritative availability revision+content, capacity/policy assumptions, engine and search settings.

All functions pure: no databases, network, model calls, wall-clock reads, or hidden mutable caches inside academic engine. Timestamps supplied in scenario. **Revision numbers alone do not prove a preview is current; the canonical input digests must match.**

## 5. Dependency/slack and neglected-course prioritization

Construct a derived dependency graph *for a particular evaluated choice of OR/elective paths*. Keep original Boolean requirements as ultimate truth. Graph may annotate alternative branches but must not count every `any` child as mandatory.

For each eligible outstanding course/alternative:

- Compute **earliest feasible term** under prerequisite and term-capacity assumptions; course availability may be unknown and therefore makes placements *conditional*.
- Compute **latest feasible term** relative to target in a candidate scheduling scenario, using backward propagation along necessary dependencies and capacity. It is *scenario-sensitive*, not universally certified.
- Compute **slack** (`latest - earliest` in ordered modeled terms) only when constraints and scenario can support it; otherwise `unknown`.
- Identify **unlock effect** (required dependent courses able to move earlier), **target sensitivity**, **requirement necessity/alternatives**, **available credit capacity**, and **evidence quality**.
- Label `potential_bottleneck` for narrow options under uncertain offerings; label `hard_conflict` only where modeled sourced rules prohibit the current selection.

**Prioritization rule:** Prefer interventions with demonstrable impact on known conflicts, required-course coverage, or scenario target feasibility. Tie-break deterministically; never invent a probabilistic urgency score. A course with many dependents but no target sensitivity should not automatically be labeled top priority. If a requirement is already satisfied by valid alternatives, do not recommend extra choices merely because they appear in catalog.

### Illustrative real-source chain (only if validated under applicable catalog)

ASU 2025–2027 course descriptions list CIS 404 with prerequisite CIS 206; downstream CIS 410/CIS 461 relationships are to be verified against the provided applicable catalog. This chain is an example, **not a hardcoded recommendation**. The engine should detect analogous patterns for any legitimate rules in fixtures.

## 6. Availability and evidence sensitivity

- Initial future offerings are `unknown` unless independently verified for **that course and that semester**. Never treat semester recurrence as verified from past lists.
- User can answer `listed`, `not_listed`, `unknown/cannot_check` for an exact course+term. Store `sourceKind=student_report`, timestamp and editable report. Listed ≠ enrolled and never claims open seats.
- `not_listed` excludes placement in the **student-reported** scenario and prompts conditional replanning; user can revise their report.
- Choose up to 3 availability prompts only where comparing hypothetical `listed` vs `not_listed` (or unknown) materially changes a candidate, target feasibility, or important issue; don't ask for trivial checks. Questions can relate to **unselected courses**.
- Unknown courses may be placed in *conditional draft* with explicit assumptions; do not show unconditional feasible graduation. If the user skips, retain unknown and make next action clear. Published schedule and seat inventory are not available through PathCheck unless separately authorized and verified.

## 7. Bounded candidate scheduling search

**Approved option B**, not exhaustive global optimality. The lead freezes **deterministic work limits** before implementation (proposed fixture-tested range: 6–10 future terms, 16–32 beam states, 500–1500 node expansions, stable candidate ordering and tie-breaks, a versioned search-policy ID). The engine must not read a clock or use a wall-time limit to choose an academic result. Equal canonical inputs + catalog/engine/search-policy versions + fixed budgets must return identical candidates, findings and stop reason. These limits are *search parameters*, not academic rules.

**Wall-clock responsiveness is external:** lead/UI may enforce a watchdog or cooperative cancellation for browser responsiveness, but interruption returns `search_interrupted` / `not_evaluated` with the active plan untouched, **never** `no_valid_draft`, `target_at_risk`, or a different preferred plan based on the machine's speed. Chunking/yielding may be used if it preserves expansion order and state. Tests repeat equal-input searches on different runtimes/after chunked execution; cancellation must not masquerade as academic infeasibility.

### Candidate state

- Remaining required courses and outstanding requirement groups (with alternative selection state); student active plan; term capacities (explicit user value or a clearly disclosed planning assumption), prerequisite graph/expressions, course+term availability evidence, target term, unresolved policies.
- Distinguish **known hard constraints** (sourced prerequisite, grade and restricted counting rules) from **conditional constraints** (future passes, unknown offering, hypothetical credit load). A course-placement search must not convert missing evidence into definite feasibility.

### Candidate exploration

1. Seed with student's selected future courses for analysis path; preserve their origin and present proposed changes separately. For generator path, start from the completed/remaining audit and no adopted future plan.
2. Build an eligible frontier from unmet necessary courses and choose-N paths; respect prior-term prerequisites, authorized coreqs, group credit needs, and term load.
3. Expand by assigning a course to an eligible term or by one explicit add/move/remove/swap; on every expansion run full validator. Discard known-hard-invalid states; retain conditional states with assumption labels.
4. Score **lexicographically** for (i) number/severity of known hard violations, (ii) requirement coverage and target-term existence, (iii) conditional uncertainty burden, (iv) disruption to student choices, (v) total slack and term-load balance; explicitly test tradeoffs. No “optimal” claim.
5. Stop after deterministic expansion/beam/horizon limits or on the first qualifying candidate under the stable ordering; present **one** preliminary plan with versioned assumptions, never auto-adopt. If no candidate is found within fixed search limits, return `no_valid_draft_under_search_bounds`, never `graduation_impossible`. If an external watchdog cancels the work, return `search_interrupted`/`not_evaluated` instead (no feasibility inference).

Candidate previews compare against baseline: fixed/new hard violations, newly included necessary courses, affected downstream course eligibility, changed outlook, changed assumptions. A candidate is `improved` only if a demonstrated academic benefit exists and no newly hidden hard conflict appears; mixed tradeoffs label `tradeoff`. If proposed alteration depends on unknown offerings, mark conditional. **Every `CandidatePreview` carries the full `baseFingerprint` computed over the exact frozen scenario; an edit to availability, catalog, record, target, capacity assumptions, plan or engine/search policy makes it stale.**

### Validated preview/apply/reject/undo contract and ownership

- **E / `src/engine/**` (pure):** `preview(scenario, changeSet)` computes the immutable before/after diff and academic validation with `baseFingerprint`; `validateCandidate(currentScenario, preview)` compares the **full current fingerprint** and reruns affected/full future constraint validation. Return typed `stale_preview`, `known_hard_conflict`, or `validation_error` instead of silently modifying a plan. Never self-apply.
- **L / `src/app/**` (only mutation/orchestration owner):** `plannerCommands.applyPreview` requires explicit UI apply intention, exact full fingerprint equality, a fresh `validateCandidate` result and any required acknowledgement of conditional assumptions. Apply the entire change set **atomically** to a new plan snapshot, increment `planRevision` once, and emit an undo checkpoint bound to **both** pre- and post-apply fingerprints. A rejected/stale/invalid preview cannot apply. `rejectPreview` discards preview-only state and leaves plan, revisions and persistence unchanged.
- **L / `src/app/**` (undo):** `undoLast` is an explicit request for the most recently applied atomic change. It accepts only if current fingerprint equals checkpoint's post-apply fingerprint (or succeeds after revalidation under a new equivalent, explicitly reviewed policy); otherwise return `stale_undo` and request reanalysis, never clobber later edits. Undo restores the earlier placements as a **new revision** (do not roll revision numbers backward), re-evaluates the academic engine, and clears the used checkpoint. Generated draft adoption follows the same explicit validate-and-apply transaction.
- **U / `src/screens/**`, `src/ui/**`:** owns button interactions, conditional-uncertainty warnings and display of `stale_preview`/`stale_undo`; dispatches user intentions through L's command facade only, **never mutates Plan directly**. **S / `src/persistence/**`:** owns revision-checked remote save/restore; save conflicts return `conflict` and never silently overwrite cloud data. A failed save leaves an honestly labeled unsynced local plan and usable undo, not a false Saved status.
- **Tests:** E checks fingerprint comparison and constraint revalidation; L tests atomic add/move/swap/apply/reject/undo and stale edits; U tests explicit user actions; S tests cloud revision conflicts; lead rechecks full integrated journey. No hardcoded positive scheduling results.

**Planning horizon / load:** Do not assert a university maximum or mandatory course load without source. If no personal load limit supplied, obtain one or use an explicit adjustable scenario assumption (“Plan modeled with up to X credits/term”). Summer offerings always unknown unless evidenced. All time arithmetic uses `TermId.sortIndex`, not alphabetical term names.

## 8. Graduation outlook semantics

| Outcome | Meaning |
|---|---|
| `conditional_path_found` | Bounded modeled scenario reaches required groups by target, relying on stated future completion, offerings, and any unresolved limits; **not a promise** |
| `target_at_risk` | Modeled tight/contradicted prerequisite or capacity sequence; a different path might exist |
| `insufficient_evidence` | Critical catalog/credit/transfer/offering info prevents defensible conclusion |
| `known_constraints_block_current_plan` | Specific current selections violate sourced constraints; not a global impossibility claim |
| `not_evaluated` | Missing required validated inputs, unsupported catalog/year, or engine failure |

The outlook is **separate from** top-three issue cards and all evidence gaps. Always provide explanation parameters, source references, reason codes and current revisions.

## 9. Failure modes / truth-in-advice rules

- Disputed catalog credit totals: no silent averaging or choosing the convenient number; affected audit unresolved.
- Course not found in catalog: retain raw attempt, mark unmapped, request manual resolution; do not discard as irrelevant.
- Duplicate repeats: unique attempt IDs; passing attempt may count according to verified policy only. Transcript extraction repetition is not automatically a legitimate repeat.
- OR prerequisite branches: one valid alternative is enough; the graph is a derivative, not a replacement for expression evaluation.
- Multiple degree uses for one course: only allow overlap if explicitly permitted; credits not multiplied.
- All proposed future completions are conditional; completed official credit remains distinct.
- Unknown availability: do not invent a term or seat.
- Search expansion exhausted: return deterministic `no_valid_draft_under_search_bounds`; external timeout/cancellation: `search_interrupted`/`not_evaluated` without a feasibility claim. In both cases preserve active plan.
- AI extraction: never given authority to create catalog definitions, infer missing grades, evaluate course eligibility, or choose a graduation date.
- Stale analysis: any change to record, target, catalog rules, active plan or evidence invalidates derived projections and previews.

## 10. Required test families / approval

Implement scenario fixtures as documented in `TEST_PLAN.md`: real verified catalog chains and synthetic alternatives, AND/OR/coreq/min grade, repeated/in-progress/transfer, credit allocation, elective selection, selected versus unselected pressure, unknown offering counterfactuals, atomic swaps, bounded search failure, stale versions, same input → same output. Agent provides fixture evidence to lead before merging. Never use hardcoded, successful sample outputs in product logic.
