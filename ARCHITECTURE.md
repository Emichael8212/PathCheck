# PathCheck — System Architecture and Shared Contracts

**Status:** Implementation design contract (no application code). **Owner:** Lead integrator.  
Related: `PROJECT_SPEC.md` (what), `ACADEMIC_ENGINE.md` (rules and algorithms), `TEST_PLAN.md` (proof), `PARALLEL_IMPLEMENTATION.md` (ownership).

## 1. Shape and trust boundaries

```text
Browser (React/Vite/TypeScript)
  |-- Screen 1 / Screen 2 / Screen 3, optional auth, browser PDF export
  |-- Immutable planner state + transient proposed edits
  |-- Pure, independently tested academic engine
  |      consumes versioned, reviewed catalog and normalized academic records
  |      returns decisions with evidence and uncertainty (never LLM calls)
  |-- Catalog files: reviewed & provenance-linked; no scraping during audit
  |-- Supabase client (publishable key only) -----> Supabase Auth + RLS Postgres
  |-- Gemini upload consent -> secure ephemeral Edge Function -> Gemini API
                                        ^          (approved processing tier)
                           rate limits, key and consent checks, size/type limits
```

**Trust distinctions:** (1) Catalog data is *official/reviewed* or disputed, with references. (2) Student reports of course offerings and academic records are claims, not verification. (3) Gemini outputs are untrusted proposed text extraction. (4) Planner analysis is a deterministic *modeled* conclusion; browser-calculated results are advisory and not tamper-proof. (5) Authenticated persistence is restricted by database grants/RLS, not protected merely by hidden UI components.

**Privacy:** uploaded PDF held transiently for processing, not persisted automatically or logged; if remote, student consent first and suitable Gemini terms. Cloud save stores structured record and plan, never automatically original PDF. Generated PDF export is separate and initiated by student.

## 2. Platform decisions

- Frontend: React + TypeScript + Vite; browser-only guest planning, independent of network where practical after loaded.
- Academic engine: pure TS package/module, zero React/Supabase/Gemini imports; deterministic given input and versions; no hidden I/O.
- Catalog: versioned JSON/TS-authored *reviewed data* sourced from the verified ASU CIS document and official citations. No invented academic rules or implicit use of another program's catalog. Incomplete rules produce unresolved states.
- AI ingestion: Gemini PDF Vision via **Supabase Edge Function** acting as secure proxy; schema-limited output and local/server validation; model cannot certify eligibility. Guest user must be able to request extraction with consent under bounded abuse controls even without creating an account.
- Persistence/auth: Supabase Auth + Postgres, RLS, optimistic revision checking; optional to student but mandatory feature in MVP; protected migrations and ownership tests.
- Hosting: Vercel static Vite site, Supabase for backend services. Lead prepares deployment and may execute production deployment **only after explicit human authorization**.
- PDF export: client-side generated **downloadable** PDF from accepted plan and deterministic labels, not raw transcript. Choose a maintained browser PDF library during implementation; include source/provenance and warnings.
- Testing: Vitest for domain/schema/unit, pgTAP or equivalent SQL RLS tests, Playwright for E2E, a security/configuration checklist; agent selection of libraries remains lead-controlled.

## 3. Canonical shared TypeScript data contract (freeze at Gate 0)

The **lead** must create `src/contracts/` before feature agents start coding. Field/type names below are normative; implementation syntax may be idiomatic TS with equivalent strict discriminated unions. Optional data must be explicit `null`/`unknown`, never silently default to success. Define `schemaVersion` for persistence and extraction.

### Identity and academic scope

| Type | Required fields and semantics |
|---|---|
| `CatalogRef` | `institutionId='asu'`, `programId='bs-cis'`, `catalogYearId` (e.g., `'2025-2027'` only after verification), `catalogVersion`, `ruleSetStatus`, `sources[]` |
| `SourceEvidence` | `sourceId`, `kind` (`official_catalog`, `department_confirmation`, `student_report`, `derived`), `urlOrRef?`, `observedAt?`, `description`, `verificationStatus` |
| `TermId` | `academicYear: number`, `season: 'spring'|'summer'|'fall'`, `sortIndex` calculated by authoritative term order; no lexical sorting of term labels |
| `CourseDefinition` | `courseId` canonical (`CIS-404`), display code/name, credit specification or `unknown`, prerequisite expression ref, governing source refs, supported/pending status |
| `RequirementGroup` | stable `requirementId`; variants `course`, `all`, `choose_n`, `min_credits`, `total_degree_credits`; allowed `courseIds`/subgroups, overlap rules, min/target, references and uncertainty status |
| `CatalogModel` | `schemaVersion`, `CatalogRef`, courses by ID, requirement groups, explicit restrictions/unsupported policies, validation results, **approved** state after catalog review |

### Student academic record, plan and evidence

| Type | Required fields and semantics |
|---|---|
| `CourseAttempt` | stable `attemptId`; `rawCourseCode`, `normalizedCourseId?`, original institution/origin, term, `attemptedCredits?`, `earnedCredits?`, `grade?`, `status` (`completed`, `in_progress`, `failed`, `withdrawn`, `incomplete`, `transfer_pending`, `unknown`), extraction/match evidence, confidence state; repeats are distinct attempts |
| `AcademicRecord` | `schemaVersion`, `recordRevision`, `courseAttempts[]`, `unresolvedItems[]`, optional student-entered supporting info; no raw PDF data |
| `PlanPlacement` | `placementId`, `courseId`, `termId`, `origin` (`student_selected`, `adopted_suggestion`, `system_projection`), `active:boolean`; unadopted projections cannot be active |
| `Plan` | `planId`, `planRevision`, `catalogRef`, `targetTerm`, `activePlacements[]`, `acceptedDraft?`, **authoritative `availabilityEvidence[]` and `availabilityRevision`**, updated timestamp; preview state separate. Evidence edits increment `availabilityRevision` and the plan's optimistic-save revision; do not create another mutable copy |
| `AvailabilityEvidence` | `courseId`, `termId`, `report` (`listed`, `not_listed`, `unknown`), `sourceKind`, `observedAt`, optional notes; student report never equals seats/confirmed enrollment |
| `PlanningScenario` | frozen `catalog`, `record`, `plan`, `engineVersion`, explicit term/credit-capacity assumptions and evaluation policy; availability is read **only from `plan.availabilityEvidence`**, never duplicated as a scenario field |

### Rule expressions

`PrerequisiteExpr` is a discriminated recursive union: `all(children[])`, `any(children[])`, `course(courseId, minGrade?, timing='prior_term')`, `corequisite(courseId, policy)` where policy explicitly specifies concurrency/prior-completion allowance, and `unresolved(description, sourceRefs[])`. An `all`/`any` may nest. The engine must return three-valued constraint states (`satisfied`, `unsatisfied`, `unresolved`) **with a separate future-completion conditional flag**; do not fold `unknown` into `false` or `true`.

### Analysis, candidate, and UI outputs

| Type | Required fields and semantics |
|---|---|
| `RuleFinding` | stable `findingId`, `code`, `severity`, `status`, `courseIds[]`, `termIds[]`, `requirementIds[]`, `sourceRefs[]`, `explanationParams`, `assumptions[]`, `nextAction?` |
| `DegreeAudit` | per-requirement satisfied/unmet/unresolved, earned vs applicable credits, allocation provenance, disputed rules, total status |
| `Outlook` | `kind` one of `conditional_path_found`, `target_at_risk`, `insufficient_evidence`, `known_constraints_block_current_plan`, `not_evaluated`; `targetTerm`; assumption/evidence references; never graduation guarantee |
| `InputFingerprint` | immutable canonical digest over **entire relevant scenario**: schema version; institution/program/catalog year, `catalogVersion` and reviewed rule/content digest; `recordRevision` plus normalized record digest; `planRevision` plus active-placement/target digest; `availabilityRevision` plus the full canonical `plan.availabilityEvidence` digest (course, term, source, observation, report); target term; capacity/term horizon/evaluation-policy assumptions digest; `engineVersion` and search-policy version/options when relevant. Stable serialization/order and hash are lead-frozen; revision counters alone are insufficient |
| `AnalysisResult` | `inputFingerprint: InputFingerprint`, `DegreeAudit`, `Outlook`, top findings, evidence gaps, bottlenecks, optional candidate recommendations; `isStale=false` only while fingerprint matches |
| `ChangeSet` | atomic array of `add`, `move`, `remove`, `swap` operations referencing stable placement/course/term IDs; must specify the **full `baseFingerprint`**, not merely `planRevision` |
| `CandidatePreview` | **`baseFingerprint: InputFingerprint`** equal to the fingerprint used to calculate it; proposed non-mutating placements, `ChangeSet`, before/after validation findings, assumptions, benefit class (`improved`, `tradeoff`, `no_valid_alternative`), `validabilityStatus`. No preview can be applied when *any* fingerprint component differs |
| `GeneratedDraft` | **one** separate unadopted multi-semester set of `system_projection` placements, assumptions and validation results; explicit `adopt` action required |
| `TranscriptExtraction` | `documentPageCount`, `detectedRowCount?`, **raw proposed rows**, field-level source page/row/quote where available, `unrecognizedRows[]`, `warnings[]`, `acceptanceStatus` (`accepted`, `needs_review`, `rejected`), model/schema metadata; never authoritative `CourseAttempt` mapping or degree eligibility |

**Contract invariants:**

1. IDs stable across UI/persistence. **Apply requires exact current `InputFingerprint` match and a fresh engine validation**, not just matching plan revision. Accepted atomic changes increment `planRevision` once and produce an undo checkpoint; reject never modifies Plan.
2. Every analysis and candidate carries the full `InputFingerprint`; a change to catalog/rules, normalized record, plan/target, authoritative availability evidence, assumptions, engine or search policy invalidates cached findings and pending previews, even if a revision counter was incorrectly reused.
3. Values marked `unknown`, `unresolved`, disputed, or student-reported are *not* elevated to verified by serialization.
4. A generated draft remains distinct from active plan until explicit adoption. `origin` survives saving/export.
5. Credit requirements distinguish earned credit, applicable credit, attempted credit, and elective-group assignment; catalog-credit conflicts cannot be resolved by an LLM.
6. API failures yield typed failure results; they do not yield fallback dummy positive academic analyses.

## 4. Module APIs (interface design, not implementation)

- `catalog.loadValidatedCatalog(catalogRef) -> CatalogModel | CatalogUnavailable`: returns only reviewed versions; awaiting user document is valid unavailable state.
- `academic.normalizeAttempts(validatedExtractedRows | manualRows, catalog) -> {record, unmatched, warnings}`: **E-owned authoritative normalization** retains raw attempts and unresolved mappings; only E applies verified equivalence/catalog rules.
- `engine.audit(scenario) -> DegreeAudit`; `engine.evaluate(scenario) -> AnalysisResult`; `engine.preview(scenario, changes) -> CandidatePreview`; `engine.validateCandidate(scenario, preview) -> ValidatedCandidate | TypedFailure`; `engine.generateDraft(scenario, boundedSearchOptions) -> GeneratedDraft | NoValidDraft | SearchInterrupted`. All pure and fingerprinted.
- **Lead-owned** `plannerCommands.applyPreview(currentScenario, preview, explicitUserAction) -> AppliedPlanWithUndo | StalePreview | ValidationFailure`; `rejectPreview(currentSession, previewId) -> SessionWithoutPreview`; `undoLast(currentScenario, undoCheckpoint, explicitUserAction) -> RevertedPlan | StaleUndo`. These commands are the **single plan mutation boundary**; U dispatches intentions and renders results, E provides pure validation, S persists with optimistic concurrency. See `ACADEMIC_ENGINE.md` for transaction semantics.
- `transcript.extract(consent, pdfBytes, processingEligibility) -> TranscriptExtraction | ExtractionFailure` through secure server-only Gemini call; then **G-owned** `transcript.validate(extraction, catalog) -> ValidatedExtractedRows | NeedsReview | Rejected` (format, provenance, row completeness and *provisional* code suggestions only). **Lead hands validated rows to E-owned `academic.normalizeAttempts`**; Gemini/G never emit authoritative degree-applicable `CourseAttempt` equivalencies or requirement decisions.
- `storage.createPlan`, `storage.listOwnedPlans`, `storage.getOwnedPlan`, `storage.savePlan(expectedRevision)`, `storage.deleteOwnedPlan`, `storage.deleteAccount`; all server/database operations enforce owner and input schema. Draft migration explicit Save as new by default.
- `exportPdf(plan, analysis, evidence) -> downloadable PDF` with defined provenance, no raw transcript.

## 5. Persistence and data lifecycle

Minimal relational ownership boundary: `plans(id, owner_user_id, catalog_ref, schema_version, revision, record_json, plan_json, created_at, updated_at)`. **`plan_json` is the only persisted availability-evidence state** (including `availabilityRevision`); there is no separate `availability_json` column or `PlanningScenario.availabilityEvidence` shadow copy. Structured JSON is schema-validated on read/write. Alternative normalizations are allowed only with lead approval and equivalent atomic ownership/revision behavior. Do **not** persist derived `AnalysisResult` as authoritative; recalculate from saved inputs/versioned catalog. Use optimistic compare-and-update on `revision`, with explicit conflict UI instead of blind last-write-wins.

- Supabase browser uses publishable key only. Schema grants minimized; enable RLS on every exposed student table, define select/insert/update/delete ownership policies tied to `auth.uid()`, including WITH CHECK for created/updated owner. Test two real test identities + unauthenticated role; deny cross-owner access.
- Authentication: optional email OTP/magic link; **primary guest conversion uses same-tab email OTP**. Preserve a structured, **no-PDF** guest draft in session storage for same-tab refresh/OTP/failed login; for cross-tab magic-link recovery, require explicit opt-in to a short-lived (maximum 24h), same-origin local recovery draft with shared-device warning, no automatic plaintext transcript-file storage, and immediate clear on save/cancel/expiry/sign-out. Session and recovery drafts require schema validation and version checks. Login is not permission to overwrite a plan; default is Save as new. Account deletion requires a protected privileged flow. No service-role/secret key in browser, repository, traces or exported PDF.
- Raw transcript: transient in browser and function memory where feasible; no auto cloud upload, no raw payload logging, no analytics/event properties containing grades. If Files API becomes necessary, explicitly account for retention/deletion and revise data-flow review.
- Sensitive PII from test documents never committed, printed to CI logs, or used in unpaid AI calls.

## 6. Transcript security boundary and consent

1. Browser displays intelligible disclosure *before network submission*: third-party recipient, purpose (extract course records), applicable processing tier, data handling, option to enter manually; explicit consent is not prechecked.
2. Browser uploads only with consent to `extract-transcript` secure Edge Function; HTTPS; allowed origin; MIME/signature, page count/size limits. **Gate 0 must freeze guest endpoint admission** without requiring a PathCheck account: server-verified anti-bot attestation (e.g. Turnstile), a short-lived single-use signed extraction ticket bound to a consenting guest session, and server-enforced per-session plus per-network quotas/concurrency and total provider-cost ceilings. Validate ticket, attestation and consent server-side; reject replay, exhaustion and forged origin. CORS is not authentication, IP alone is insufficient, and a browser-supplied `consent=true` flag alone is insufficient. Implement a protected test bypass **only in local synthetic fixtures**, never the public endpoint.
3. Server verifies **approved paid-tier configuration** for real records; if absent, real-document upload unavailable with informative explanation; synthetic fixture mode must not be exposed as a way to upload real records. Keep Gemini key only in server secret store. Prevent data egress outside described processor.
4. Server invokes a currently supported Gemini PDF/vision model with strict structured schema; set bounded output/timeouts and request ceilings. Response may be syntactically valid yet wrong. Do not log sensitive request/response.
5. G validates document/page/row coverage where possible; cross-checks course patterns, repeated attempts, credits/grades and **provisional** catalog-code suggestions. If completeness not demonstrable or unsupported, present `needs_review`/`rejected`; manual always available. Never silently assert 100% extraction of an unseen layout.
6. **Boundary:** G produces `ValidatedExtractedRows` carrying raw fields, provenance, uncertainty and tentative identifiers; L passes it to **E-owned** `academic.normalizeAttempts` using the reviewed catalog, yielding proposed `AcademicRecord` attempts with unresolved equivalents. UI presents summary/edit before acceptance. Only E's engine analyzes degree requirements. Do not persist raw file as part of plan save.

**Official references to recheck at implementation:** Gemini terms https://ai.google.dev/gemini-api/terms ; document processing https://ai.google.dev/gemini-api/docs/document-processing ; structured output https://ai.google.dev/gemini-api/docs/structured-output ; Supabase RLS https://supabase.com/docs/guides/database/postgres/row-level-security ; Edge secrets https://supabase.com/docs/guides/functions/secrets .

## 7. Integration order and ownership

Ownership and worktrees are defined in `PARALLEL_IMPLEMENTATION.md`: **five roles** (Codex lead, Claude academic, Claude frontend, Claude Supabase, Codex Gemini), each in a separate worktree. All feature agents consume lead-frozen `src/contracts/`. Supabase owns `src/auth/**`, `src/persistence/**`, `supabase/migrations/**` and `supabase/tests/**`; Gemini owns `src/transcript/**` and `supabase/functions/extract-transcript/**`. The lead owns `src/app/**`, shared dependencies, `supabase/config.toml`, GitHub Actions, E2E, and integration adapters. Agent-specific mocks are valid only for isolated development/tests, not as completed feature PRs or final release proof. Apart from the tested contracts/CI foundation, a feature PR must contain working owned functionality, not static screens, PDF skeletons, inert UI, canned academic results or stub-only integrations. All changes arrive by evidence-backed PR on each agent's **assigned feature branch only**. The lead reviews and resolves conflicts in an **uncommitted, unpushed local integration branch**, but **only the human personally merges PRs into `main` through GitHub**, even after approval. Production deployment requires separate explicit human authorization. Retest every affected module after schema/contract changes and rerun integrated tests after merges.
