// TEST DOUBLES ONLY — isolate the UI from E/L/S/G while their modules are unavailable.
// This file is NOT academic logic and must never be imported by src/**. Integrated
// acceptance must replace every double with the real engine, commands and services.
import { fingerprint, PlanningScenarioSchema, SEARCH_POLICY } from '../../../src/contracts';
import type {
  AcademicRecord, AcademicService, AnalysisResult, AuthService, AvailabilityEvidence, CandidatePreview, CatalogModel, ChangeSet,
  CourseAttempt, GeneratedDraft, GuestDraft, GuestRecoveryService, Plan, PlannerCommands, PlanPlacement, PlanningScenario,
  PrerequisiteExpr, ProposedRow, Result, RuleFinding, SavedPlan, StorageService, TermId, TranscriptExtraction, ValidatedExtractedRows,
} from '../../../src/contracts';
import type { WorkflowServices } from '../../../src/ui/services';
import { createPdfExportService } from '../../../src/export';
import { termFromIndex } from '../../../src/ui/terms';
import { syntheticCatalog, SYNTHETIC_REF } from './syntheticCatalog';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: Extract<Result<never>, { ok: false }>['code'], reasonCode: string) => ({ ok: false as const, code, reasonCode });

export function fakeClock(start = '2026-11-12T15:00:00.000Z') {
  let tick = 0, ids = 0;
  return {
    now: () => new Date(Date.parse(start) + 1000 * tick++).toISOString(),
    newId: (prefix: string) => `${prefix}-${++ids}`,
  };
}

const SEASON_BY_NAME: Record<string, TermId['season']> = { spring: 'spring', summer: 'summer', fall: 'fall' };
function parseTerm(raw: string | null): TermId | null {
  const m = raw?.trim().match(/^(spring|summer|fall)\s+(\d{4})$/i);
  if (!m) return null;
  const year = Number(m[2]);
  return termFromIndex(year * 3 + ['spring', 'summer', 'fall'].indexOf(SEASON_BY_NAME[m[1]!.toLowerCase()]!));
}

function prereqCourses(expr: PrerequisiteExpr): string[] {
  if (expr.kind === 'course') return [expr.courseId];
  if (expr.kind === 'all') return expr.children.flatMap(prereqCourses);
  return [];
}

function finding(id: string, code: string, severity: RuleFinding['severity'], status: RuleFinding['status'], courseIds: string[], termIds: TermId[], nextAction: string | null): RuleFinding {
  return { findingId: id, code, severity, status, courseIds, termIds, requirementIds: [], sourceRefs: ['syn-src'], explanationParams: {}, assumptions: [], nextAction };
}

/** Deliberately simple double. Supports exercising UI states, not academic correctness. */
export function fakeAcademic(catalogs: CatalogModel[] = [syntheticCatalog()], options: { draft?: 'ok' | 'none' | 'interrupted' } = {}): AcademicService {
  const findingsFor = (s: PlanningScenario): RuleFinding[] => {
    const done = new Set(s.record.courseAttempts.filter(a => a.status === 'completed' && a.normalizedCourseId).map(a => a.normalizedCourseId!));
    const out: RuleFinding[] = [];
    for (const p of s.plan.activePlacements) {
      const course = s.catalog.courses[p.courseId]!;
      for (const pre of prereqCourses(course.prerequisite)) {
        const earlier = s.plan.activePlacements.some(q => q.courseId === pre && q.termId.sortIndex < p.termId.sortIndex);
        if (!done.has(pre) && !earlier) out.push(finding(`pre-${p.placementId}-${pre}`, 'prerequisite_not_met', 'error', { status: 'unsatisfied', conditional: false }, [p.courseId, pre], [p.termId], 'move_after_prerequisite'));
      }
      if (course.prerequisite.kind === 'unresolved') out.push(finding(`unres-${p.placementId}`, 'prerequisite_policy_unresolved', 'warning', { status: 'unresolved', conditional: false }, [p.courseId], [p.termId], 'confirm_with_department'));
      const ev = s.plan.availabilityEvidence.find(e => e.courseId === p.courseId && e.termId.sortIndex === p.termId.sortIndex);
      if (ev?.report === 'not_listed') out.push(finding(`nl-${p.placementId}`, 'reported_not_listed', 'warning', { status: 'unsatisfied', conditional: true }, [p.courseId], [p.termId], 'choose_another_term'));
    }
    const placed = new Set(s.plan.activePlacements.map(p => p.courseId));
    for (const g of s.catalog.requirementGroups) {
      if (g.kind === 'course' && !done.has(g.courseId) && !placed.has(g.courseId)) out.push(finding(`unplaced-${g.courseId}`, 'required_course_unplaced', 'warning', { status: 'unsatisfied', conditional: false }, [g.courseId], [], 'add_to_plan'));
    }
    return out;
  };
  const withPlacements = (s: PlanningScenario, placements: PlanPlacement[]): PlanningScenario => ({ ...s, plan: { ...s.plan, activePlacements: placements } });
  const applyOps = (placements: PlanPlacement[], changes: ChangeSet): PlanPlacement[] | null => {
    let next = [...placements];
    for (const op of changes.operations) {
      if (op.kind === 'add') next.push(op.placement);
      else if (op.kind === 'remove') next = next.filter(p => p.placementId !== op.placementId);
      else if (op.kind === 'move') { if (!next.some(p => p.placementId === op.placementId)) return null; next = next.map(p => (p.placementId === op.placementId ? { ...p, termId: op.termId } : p)); }
      else {
        const a = next.find(p => p.placementId === op.firstPlacementId), b = next.find(p => p.placementId === op.secondPlacementId);
        if (!a || !b) return null;
        next = next.map(p => (p === a ? { ...a, termId: b.termId } : p === b ? { ...b, termId: a.termId } : p));
      }
    }
    return next;
  };
  const self: AcademicService = {
    listCatalogs: () => ok(catalogs.map(c => c.catalogRef)),
    loadValidatedCatalog: ref => {
      const c = catalogs.find(x => x.catalogRef.catalogVersion === ref.catalogVersion);
      return c ? ok(c) : fail('unavailable', 'catalog_not_loaded');
    },
    normalizeAttempts: (rows, catalog) => {
      const manual: ProposedRow[] = 'rows' in rows ? rows.rows : 'manualRows' in rows ? rows.manualRows : [];
      const extracted: ProposedRow[] = 'extraction' in rows ? rows.extraction.rows : 'extracted' in rows && rows.extracted ? rows.extracted.extraction.rows : [];
      const unmatched: string[] = [];
      const attempt = (r: ProposedRow, origin: CourseAttempt['origin']): CourseAttempt => {
        const id = r.rawCourseCode.toUpperCase().replace(/\s+/g, '-').replace(/-+/g, '-');
        const known = catalog.courses[id] ? id : null;
        if (!known) unmatched.push(r.rowId);
        const num = (v: string | null) => (v !== null && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
        const status = (['completed', 'in_progress', 'failed', 'withdrawn', 'incomplete', 'transfer_pending'] as const).find(x => x === r.rawStatus) ?? 'unknown';
        return { attemptId: r.rowId, rawCourseCode: r.rawCourseCode, normalizedCourseId: known, institution: r.rawInstitution, origin: r.rawInstitution ? 'transfer' : origin, term: parseTerm(r.rawTerm), attemptedCredits: num(r.rawAttemptedCredits), earnedCredits: num(r.rawEarnedCredits), grade: r.rawGrade, status, evidence: [], confidence: known ? 'provisional' : 'unresolved' };
      };
      const courseAttempts = [...extracted.map(r => attempt(r, 'transcript_proposal')), ...manual.map(r => attempt(r, 'manual'))];
      // Mirrors E's per-row warning shape (`code:rowId`) for grades it cannot read. Test double only.
      const gradeWarnings = [...extracted, ...manual].filter(r => r.rawGrade !== null && !/^([A-DF][+-]?|W|P|I)$/i.test(r.rawGrade.trim())).map(r => `unrecognized_grade:${r.rowId}`);
      const record: AcademicRecord = { schemaVersion: 1, recordRevision: 0, courseAttempts, unresolvedItems: unmatched.map(id => `unmatched-${id}`) };
      return ok({ record, unmatched, warnings: [...(unmatched.length ? ['unmatched_rows_retained'] : []), ...gradeWarnings] });
    },
    audit: s => ok(self.evaluate(s).ok ? (self.evaluate(s) as { ok: true; value: AnalysisResult }).value.degreeAudit : { requirements: [], earnedCredits: null, applicableCredits: null, disputedRules: [], totalStatus: 'unresolved' }),
    evaluate: s => {
      const all = findingsFor(s);
      const errors = all.filter(f => f.severity === 'error');
      const blocked = s.catalog.catalogRef.catalogYearId === null || s.catalog.policyGaps.some(g => g.blocksConclusions);
      // Mirrors E's order without its algorithms: unplaced requirements alone are not a risk (E
      // runs a bounded completion search); the double's search "fails" only with draft=none.
      const noCompletion = options.draft === 'none' && all.some(f => f.code === 'required_course_unplaced');
      if (noCompletion) all.unshift(finding('no-completion', 'no_completion_found_under_search_bounds', 'warning', { status: 'unresolved', conditional: false }, [], [s.plan.targetTerm], 'adjust_plan_or_target'));
      const kind: AnalysisResult['outlook']['kind'] = blocked ? 'insufficient_evidence' : errors.length ? 'known_constraints_block_current_plan' : noCompletion || all.some(f => f.code === 'reported_not_listed') ? 'target_at_risk' : 'conditional_path_found';
      const questions = s.plan.activePlacements.filter(p => !s.plan.availabilityEvidence.some(e => e.courseId === p.courseId && e.termId.sortIndex === p.termId.sortIndex)).slice(0, 3)
        .map(p => ({ questionId: `q-${p.placementId}`, courseId: p.courseId, termId: p.termId, findingIds: [] }));
      const gaps = questions.map(q => finding(`gap-${q.questionId}`, 'offering_unknown', 'info', { status: 'unresolved', conditional: true }, [q.courseId], [q.termId], 'report_offering'));
      const fp = fingerprint(s);
      const candidates: CandidatePreview[] = [];
      for (const e of errors) {
        const p = s.plan.activePlacements.find(x => e.findingId.startsWith(`pre-${x.placementId}-`));
        const pre = s.plan.activePlacements.find(x => x.courseId === e.courseIds[1]);
        const target = pre ? s.assumptions.terms.find(t => t.sortIndex > pre.termId.sortIndex) : undefined;
        if (!p || !target || candidates.length >= 3 || p.termId.sortIndex >= target.sortIndex || candidates.some(c => c.previewId === `cand-${p.placementId}`)) continue;
        const r = self.preview(s, { baseFingerprint: fp, operations: [{ kind: 'move', placementId: p.placementId, termId: target }] });
        // Like the bounded search, never suggest a known-hard-invalid state.
        if (r.ok && r.value.validabilityStatus !== 'invalid') candidates.push({ ...r.value, previewId: `cand-${p.placementId}` });
      }
      const done = new Set(s.record.courseAttempts.filter(a => a.status === 'completed').map(a => a.normalizedCourseId));
      const requirements = s.catalog.requirementGroups.filter(g => g.kind === 'course').map(g => {
        const placement = s.plan.activePlacements.find(p => p.courseId === (g.kind === 'course' ? g.courseId : ''));
        const sat = g.kind === 'course' && done.has(g.courseId);
        return { requirementId: g.requirementId, status: (sat ? 'satisfied' : placement ? 'unresolved' : 'unmet') as 'satisfied' | 'unmet' | 'unresolved', attemptIds: [], placementIds: placement ? [placement.placementId] : [], conditional: !sat && Boolean(placement), applicableCredits: null, sourceRefs: ['syn-src'] };
      });
      return ok({
        inputFingerprint: fp,
        degreeAudit: { requirements, earnedCredits: null, applicableCredits: null, disputedRules: [], totalStatus: 'unresolved' },
        outlook: { kind, targetTerm: s.plan.targetTerm, assumptionRefs: ['future_offerings_unknown'], evidenceRefs: [] },
        topFindings: [...errors, ...all.filter(f => f.severity !== 'error')].slice(0, 3), evidenceGaps: gaps, bottlenecks: [], candidates, availabilityQuestions: questions,
      });
    },
    preview: (s, changes) => {
      if (changes.baseFingerprint !== fingerprint(s)) return fail('stale_preview', 'base_fingerprint_mismatch');
      const next = applyOps(s.plan.activePlacements, changes);
      if (!next) return fail('validation_error', 'unknown_placement');
      const before = findingsFor(s), after = findingsFor(withPlacements(s, next));
      // Labels follow ACADEMIC_ENGINE.md semantics so fixtures never show a contradictory
      // state: `improved` only with fewer hard conflicts AND none newly introduced (keyed by
      // code, courses and terms, as the UI delta is); any remaining known hard conflict makes
      // the preview `invalid` (L refuses to apply it).
      const hard = (fs: RuleFinding[]) => fs.filter(f => f.severity === 'error' && f.status.status === 'unsatisfied' && !f.status.conditional);
      const key = (f: RuleFinding) => `${f.code}|${f.courseIds.join(',')}|${f.termIds.map(t => t.sortIndex).join(',')}`;
      const beforeKeys = new Set(hard(before).map(key));
      const introducedHard = hard(after).filter(f => !beforeKeys.has(key(f))).length;
      const benefitClass = hard(after).length < hard(before).length && introducedHard === 0 ? 'improved' : 'tradeoff';
      return ok({ previewId: `preview-${changes.operations.length}-${next.length}`, baseFingerprint: changes.baseFingerprint, changeSet: changes, proposedPlacements: next, before, after,
        assumptions: ['future_offerings_unknown'], benefitClass, validabilityStatus: hard(after).length > 0 ? 'invalid' : 'conditional' });
    },
    validateCandidate: (s, preview) => (preview.validabilityStatus === 'invalid' ? fail('known_hard_conflict', 'preview_invalid') : preview.baseFingerprint === fingerprint(s) ? ok({ baseFingerprint: preview.baseFingerprint, placements: preview.proposedPlacements, findings: preview.after, assumptions: preview.assumptions }) : fail('stale_preview', 'base_fingerprint_mismatch')),
    generateDraft: s => {
      if (options.draft === 'interrupted') return fail('search_interrupted', 'watchdog_cancelled');
      if (options.draft === 'none') return ok({ kind: 'no_valid_draft_under_search_bounds', expansions: 1000 });
      const done = new Set(s.record.courseAttempts.filter(a => a.status === 'completed').map(a => a.normalizedCourseId));
      const remaining = ['SYN-101', 'SYN-102', 'SYN-201', 'SYN-202', 'SYN-301'].filter(c => !done.has(c));
      const placements: PlanPlacement[] = [];
      let termIndex = 0;
      const placedTerm = new Map<string, number>();
      for (const c of remaining) {
        const pres = prereqCourses(s.catalog.courses[c]!.prerequisite).filter(p => !done.has(p));
        const minTerm = Math.max(0, ...pres.map(p => (placedTerm.get(p) ?? -1) + 1));
        termIndex = Math.max(termIndex, minTerm);
        if (placements.filter(p => p.termId.sortIndex === s.assumptions.terms[termIndex]?.sortIndex).length >= 2) termIndex++;
        const t = s.assumptions.terms[termIndex];
        if (!t) return ok({ kind: 'no_valid_draft_under_search_bounds', expansions: 1000 });
        placedTerm.set(c, termIndex);
        placements.push({ placementId: `draft-${c}`, courseId: c, termId: t, origin: 'system_projection', active: false });
      }
      const draft: GeneratedDraft = { draftId: 'draft-1', baseFingerprint: fingerprint(s), placements, assumptions: ['future_offerings_unknown', 'future_pass_assumed'], validation: [], search: { policyVersion: SEARCH_POLICY.version, expansions: 42, stopReason: 'qualifying_candidate' } };
      return ok(draft);
    },
  };
  return Object.freeze(self);
}

/** Test double of L's plan command boundary, honoring full-fingerprint and revision rules. */
export function fakeCommands(academic: AcademicService, clock: { newId(p: string): string }): PlannerCommands {
  const rescope = (s: PlanningScenario, plan: Plan): PlanningScenario => PlanningScenarioSchema.parse({ ...s, plan });
  const analysisOf = (s: PlanningScenario) => academic.evaluate(s) as { ok: true; value: AnalysisResult };
  const bump = (plan: Plan, at: string, extra: Partial<Plan>): Plan => ({ ...plan, ...extra, planRevision: plan.planRevision + 1, updatedAt: at });
  const ops = (placements: PlanPlacement[], changes: ChangeSet): PlanPlacement[] => {
    let next = [...placements];
    for (const op of changes.operations) {
      if (op.kind === 'add') next.push(op.placement);
      else if (op.kind === 'remove') next = next.filter(p => p.placementId !== op.placementId);
      else if (op.kind === 'move') next = next.map(p => (p.placementId === op.placementId ? { ...p, termId: op.termId } : p));
    }
    return next;
  };
  const commands: PlannerCommands = {
    createGuestPlan: (ref, target, action) => ok({ schemaVersion: 1, planId: clock.newId('plan'), planRevision: 0, catalogRef: ref, targetTerm: target, activePlacements: [], acceptedDraft: null, availabilityEvidence: [], availabilityRevision: 0, updatedAt: action.occurredAt }),
    setTargetTerm: (s, target, action) => {
      const plan = bump(s.plan, action.occurredAt, { targetTerm: target });
      return ok({ plan, analysis: analysisOf(rescope(s, plan)).value });
    },
    recordAvailability: (s, report, action) => {
      if ('kind' in report) return ok({ plan: s.plan, analysis: analysisOf(s).value });
      const evidence: AvailabilityEvidence[] = [...s.plan.availabilityEvidence.filter(e => !(e.courseId === report.courseId && e.termId.sortIndex === report.termId.sortIndex)), report];
      const plan = bump(s.plan, action.occurredAt, { availabilityEvidence: evidence, availabilityRevision: s.plan.availabilityRevision + 1 });
      return ok({ plan, analysis: analysisOf(rescope(s, plan)).value });
    },
    recordStudentSelections: (s, changes, action) => {
      if (changes.baseFingerprint !== fingerprint(s)) return fail('stale_preview', 'base_fingerprint_mismatch');
      const plan = bump(s.plan, action.occurredAt, { activePlacements: ops(s.plan.activePlacements, changes) });
      const parsed = PlanningScenarioSchema.safeParse({ ...s, plan });
      if (!parsed.success) return fail('validation_error', 'invalid_selection');
      return ok({ plan, analysis: analysisOf(parsed.data).value });
    },
    acceptRecord: (s, proposed, action) => {
      if (action.kind !== 'accept_record') return fail('validation_error', 'wrong_action');
      const record = { ...proposed, recordRevision: s.record.recordRevision + 1 };
      return ok({ record, analysis: analysisOf({ ...s, record }).value });
    },
    applyPreview: (s, preview, action) => {
      if (action.kind !== 'apply') return fail('validation_error', 'wrong_action');
      if (preview.baseFingerprint !== fingerprint(s)) return fail('stale_preview', 'base_fingerprint_mismatch');
      // Mirrors L: only valid/conditional previews are validatable.
      if (preview.validabilityStatus !== 'valid' && preview.validabilityStatus !== 'conditional') return fail('unresolved', 'preview_not_validatable');
      if (preview.assumptions.some(a => !action.acknowledgedAssumptions.includes(a))) return fail('validation_error', 'assumptions_not_acknowledged');
      const v = academic.validateCandidate(s, preview);
      if (!v.ok) return v;
      const plan = bump(s.plan, action.occurredAt, { activePlacements: v.value.placements });
      return ok({ plan, undo: { checkpointId: clock.newId('undo'), beforeFingerprint: fingerprint(s), afterFingerprint: fingerprint(rescope(s, plan)), previousPlacements: s.plan.activePlacements, previousAcceptedDraft: s.plan.acceptedDraft } });
    },
    rejectPreview: (session, previewId) => ({ plan: session.plan, previews: session.previews.filter(p => p.previewId !== previewId) }),
    undoLast: (s, checkpoint, action) => {
      if (action.kind !== 'undo') return fail('validation_error', 'wrong_action');
      if (fingerprint(s) !== checkpoint.afterFingerprint) return fail('stale_undo', 'checkpoint_mismatch');
      const plan = bump(s.plan, action.occurredAt, { activePlacements: checkpoint.previousPlacements, acceptedDraft: checkpoint.previousAcceptedDraft });
      return ok({ plan, analysis: analysisOf(rescope(s, plan)).value });
    },
    adoptDraft: (s, draft, action) => {
      if (action.kind !== 'adopt') return fail('validation_error', 'wrong_action');
      if (draft.baseFingerprint !== fingerprint(s)) return fail('stale_preview', 'draft_fingerprint_mismatch');
      if (draft.assumptions.some(a => !action.acknowledgedAssumptions.includes(a))) return fail('validation_error', 'assumptions_not_acknowledged');
      const adopted = draft.placements.map(p => ({ ...p, placementId: `adopted-${p.placementId}`, origin: 'adopted_suggestion' as const, active: true }));
      const plan = bump(s.plan, action.occurredAt, { activePlacements: [...s.plan.activePlacements, ...adopted], acceptedDraft: { draftId: draft.draftId, adoptedAt: action.occurredAt } });
      return ok({ plan, undo: { checkpointId: clock.newId('undo'), beforeFingerprint: fingerprint(s), afterFingerprint: fingerprint(rescope(s, plan)), previousPlacements: s.plan.activePlacements, previousAcceptedDraft: s.plan.acceptedDraft } });
    },
  };
  return Object.freeze(commands);
}

export function fakeAccount(options: { conflictOnSave?: boolean; clearFails?: boolean } = {}) {
  let user: { userId: string } | null = null;
  const rows = new Map<string, SavedPlan>();
  let seq = 0;
  let stashed: GuestDraft | null = null;
  const clears: string[] = [];
  const auth: AuthService = {
    currentUser: async () => ok(user),
    requestEmailOtp: async email => (email.includes('@') ? ok(null) : fail('validation_error', 'invalid_email')),
    verifyEmailOtp: async (_email, token) => (token === '123456' ? ok((user = { userId: 'user-a' })) : fail('forbidden', 'invalid_otp')),
    signOut: async () => { user = null; return ok(null); },
  };
  const storage: StorageService = {
    createPlan: async (record, plan) => {
      if (!user) return fail('forbidden', 'not_signed_in');
      const id = `cloud-${++seq}`;
      const saved: SavedPlan = { schemaVersion: 1, id, ownerUserId: user.userId, revision: 0, record, plan: { ...plan, planId: id }, createdAt: plan.updatedAt, updatedAt: plan.updatedAt };
      rows.set(id, saved);
      return ok(saved);
    },
    listOwnedPlans: async () => (user ? ok([...rows.values()].map(r => ({ id: r.id, revision: r.revision, updatedAt: r.updatedAt }))) : fail('forbidden', 'not_signed_in')),
    getOwnedPlan: async id => (rows.get(id) ? ok(rows.get(id)!) : fail('forbidden', 'not_found')),
    savePlan: async (id, expectedRevision, record, plan) => {
      const row = rows.get(id);
      if (!row) return fail('forbidden', 'not_found');
      if (options.conflictOnSave || row.revision !== expectedRevision) return fail('conflict', 'revision_mismatch');
      const saved = { ...row, revision: row.revision + 1, record, plan };
      rows.set(id, saved);
      return ok(saved);
    },
    deleteOwnedPlan: async id => (rows.delete(id) ? ok(null) : fail('forbidden', 'not_found')),
    deleteAccount: async () => { rows.clear(); user = null; return ok(null); },
  };
  const recovery: GuestRecoveryService = {
    stash: draft => { stashed = draft; return ok(null); },
    recover: now => (stashed && Date.parse(now) < Date.parse(stashed.expiresAt) ? ok(stashed) : ok(null)),
    // clearFails mirrors S's typed failure when device storage removal throws; the draft stays.
    clear: event => { clears.push(event); if (options.clearFails) return fail('external_failure', 'recovery_remove_failed'); stashed = null; return ok(null); },
  };
  return { ports: Object.freeze({ auth, storage, recovery }), inspect: { rows, clears, stashed: () => stashed } };
}

export function syntheticExtraction(status: TranscriptExtraction['acceptanceStatus'] = 'needs_review'): TranscriptExtraction {
  return { schemaVersion: 1, documentPageCount: 1, detectedRowCount: 2, coveredPages: [1], unrecognizedRows: [], completeness: 'unknown', acceptanceStatus: status, modelId: 'synthetic-model', extractionSchemaVersion: 1, warnings: ['synthetic_fixture'],
    rows: [
      { rowId: 'x1', rawCourseCode: 'SYN 101', rawTitle: 'Synthetic Foundations', rawTerm: 'Fall 2025', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed', rawInstitution: null, provisionalCourseId: 'SYN-101', provenance: [{ field: 'code', page: 1, row: 1, quote: 'SYN 101' }], uncertainty: [] },
      { rowId: 'x2', rawCourseCode: 'ZZZ 999', rawTitle: null, rawTerm: 'Fall 2025', rawAttemptedCredits: '3', rawEarnedCredits: null, rawGrade: null, rawStatus: null, rawInstitution: null, provisionalCourseId: null, provenance: [], uncertainty: ['unrecognized_code'] },
    ] };
}

/**
 * Holds named transcript calls until the test releases them, to exercise in-flight withdrawal,
 * discard and unmount. A held call records itself as `<name>:held` before waiting and
 * `<name>:released` once the test lets it settle, so ordering against `revoke` can be asserted.
 */
export interface TranscriptGate { hold: ReadonlySet<string>; release(name: string): void; wait(name: string): Promise<void> }
export function transcriptGate(names: string[]): TranscriptGate {
  const waiting = new Map<string, Array<() => void>>();
  const released = new Set<string>();
  return {
    hold: new Set(names),
    release(name) { released.add(name); for (const go of waiting.get(name) ?? []) go(); waiting.delete(name); },
    wait: name => (released.has(name) ? Promise.resolve() : new Promise<void>(go => { waiting.set(name, [...(waiting.get(name) ?? []), go]); })),
  };
}
const gateWait = (gate: TranscriptGate | undefined, name: string, calls: string[]) => {
  if (!gate?.hold.has(name)) return Promise.resolve();
  calls.push(`${name}:held`);
  return gate.wait(name).then(() => { calls.push(`${name}:released`); });
};

/**
 * A raw provider envelope that claims more than G will confirm: accepted, completeness demonstrated,
 * no row uncertainty. Used with `downgradeExtraction` to prove the UI shows G's validated envelope.
 */
export function optimisticRawExtraction(): TranscriptExtraction {
  const e = syntheticExtraction('accepted');
  return { ...e, completeness: 'demonstrated', warnings: [], rows: e.rows.map(r => ({ ...r, uncertainty: [] })) };
}
/** What G's validation returns for the optimistic envelope: needs review, completeness unknown, every row flagged. */
export function downgradeExtraction(e: TranscriptExtraction): TranscriptExtraction {
  return { ...e, acceptanceStatus: 'needs_review', completeness: 'unknown', warnings: [...e.warnings, 'row_count_unverified'], rows: e.rows.map(r => ({ ...r, uncertainty: [...r.uncertainty, 'credits_unverified'] })) };
}

export interface FakeTranscriptOptions {
  /** Receipt IDs whose revocation the double answers with a typed failure. */
  revokeFails?: ReadonlySet<string>;
  /**
   * 'downgrade': extract returns `optimisticRawExtraction` and validate returns `downgradeExtraction` of it.
   * 'fail': extract returns `optimisticRawExtraction` and validate refuses it with a typed validation failure.
   */
  validate?: 'identity' | 'downgrade' | 'fail';
}

/**
 * Each ticket issues a distinct receipt (`receipt-1`, `receipt-2`, …). Every revoke pushes `revoke`
 * to `calls` (and `revoke:held`/`revoke:released` when held) and the receipt ID to `revokedIds`.
 */
export function fakeTranscript(mode: 'disabled' | 'approved' | 'rejected', calls: string[], gate?: TranscriptGate, options: FakeTranscriptOptions & { revokedIds?: string[] } = {}) {
  let tickets = 0;
  const downgrade = options.validate === 'downgrade';
  const optimistic = downgrade || options.validate === 'fail';
  return Object.freeze({
    client: Object.freeze({
      getAvailability: async () => { calls.push('availability'); return ok(mode === 'disabled' ? { status: 'disabled' as const, disclosureVersion: 'disc-v1', processingTier: 'none', reasonCode: 'processing_not_approved' } : { status: 'approved' as const, disclosureVersion: 'disc-v1', processingTier: 'synthetic-test-tier', reasonCode: null }); },
      establishGuestSession: async () => { calls.push('session'); return ok(null); },
      requestTicket: async () => { calls.push('ticket'); const id = `receipt-${++tickets}`; await gateWait(gate, 'ticket', calls); return ok({ signedTicket: 'signed', consentReceiptId: id, expiresAt: '2026-11-12T15:05:00.000Z' }); },
      extract: async () => { calls.push('extract'); await gateWait(gate, 'extract', calls); return ok(optimistic ? optimisticRawExtraction() : syntheticExtraction(mode === 'rejected' ? 'rejected' : 'needs_review')); },
      revokeConsent: async ({ consentReceiptId }: { consentReceiptId: string }) => {
        calls.push('revoke'); options.revokedIds?.push(consentReceiptId);
        await gateWait(gate, 'revoke', calls);
        return options.revokeFails?.has(consentReceiptId) ? fail('external_failure', 'revoke_unavailable') : ok(null);
      },
    }),
    validate: (extraction: TranscriptExtraction) => (options.validate === 'fail' ? fail('validation_error', 'provenance_mismatch') : extraction.acceptanceStatus === 'rejected' ? fail('validation_error', 'extraction_rejected') : ok({ kind: 'validated_proposed_rows', extraction: downgrade ? downgradeExtraction(extraction) : extraction } as unknown as ValidatedExtractedRows)),
    obtainBotAttestation: async () => ok('synthetic-attestation'),
  });
}

export function fakeServices(options: { blockingGap?: boolean; longTitles?: boolean; draft?: 'ok' | 'none' | 'interrupted'; transcript?: 'disabled' | 'approved' | 'rejected' | 'none'; transcriptGate?: TranscriptGate; transcriptOptions?: FakeTranscriptOptions; account?: boolean; conflictOnSave?: boolean; clearFails?: boolean; exportFails?: boolean; staleAnalysis?: boolean } = {}) {
  const clock = fakeClock();
  const base = fakeAcademic([syntheticCatalog({ blockingGap: options.blockingGap ?? false, longTitles: options.longTitles ?? false })], { draft: options.draft ?? 'ok' });
  // staleAnalysis: the double answers with an analysis for a different fingerprint, which the
  // UI's validation must refuse (no outlook, no export).
  const academic: AcademicService = options.staleAnalysis
    ? Object.freeze({ ...base, evaluate: (s: PlanningScenario) => { const r = base.evaluate(s); if (!r.ok) return r; const fp = r.value.inputFingerprint; return ok({ ...r.value, inputFingerprint: `${fp.slice(0, -1)}${fp.endsWith('0') ? '1' : '0'}` as AnalysisResult['inputFingerprint'] }); } })
    : base;
  const transcriptCalls: string[] = [];
  const revokedIds: string[] = [];
  const account = options.account === false ? null : fakeAccount({ conflictOnSave: options.conflictOnSave ?? false, clearFails: options.clearFails ?? false });
  const services: WorkflowServices = Object.freeze({
    academic,
    commands: fakeCommands(academic, clock),
    // exportFails mirrors the real service's typed renderer failure; no Blob is produced.
    exporter: options.exportFails
      ? Object.freeze({ exportPdf: async () => ({ ok: false as const, code: 'validation_error' as const, reasonCode: 'pdf_render_failed' }) })
      : createPdfExportService({ now: clock.now }),
    clock,
    config: Object.freeze({ engineVersion: 'fake-engine-test-only', evaluationPolicy: 'fake-policy', assumeFuturePass: true, searchOptions: SEARCH_POLICY }),
    transcript: options.transcript === 'none' ? null : fakeTranscript(options.transcript ?? 'disabled', transcriptCalls, options.transcriptGate, { ...options.transcriptOptions, revokedIds }),
    account: account?.ports ?? null,
  });
  return { services, transcriptCalls, revokedIds, account, ref: SYNTHETIC_REF };
}
