// Public, pure AcademicService (contracts-v1 api.ts). No clock, network, model or I/O:
// every result is a deterministic function of the frozen PlanningScenario.
import { AnalysisResultSchema, DegreeAuditSchema, GeneratedDraftSchema, PlanningScenarioSchema, fingerprint } from '../contracts';
import type { AcademicService, AnalysisResult, DegreeAudit, GeneratedDraft, InputFingerprint, PlanPlacement, PlanningScenario, Result, RuleFinding, TypedFailure } from '../contracts';
import { listCatalogs, loadValidatedCatalog } from '../catalog';
import type { CatalogRegistry } from '../catalog';
import { analyzePlacements, issueFindings } from './analysis';
import type { PlanAnalysis } from './analysis';
import { dependencyInfo } from './dependency';
import { normalizeAttempts } from './normalize';
import { availabilityFor } from './planCheck';
import { requirementPoliciesUnmodeled } from './policy';
import { generateCandidates, preview, validateCandidate } from './preview';
import { createSearch } from './search';
import type { SearchOutcome } from './search';
import { ENGINE_VERSION, catalogBlocksConclusions, compareTuples, dedupeFindings, finding, shortDigest, stableId, uniqueSorted } from './util';

export type NoValidDraft = { kind: 'no_valid_draft_under_search_bounds'; expansions: number };
const fail = (code: TypedFailure['code'], reasonCode: string): TypedFailure => ({ ok: false, code, reasonCode });

/** Parse + engine-level input validation (pipeline step 1). */
function checkScenario(input: PlanningScenario): Result<PlanningScenario> {
  const parsed = PlanningScenarioSchema.safeParse(input);
  if (!parsed.success) return fail('validation_error', 'invalid_scenario');
  const s = parsed.data;
  if (s.engineVersion !== ENGINE_VERSION) return fail('validation_error', 'unsupported_engine_version');
  if (s.catalog.approval === 'unreviewed') return fail('unavailable', 'catalog_not_reviewed');
  return { ok: true, value: s };
}
function guard<T>(fn: () => Result<T>): Result<T> {
  try { return fn(); } catch { return fail('validation_error', 'engine_input_rejected'); }
}

/** Record chronology contradictions: a finished attempt placed inside the modeled future horizon. */
function chronologyFindings(s: PlanningScenario): RuleFinding[] {
  const first = s.assumptions.terms[0]!.sortIndex;
  return s.record.courseAttempts.filter(a => a.term !== null && a.term.sortIndex >= first && (a.status === 'completed' || a.status === 'failed' || a.status === 'withdrawn'))
    .map(a => finding({ code: 'attempt_term_chronology', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: a.normalizedCourseId ? [a.normalizedCourseId] : [], termIds: [a.term!], explanationParams: { attemptId: a.attemptId, status: a.status }, idParts: [a.attemptId], nextAction: 'review_academic_record' }));
}

const ISSUE_PRIORITY: Readonly<Record<string, number>> = {
  prerequisite_cycle: 0, prerequisite_unsatisfied: 1, reported_not_listed: 2, term_capacity_exceeded: 3,
  no_feasible_term_in_horizon: 4, target_at_risk_chain: 5, unselected_time_sensitive_course: 6, placement_after_target: 7,
  no_completion_found_under_search_bounds: 8, duplicate_placement: 9, course_already_completed: 10, unselected_required_course: 11,
  potential_bottleneck: 12, unselected_choice_requirement: 13, unselected_credit_requirement: 14, course_in_progress_replanned: 15,
};
function prioritize(findings: RuleFinding[]): RuleFinding[] {
  return dedupeFindings(findings.filter(f => ISSUE_PRIORITY[f.code] !== undefined))
    .sort((a, b) => compareTuples([ISSUE_PRIORITY[a.code]!, a.severity === 'error' ? 0 : 1, a.findingId], [ISSUE_PRIORITY[b.code]!, b.severity === 'error' ? 0 : 1, b.findingId]));
}

/**
 * Up to three course+term checks whose answer materially changes the analysis: a reported
 * `not_listed` would create a hard conflict for an active placement on a dependency chain, or
 * push a mandatory (possibly unselected) course's earliest feasible term past its latest.
 */
function availabilityQuestions(s: PlanningScenario, a: PlanAnalysis): AnalysisResult['availabilityQuestions'] {
  const terms = s.assumptions.terms; const ev = s.plan.availabilityEvidence;
  type Cand = { courseId: string; sort: number; rank: (number | string)[]; findingIds: string[] };
  const cands = new Map<string, Cand>();
  const offer = (courseId: string, sort: number, rank: (number | string)[], findingIds: string[]) => {
    if (availabilityFor(ev, courseId, sort)) return; // already answered (any report, incl. unknown) — never re-ask
    const key = `${courseId}@${sort}`; const prev = cands.get(key);
    if (!prev || compareTuples(rank, prev.rank) < 0) cands.set(key, { courseId, sort, rank, findingIds: uniqueSorted([...(prev?.findingIds ?? []), ...findingIds]) });
  };
  const offeringFinding = (pid: string) => a.planFindings.find(f => f.code === 'offering_unknown' && f.explanationParams.placementId === pid);
  for (const p of a.placements) {
    const pr = a.info.pressure.get(p.courseId);
    if (!pr || (pr.dependents.length === 0 && !pr.mandatory)) continue;
    const f = offeringFinding(p.placementId);
    offer(p.courseId, p.termId.sortIndex, [0, pr.slack ?? 99, -pr.dependents.length, p.courseId, p.termId.sortIndex], f ? [f.findingId] : []);
  }
  for (const b of a.bottlenecks) for (const t of b.termIds) offer(b.courseIds[0]!, t.sortIndex, [1, Number(b.explanationParams.slack ?? 99), b.courseIds[0]!, t.sortIndex], [b.findingId]);
  for (const u of a.unselected) {
    const c = u.courseIds[0]; const pr = c ? a.info.pressure.get(c) : undefined;
    if (!c || !pr || pr.earliest === null || u.code === 'unselected_choice_requirement' || u.code === 'unselected_credit_requirement') continue;
    const t = terms[pr.earliest]; if (t) offer(c, t.sortIndex, [2, pr.slack ?? 99, -pr.dependents.length, c, t.sortIndex], [u.findingId]);
  }
  const material = (c: Cand): boolean => {
    if (a.placements.some(p => p.courseId === c.courseId && p.termId.sortIndex === c.sort)) return true;
    // Counterfactual `not_listed` report for an unselected course: does its window close?
    const t = terms.find(x => x.sortIndex === c.sort)!;
    const hypo: PlanningScenario = { ...s, plan: { ...s.plan, availabilityEvidence: [...ev, { courseId: c.courseId, termId: t, report: 'not_listed', sourceKind: 'student_report', sourceRef: 'counterfactual', observedAt: s.assumptions.evaluatedAt, notes: null }] } };
    const before = a.info.pressure.get(c.courseId); const after = dependencyInfo(hypo, a.audit, a.placements).pressure.get(c.courseId);
    return !!before && !!after && (after.earliest !== before.earliest) && (after.earliest === null || (after.slack !== null && after.slack < 0) || (before.slack !== null && before.slack <= 1));
  };
  const out: AnalysisResult['availabilityQuestions'] = [];
  for (const c of [...cands.values()].sort((x, y) => compareTuples(x.rank, y.rank)).slice(0, 12)) {
    if (out.length >= 3) break;
    if (!material(c)) continue;
    const termId = terms.find(x => x.sortIndex === c.sort)!;
    out.push({ questionId: stableId('availability-question', [c.courseId, c.sort]), courseId: c.courseId, termId, findingIds: c.findingIds });
  }
  return out;
}

function completionSearch(s: PlanningScenario, fixed: PlanPlacement[], prefix: string, origin: PlanPlacement['origin'], active: boolean) {
  return createSearch({ scenario: s, fixed, placementPrefix: prefix, origin, active });
}

export function evaluate(input: PlanningScenario): Result<AnalysisResult> {
  return guard(() => {
    const checked = checkScenario(input); if (!checked.ok) return checked;
    const s = checked.value; const fp = fingerprint(s);
    const a = analyzePlacements(s, s.plan.activePlacements);
    const gaps = dedupeFindings([...a.gaps, ...chronologyFindings(s), ...a.planFindings.filter(f => f.status.status === 'unresolved')]);
    const blocked = catalogBlocksConclusions(s.catalog) || requirementPoliciesUnmodeled(s.catalog);
    const terms = s.assumptions.terms;
    const targetOutside = s.plan.targetTerm.sortIndex > terms[terms.length - 1]!.sortIndex;
    const targetBefore = s.plan.targetTerm.sortIndex < terms[0]!.sortIndex;
    const root = a.audit.rootStatus;
    const issues = [...issueFindings(a)];
    let kind: AnalysisResult['outlook']['kind'];
    let futurePassDeclined = false;
    if (targetBefore) kind = 'not_evaluated';
    else if (a.hard.length > 0) kind = 'known_constraints_block_current_plan';
    else if (blocked || targetOutside || root.status === 'unresolved') kind = 'insufficient_evidence';
    else if (a.bottlenecks.some(f => f.code === 'target_at_risk_chain' || f.code === 'no_feasible_term_in_horizon')) kind = 'target_at_risk';
    // A conditional path relies on future passes; if the scenario declines that assumption the
    // engine must not claim one (fail closed to insufficient evidence, disclosed as a gap).
    else if (root.status === 'satisfied') {
      futurePassDeclined = root.conditional && !s.assumptions.assumeFuturePass;
      kind = futurePassDeclined ? 'insufficient_evidence' : 'conditional_path_found';
    }
    else {
      // Bounded completion check from the student's own selections (never auto-adopted).
      const r = completionSearch(s, s.plan.activePlacements, 'outlook', 'system_projection', false);
      let outcome: SearchOutcome;
      for (;;) { const step = r.step(Number.MAX_SAFE_INTEGER); if (step.done) { outcome = step.outcome; break; } }
      if (outcome.kind === 'found' && outcome.unplannable.length === 0) {
        futurePassDeclined = !s.assumptions.assumeFuturePass;
        kind = futurePassDeclined ? 'insufficient_evidence' : 'conditional_path_found';
      }
      else if (outcome.kind === 'found') kind = 'insufficient_evidence';
      else {
        kind = 'target_at_risk';
        issues.push(finding({ code: 'no_completion_found_under_search_bounds', severity: 'warning', status: { status: 'unresolved', conditional: false }, termIds: [s.plan.targetTerm], explanationParams: { expansions: outcome.expansions, stopReason: outcome.stopReason, searchPolicy: s.searchOptions.version }, nextAction: 'adjust_plan_or_target' }));
      }
    }
    if (futurePassDeclined) {
      gaps.push(finding({ code: 'future_pass_not_assumed', severity: 'warning', status: { status: 'unresolved', conditional: false }, termIds: [s.plan.targetTerm], explanationParams: { assumeFuturePass: false }, nextAction: 'review_future_completion_assumption' }));
    }
    const assumptionRefs = uniqueSorted([...a.planFindings.flatMap(f => f.assumptions), ...a.gaps.flatMap(f => f.assumptions)]);
    const topFindings = prioritize(issues).slice(0, 3);
    // Questions may cite only findings present in this result (L rejects dangling references).
    const present = new Set([...topFindings, ...gaps, ...a.bottlenecks].map(f => f.findingId));
    const questions = availabilityQuestions(s, a).map(q => ({ ...q, findingIds: q.findingIds.filter(id => present.has(id)) }));
    const analysis: AnalysisResult = {
      inputFingerprint: fp, degreeAudit: a.audit.audit,
      outlook: { kind, targetTerm: s.plan.targetTerm, assumptionRefs, evidenceRefs: gaps.map(g => g.findingId) },
      topFindings, evidenceGaps: gaps, bottlenecks: a.bottlenecks,
      candidates: generateCandidates(s, fp, a), availabilityQuestions: questions,
    };
    const out = AnalysisResultSchema.safeParse(analysis);
    return out.success ? { ok: true, value: out.data } : fail('validation_error', 'engine_produced_invalid_analysis');
  });
}

export function audit(input: PlanningScenario): Result<DegreeAudit> {
  return guard(() => {
    const checked = checkScenario(input); if (!checked.ok) return checked;
    const a = analyzePlacements(checked.value, checked.value.plan.activePlacements);
    const out = DegreeAuditSchema.safeParse(a.audit.audit);
    return out.success ? { ok: true, value: out.data } : fail('validation_error', 'engine_produced_invalid_audit');
  });
}

function draftFrom(s: PlanningScenario, fp: InputFingerprint, outcome: SearchOutcome): Result<GeneratedDraft | NoValidDraft> {
  if (outcome.kind === 'none') return { ok: true, value: { kind: 'no_valid_draft_under_search_bounds', expansions: outcome.expansions } };
  const a = analyzePlacements(s, outcome.placements);
  const unplannable = outcome.unplannable.map(d => finding({ code: 'draft_requirement_not_plannable', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: d.options, requirementIds: [d.requirementId], explanationParams: { reason: d.reason ?? 'unknown' }, nextAction: 'confirm_requirement_evidence' }));
  // Adoption is validated as a preview that replaces the active plan with these placements; the
  // draft must disclose every assumption label that preview reports, so acknowledging the draft's
  // assumptions is sufficient for L's adopt command (same labels as previewWith's `touching`).
  const ids = new Set(outcome.placements.map(p => p.placementId));
  const placementAssumptions = a.planFindings.filter(f => ids.has(String(f.explanationParams.placementId ?? ''))).flatMap(f => f.assumptions);
  const draft: GeneratedDraft = {
    draftId: stableId('draft', [shortDigest({ fp, p: outcome.placements.map(p => [p.courseId, p.termId.sortIndex]) }, 24)]), baseFingerprint: fp,
    placements: outcome.placements, assumptions: uniqueSorted([...outcome.assumptions, ...placementAssumptions, ...s.assumptions.creditCapacity.filter(c => c.source === 'scenario_assumption').map(() => 'capacity:scenario_assumption')]),
    validation: dedupeFindings([...issueFindings(a), ...a.gaps, ...unplannable]),
    search: { policyVersion: s.searchOptions.version, expansions: outcome.expansions, stopReason: outcome.stopReason },
  };
  const out = GeneratedDraftSchema.safeParse(draft);
  return out.success ? { ok: true, value: out.data } : fail('validation_error', 'engine_produced_invalid_draft');
}

export interface DraftGeneration {
  /** Run up to `maxExpansions` further deterministic expansions; chunking never changes the result. */
  step(maxExpansions: number): { done: false; expansions: number } | { done: true; result: Result<GeneratedDraft | NoValidDraft> };
  /** External watchdog cancellation: `search_interrupted`, never an academic conclusion. */
  cancel(): TypedFailure;
}
/**
 * Generator path: ONE complete preliminary draft built from the record alone (no active
 * placements are kept; L's adoption replaces the active plan). Placements are unadopted
 * `system_projection`s and must be explicitly adopted via L's validated command.
 */
export function startDraftGeneration(input: PlanningScenario): Result<DraftGeneration> {
  return guard(() => {
    const checked = checkScenario(input); if (!checked.ok) return checked;
    const s = checked.value; const fp = fingerprint(s);
    const search = completionSearch(s, [], `draft-${shortDigest(fp, 8)}`, 'system_projection', false);
    let cancelled: TypedFailure | null = null; let final: Result<GeneratedDraft | NoValidDraft> | null = null;
    return { ok: true, value: {
      step(n) {
        if (cancelled) return { done: true, result: cancelled };
        if (final) return { done: true, result: final };
        const r = search.step(Math.max(1, Math.floor(n)));
        if (!r.done) return r;
        final = draftFrom(s, fp, r.outcome); return { done: true, result: final };
      },
      cancel() { cancelled ??= final ? fail('search_interrupted', 'search_already_finished') : search.cancel(); return cancelled; },
    } };
  });
}

export function generateDraft(input: PlanningScenario): Result<GeneratedDraft | NoValidDraft> {
  const gen = startDraftGeneration(input); if (!gen.ok) return gen;
  for (;;) { const r = gen.value.step(Number.MAX_SAFE_INTEGER); if (r.done) return r.result; }
}

/**
 * AcademicService over an explicit catalog registry. The default service lists only the
 * user-approved curriculum configurations; integration/browser tests may inject a labeled
 * synthetic catalog. Academic evaluation is identical: it reads only the frozen scenario.
 */
export function createAcademicService(catalogs: CatalogRegistry = { listCatalogs, loadValidatedCatalog }): AcademicService {
  return Object.freeze({
    listCatalogs: () => catalogs.listCatalogs(),
    loadValidatedCatalog: (ref: Parameters<AcademicService['loadValidatedCatalog']>[0]) => catalogs.loadValidatedCatalog(ref),
    normalizeAttempts,
    audit, evaluate,
    preview: (s, c) => guard(() => { const k = checkScenario(s); return k.ok ? preview(k.value, c) : k; }),
    validateCandidate: (s, p) => guard(() => { const k = checkScenario(s); return k.ok ? validateCandidate(k.value, p) : k; }),
    generateDraft,
  } satisfies AcademicService);
}

export const academicService: AcademicService = createAcademicService();
