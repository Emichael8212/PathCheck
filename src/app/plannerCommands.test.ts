import { describe, expect, it, vi } from 'vitest';
import { createPlannerCommands } from './plannerCommands';
import { syntheticScenario } from '../contracts/synthetic.test-fixtures';
import { fingerprint, term } from '../contracts';
import type { AcademicService, AnalysisResult, CandidatePreview, ExplicitUserAction, PlanningScenario } from '../contracts';

// Command-unit isolation only; genuine academic behavior is tested at I1/I2 with E.
function analysis(s: PlanningScenario): AnalysisResult {
  return { inputFingerprint: fingerprint(s), degreeAudit: { requirements: [], earnedCredits: 0, applicableCredits: 0, disputedRules: [], totalStatus: 'unresolved' }, outlook: { kind: 'insufficient_evidence', targetTerm: s.plan.targetTerm, assumptionRefs: [], evidenceRefs: [] }, topFindings: [], evidenceGaps: [], bottlenecks: [], candidates: [], availabilityQuestions: [] };
}
function setup() {
  const s = syntheticScenario();
  const evaluate = vi.fn<AcademicService['evaluate']>(s => ({ ok: true, value: analysis(s) }));
  const validateCandidate = vi.fn<AcademicService['validateCandidate']>((s, p) => ({ ok: true, value: { baseFingerprint: fingerprint(s), placements: p.proposedPlacements, findings: [], assumptions: p.assumptions } }));
  const preview = vi.fn<AcademicService['preview']>((s, changes) => ({ ok: true, value: { previewId: 'draft-preview', baseFingerprint: fingerprint(s), changeSet: changes, proposedPlacements: changes.operations.flatMap(op => op.kind === 'add' ? [op.placement] : []), before: [], after: [], assumptions: [], benefitClass: 'tradeoff', validabilityStatus: 'conditional' } }));
  const notUsed = () => { throw new Error('Unexpected service call'); };
  const service: AcademicService = { evaluate, validateCandidate, preview, listCatalogs: notUsed, loadValidatedCatalog: notUsed, normalizeAttempts: notUsed, audit: notUsed, generateDraft: notUsed };
  let id = 0;
  const commands = createPlannerCommands(service, () => `id-${++id}`);
  const action = (kind: ExplicitUserAction['kind'], acknowledgedAssumptions: string[] = []): ExplicitUserAction => ({ actionId: `action-${++id}`, kind, occurredAt: '2030-01-02T00:00:00Z', acknowledgedAssumptions });
  const candidate: CandidatePreview = { previewId: 'preview', baseFingerprint: fingerprint(s), changeSet: { baseFingerprint: fingerprint(s), operations: [{ kind: 'move', placementId: 'p1', termId: term(2030, 'spring') }] }, proposedPlacements: [{ ...s.plan.activePlacements[0]!, termId: term(2030, 'spring') }], before: [], after: [], assumptions: ['future-pass'], benefitClass: 'tradeoff', validabilityStatus: 'conditional' };
  return { s, commands, action, candidate, evaluate, validateCandidate, preview };
}

describe('explicit plan commands', () => {
  it('creates independent guest identity and no selections', () => {
    const { commands, action, s } = setup();
    const result = commands.createGuestPlan(s.catalog.catalogRef, s.plan.targetTerm, action('create'));
    expect(result).toMatchObject({ ok: true, value: { planRevision: 0, activePlacements: [], availabilityEvidence: [] } });
    if (result.ok) expect(result.value.planId).not.toBe(s.plan.planId);
  });
  it('rejects wrong action kinds without fresh validation or changes', () => {
    const { commands, action, candidate, s, validateCandidate } = setup();
    expect(commands.applyPreview(s, candidate, action('undo'))).toMatchObject({ ok: false, reasonCode: 'wrong_action_kind' });
    expect(validateCandidate).not.toHaveBeenCalled();
  });
  it('requires acknowledgement, validates afresh, applies atomically and undoes at a new revision', () => {
    const { commands, action, candidate, s, validateCandidate } = setup();
    const original = structuredClone(s);
    expect(commands.applyPreview(s, candidate, action('apply'))).toMatchObject({ ok: false, reasonCode: 'assumptions_not_acknowledged' });
    const applied = commands.applyPreview(s, candidate, action('apply', ['future-pass']));
    expect(applied.ok).toBe(true);
    expect(validateCandidate).toHaveBeenCalledTimes(2);
    expect(s).toEqual(original);
    if (!applied.ok) return;
    expect(applied.value.plan.planRevision).toBe(1);
    const current = { ...s, plan: applied.value.plan };
    const undone = commands.undoLast(current, applied.value.undo, action('undo'));
    expect(undone).toMatchObject({ ok: true, value: { plan: { planRevision: 2, activePlacements: original.plan.activePlacements } } });
    expect(commands.undoLast(current, applied.value.undo, action('undo'))).toMatchObject({ ok: false, code: 'stale_undo' });
  });
  for (const [name, change] of Object.entries({
    record: (s: PlanningScenario) => { s.record.unresolvedItems.push('new'); },
    evidence: (s: PlanningScenario) => { s.plan.availabilityEvidence[0]!.report = 'not_listed'; },
    capacity: (s: PlanningScenario) => { s.assumptions.creditCapacity[0]!.maximum = 9; },
    catalog: (s: PlanningScenario) => { s.catalog.courses['TEST-101']!.title = 'Edited'; },
    target: (s: PlanningScenario) => { s.plan.targetTerm = term(2031, 'spring'); },
    engine: (s: PlanningScenario) => { s.engineVersion = 'new'; },
    search: (s: PlanningScenario) => { s.searchOptions.maxExpansions = 500; },
    placements: (s: PlanningScenario) => { s.plan.activePlacements[0]!.termId = term(2030, 'spring'); },
  })) it(`rejects stale ${name} content even with unchanged revisions`, () => {
    const { commands, action, candidate, s, validateCandidate } = setup();
    change(s);
    const before = structuredClone(s);
    expect(commands.applyPreview(s, candidate, action('apply', ['future-pass']))).toMatchObject({ ok: false, code: 'stale_preview' });
    expect(s).toEqual(before);
    expect(validateCandidate).not.toHaveBeenCalled();
  });
  it('reject leaves plan and revisions untouched, and discarded preview cannot apply', () => {
    const { commands, action, candidate, s } = setup();
    const result = commands.rejectPreview({ plan: s.plan, previews: [candidate] }, candidate.previewId);
    expect(result.plan).toBe(s.plan);
    expect(result.previews).toEqual([]);
    expect(commands.applyPreview(s, candidate, action('apply', ['future-pass']))).toMatchObject({ ok: false, reasonCode: 'preview_rejected' });
  });
  it('rejects forged undo history and intervening edits', () => {
    const { commands, action, candidate, s } = setup();
    const applied = commands.applyPreview(s, candidate, action('apply', ['future-pass']));
    if (!applied.ok) throw new Error('apply failed');
    const current = { ...s, plan: applied.value.plan };
    const forged = { ...applied.value.undo, previousPlacements: [] };
    expect(commands.undoLast(current, forged, action('undo'))).toMatchObject({ ok: false, code: 'stale_undo' });
    current.record.recordRevision++;
    expect(commands.undoLast(current, applied.value.undo, action('undo'))).toMatchObject({ ok: false, code: 'stale_undo' });
  });
  it('retains valid undo when fresh evaluation fails', () => {
    const { commands, action, candidate, s, evaluate } = setup();
    const applied = commands.applyPreview(s, candidate, action('apply', ['future-pass']));
    if (!applied.ok) throw new Error('apply failed');
    const current = { ...s, plan: applied.value.plan };
    evaluate.mockReturnValueOnce({ ok: false, code: 'external_failure', reasonCode: 'engine_failed' });
    expect(commands.undoLast(current, applied.value.undo, action('undo'))).toMatchObject({ ok: false });
    expect(commands.undoLast(current, applied.value.undo, action('undo'))).toMatchObject({ ok: true });
  });
  it('rejects mismatched engine fingerprints and placements', () => {
    const { commands, action, candidate, s, validateCandidate } = setup();
    validateCandidate.mockReturnValueOnce({ ok: true, value: { baseFingerprint: fingerprint(s), placements: [], findings: [], assumptions: [] } });
    expect(commands.applyPreview(s, candidate, action('apply', ['future-pass']))).toMatchObject({ ok: false, reasonCode: 'candidate_changes_mismatch' });
    candidate.proposedPlacements = [];
    expect(commands.applyPreview(s, candidate, action('apply', ['future-pass']))).toMatchObject({ ok: false, reasonCode: 'candidate_changes_mismatch' });
  });
  it('never accepts a mismatched analysis fingerprint', () => {
    const { commands, action, candidate, s, evaluate } = setup();
    evaluate.mockReturnValueOnce({ ok: true, value: analysis(s) });
    expect(commands.applyPreview(s, candidate, action('apply', ['future-pass']))).toMatchObject({ ok: false, code: 'stale_preview' });
    expect(s.plan.planRevision).toBe(0);
  });
  it('student reports replace one authoritative entry and increment both revisions once; skip does neither', () => {
    const { commands, action, s } = setup();
    const skipped = commands.recordAvailability(s, { kind: 'skip', courseId: 'TEST-101', termId: s.plan.targetTerm }, action('availability'));
    expect(skipped).toMatchObject({ ok: true, value: { plan: s.plan } });
    const a = action('availability');
    // Observation may precede the action that records it; preserve its actual provenance.
    const report = { ...s.plan.availabilityEvidence[0]!, report: 'not_listed' as const };
    const result = commands.recordAvailability(s, report, a);
    expect(result).toMatchObject({ ok: true, value: { plan: { planRevision: 1, availabilityRevision: 1, availabilityEvidence: [report] } } });
    expect(commands.recordAvailability(s, { ...report, sourceKind: 'official_catalog' }, a)).toMatchObject({ ok: false });
  });
  it('records student intentions through evaluation without pretending recommendation validity', () => {
    const { commands, action, candidate, s, validateCandidate } = setup();
    expect(commands.recordStudentSelections(s, candidate.changeSet, action('student_edit'))).toMatchObject({ ok: true, value: { plan: { planRevision: 1 }, analysis: { outlook: { kind: 'insufficient_evidence' } } } });
    expect(validateCandidate).not.toHaveBeenCalled();
    expect(commands.recordStudentSelections(s, { baseFingerprint: fingerprint(s), operations: [{ kind: 'remove', placementId: 'missing' }] }, action('student_edit'))).toMatchObject({ ok: false });
  });
  it('rejects the entire edit when a later operation fails; swaps atomically', () => {
    const { commands, action, s } = setup();
    s.plan.activePlacements.push({ ...s.plan.activePlacements[0]!, placementId: 'p2', termId: term(2030, 'spring') });
    const before = structuredClone(s);
    const baseFingerprint = fingerprint(s);
    const swap = { kind: 'swap' as const, firstPlacementId: 'p1', secondPlacementId: 'p2' };
    expect(commands.recordStudentSelections(s, { baseFingerprint, operations: [swap, { kind: 'remove', placementId: 'missing' }] }, action('student_edit'))).toMatchObject({ ok: false });
    expect(s).toEqual(before);
    const result = commands.recordStudentSelections(s, { baseFingerprint, operations: [swap] }, action('student_edit'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.plan.activePlacements.map(p => p.termId.season)).toEqual(['spring', 'fall']);
  });
  it('accepts records as a new record revision without changing plan revision', () => {
    const { commands, action, s } = setup();
    const result = commands.acceptRecord(s, { ...s.record, recordRevision: 999 }, action('accept_record'));
    expect(result).toMatchObject({ ok: true, value: { record: { recordRevision: 1 } } });
    expect(s.plan.planRevision).toBe(0);
  });
  it('adopts exactly one draft through fresh preview/validation, preserving provenance and undo', () => {
    const { commands, action, s, preview, validateCandidate } = setup();
    const draft = { draftId: 'draft', baseFingerprint: fingerprint(s), placements: [{ ...s.plan.activePlacements[0]!, origin: 'system_projection' as const, active: false }], assumptions: ['future-pass'], validation: [], search: { policyVersion: 'search-v1', expansions: 1, stopReason: 'qualifying_candidate' as const } };
    const result = commands.adoptDraft(s, draft, action('adopt', ['future-pass']));
    expect(result).toMatchObject({ ok: true, value: { plan: { planRevision: 1, acceptedDraft: { draftId: 'draft' }, activePlacements: [{ origin: 'adopted_suggestion', active: true }] } } });
    expect(preview).toHaveBeenCalledOnce(); expect(validateCandidate).toHaveBeenCalledOnce();
    expect(draft.placements[0]!.active).toBe(false);
  });
  it('rejects reference-invalid analysis instead of surfacing stale candidates or orphan questions', () => {
    const { commands, action, s, candidate, evaluate } = setup();
    evaluate.mockImplementationOnce(next => ({ ok: true, value: { ...analysis(next), candidates: [candidate] } }));
    expect(commands.setTargetTerm(s, term(2031, 'fall'), action('set_target'))).toMatchObject({ ok: false, reasonCode: 'analysis_reference_mismatch' });
    evaluate.mockImplementationOnce(next => ({ ok: true, value: { ...analysis(next), availabilityQuestions: [{ questionId: 'q', courseId: 'TEST-101', termId: s.plan.targetTerm, findingIds: ['missing-finding'] }] } }));
    expect(commands.setTargetTerm(s, term(2031, 'fall'), action('set_target'))).toMatchObject({ ok: false, reasonCode: 'analysis_reference_mismatch' });
  });
  it('rejects fresh hard conflicts and leaves input intact', () => {
    const { commands, action, s, candidate, validateCandidate } = setup();
    validateCandidate.mockReturnValueOnce({ ok: true, value: { baseFingerprint: fingerprint(s), placements: candidate.proposedPlacements, assumptions: [], findings: [{ findingId: 'hard', code: 'prerequisite', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: ['TEST-101'], termIds: [], requirementIds: [], sourceRefs: ['synthetic'], explanationParams: {}, assumptions: [], nextAction: null }] } });
    expect(commands.applyPreview(s, candidate, action('apply', ['future-pass']))).toMatchObject({ ok: false, code: 'known_hard_conflict' });
    expect(s.plan.planRevision).toBe(0);
  });
  it('clears an older checkpoint on an independent successful edit', () => {
    const { commands, action, s, candidate } = setup();
    const applied = commands.applyPreview(s, candidate, action('apply', ['future-pass']));
    if (!applied.ok) throw new Error('apply failed');
    const current = { ...s, plan: applied.value.plan };
    expect(commands.setTargetTerm(current, term(2031, 'fall'), action('set_target'))).toMatchObject({ ok: true });
    expect(commands.undoLast(current, applied.value.undo, action('undo'))).toMatchObject({ ok: false, code: 'stale_undo' });
  });

});
