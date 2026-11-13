import {
  AcademicRecordSchema, AvailabilityEvidenceSchema, CandidatePreviewSchema, CatalogRefSchema,
  ChangeSetSchema, ExplicitUserActionSchema, GeneratedDraftSchema, PlanSchema, PlanningScenarioSchema,
  UndoCheckpointSchema, RuleFindingSchema, TermIdSchema, canonicalJson, fingerprint, validateAnalysisForScenario,
} from '../contracts';
import type {
  AcademicService, AnalysisResult, CandidatePreview, ChangeSet, ExplicitUserAction, Plan,
  PlannerCommands, PlanningScenario, Result, TypedFailure, UndoCheckpoint,
} from '../contracts';

const failure = (code: TypedFailure['code'], reasonCode: string): TypedFailure => ({ ok: false, code, reasonCode });
const invalid = (reason: string) => failure('validation_error', reason);
function guarded<T>(work: () => Result<T>): Result<T> {
  try { return work(); } catch { return invalid('invalid_command_input_or_service_output'); }
}
function actionFor(action: ExplicitUserAction, kind: ExplicitUserAction['kind']): boolean {
  return ExplicitUserActionSchema.parse(action).kind === kind;
}
// Structural edits only. Academic eligibility belongs exclusively to AcademicService.
function editPlacements(scenario: PlanningScenario, changes: ChangeSet): Plan['activePlacements'] {
  const placements = structuredClone(scenario.plan.activePlacements);
  const get = (id: string) => {
    const value = placements.find(p => p.placementId === id);
    if (!value) throw new Error('Unknown placement');
    return value;
  };
  for (const op of changes.operations) {
    switch (op.kind) {
      case 'add':
        if (placements.some(p => p.placementId === op.placement.placementId) || !op.placement.active) throw new Error('Invalid add');
        placements.push(structuredClone(op.placement)); break;
      case 'remove': placements.splice(placements.indexOf(get(op.placementId)), 1); break;
      case 'move': get(op.placementId).termId = structuredClone(op.termId); break;
      case 'swap': {
        if (op.firstPlacementId === op.secondPlacementId) throw new Error('Self swap');
        const first = get(op.firstPlacementId), second = get(op.secondPlacementId);
        [first.termId, second.termId] = [second.termId, first.termId]; break;
      }
    }
  }
  return placements;
}

/** One instance per planning session. Checkpoints are single-use and never persisted. */
export function createPlannerCommands(academic: AcademicService, newId: () => string = () => crypto.randomUUID()): PlannerCommands {
  let lastUndo: UndoCheckpoint | null = null;
  const rejected = new Set<string>();
  const evaluate = (scenario: PlanningScenario): Result<AnalysisResult> => {
    const result = academic.evaluate(structuredClone(scenario));
    if (!result.ok) return result;
    const checked = validateAnalysisForScenario(scenario, result.value);
    if (!checked.ok) return checked;
    const output = checked.value;
    const findings = [...output.topFindings, ...output.evidenceGaps, ...output.bottlenecks];
    const ids = new Set(findings.map(f => f.findingId));
    if (output.candidates.some(p => p.baseFingerprint !== output.inputFingerprint)
      || output.availabilityQuestions.some(q => !scenario.catalog.courses[q.courseId]
        || !scenario.assumptions.terms.some(t => t.sortIndex === q.termId.sortIndex)
        || q.findingIds.some(id => !ids.has(id)))) return invalid('analysis_reference_mismatch');
    return checked;
  };
  const update = (scenario: PlanningScenario, plan: Plan): Result<{ plan: Plan; analysis: AnalysisResult }> => {
    const next = PlanningScenarioSchema.parse({ ...scenario, plan });
    const result = evaluate(next);
    if (!result.ok) return result;
    lastUndo = null;
    return { ok: true, value: { plan: next.plan, analysis: result.value } };
  };
  const transact = (scenario: PlanningScenario, preview: CandidatePreview, action: ExplicitUserAction, acceptedDraft: Plan['acceptedDraft']): Result<{ plan: Plan; undo: UndoCheckpoint }> => {
    const before = fingerprint(scenario);
    if (preview.baseFingerprint !== before || preview.changeSet.baseFingerprint !== before) return failure('stale_preview', 'scenario_changed');
    if (rejected.has(preview.previewId)) return invalid('preview_rejected');
    if (!['valid', 'conditional'].includes(preview.validabilityStatus)) return failure('unresolved', 'preview_not_validatable');
    const result = academic.validateCandidate(structuredClone(scenario), structuredClone(preview));
    if (!result.ok) return result;
    const validated = result.value;
    if (validated.baseFingerprint !== before) return failure('stale_preview', 'validation_fingerprint_mismatch');
    if (canonicalJson(validated.placements) !== canonicalJson(preview.proposedPlacements) || canonicalJson(editPlacements(scenario, preview.changeSet)) !== canonicalJson(preview.proposedPlacements)) return invalid('candidate_changes_mismatch');
    validated.findings.forEach(f => RuleFindingSchema.parse(f));
    if (validated.findings.some(f => f.severity === 'error' && f.status.status === 'unsatisfied')) return failure('known_hard_conflict', 'candidate_has_hard_conflict');
    const assumptions = new Set([...preview.assumptions, ...validated.assumptions]);
    if ([...assumptions].some(a => !action.acknowledgedAssumptions.includes(a))) return failure('unresolved', 'assumptions_not_acknowledged');
    const plan = PlanSchema.parse({ ...scenario.plan, activePlacements: validated.placements, acceptedDraft, planRevision: scenario.plan.planRevision + 1, updatedAt: action.occurredAt });
    const next = PlanningScenarioSchema.parse({ ...scenario, plan });
    const analysis = evaluate(next);
    if (!analysis.ok) return analysis;
    const undo = UndoCheckpointSchema.parse({ checkpointId: newId(), beforeFingerprint: before, afterFingerprint: fingerprint(next), previousPlacements: scenario.plan.activePlacements, previousAcceptedDraft: scenario.plan.acceptedDraft });
    lastUndo = structuredClone(undo);
    return { ok: true, value: { plan: next.plan, undo } };
  };
  return {
    createGuestPlan(ref, target, action) { return guarded(() => {
      if (!actionFor(action, 'create')) return invalid('wrong_action_kind');
      const plan = PlanSchema.parse({ schemaVersion: 1, planId: newId(), planRevision: 0, catalogRef: CatalogRefSchema.parse(ref), targetTerm: target, activePlacements: [], acceptedDraft: null, availabilityEvidence: [], availabilityRevision: 0, updatedAt: action.occurredAt });
      lastUndo = null;
      return { ok: true, value: plan };
    }); },
    setTargetTerm(input, target, action) { return guarded(() => {
      if (!actionFor(action, 'set_target')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input);
      return update(scenario, { ...scenario.plan, targetTerm: target, planRevision: scenario.plan.planRevision + 1, updatedAt: action.occurredAt });
    }); },
    recordAvailability(input, report, action) { return guarded(() => {
      if (!actionFor(action, 'availability')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input);
      if ('kind' in report) {
        TermIdSchema.parse(report.termId);
        if (report.kind !== 'skip' || !scenario.catalog.courses[report.courseId]) return invalid('invalid_skip');
        const result = evaluate(scenario);
        return result.ok ? { ok: true, value: { plan: scenario.plan, analysis: result.value } } : result;
      }
      const evidence = AvailabilityEvidenceSchema.parse(report);
      // This is the student intent port, not a catalog evidence ingestion channel.
      if (evidence.sourceKind !== 'student_report') return invalid('invalid_student_report_provenance');
      const remaining = scenario.plan.availabilityEvidence.filter(e => e.courseId !== evidence.courseId || e.termId.sortIndex !== evidence.termId.sortIndex);
      return update(scenario, { ...scenario.plan, availabilityEvidence: [...remaining, evidence], availabilityRevision: scenario.plan.availabilityRevision + 1, planRevision: scenario.plan.planRevision + 1, updatedAt: action.occurredAt });
    }); },
    recordStudentSelections(input, inputChanges, action) { return guarded(() => {
      if (!actionFor(action, 'student_edit')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input), changes = ChangeSetSchema.parse(inputChanges);
      if (changes.baseFingerprint !== fingerprint(scenario)) return failure('stale_preview', 'scenario_changed');
      if (changes.operations.some(op => op.kind === 'add' && op.placement.origin !== 'student_selected')) return invalid('student_edit_origin');
      const placements = editPlacements(scenario, changes);
      return update(scenario, { ...scenario.plan, activePlacements: placements, planRevision: scenario.plan.planRevision + 1, updatedAt: action.occurredAt });
    }); },
    acceptRecord(input, proposed, action) { return guarded(() => {
      if (!actionFor(action, 'accept_record')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input);
      const record = AcademicRecordSchema.parse({ ...AcademicRecordSchema.parse(proposed), recordRevision: scenario.record.recordRevision + 1 });
      const next = PlanningScenarioSchema.parse({ ...scenario, record });
      const analysis = evaluate(next);
      if (!analysis.ok) return analysis;
      lastUndo = null;
      return { ok: true, value: { record, analysis: analysis.value } };
    }); },
    applyPreview(input, inputPreview, action) { return guarded(() => {
      if (!actionFor(action, 'apply')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input);
      return transact(scenario, CandidatePreviewSchema.parse(inputPreview), action, scenario.plan.acceptedDraft);
    }); },
    rejectPreview(session, previewId) {
      rejected.add(previewId);
      return { plan: session.plan, previews: session.previews.filter(p => p.previewId !== previewId) };
    },
    undoLast(input, inputCheckpoint, action) { return guarded(() => {
      if (!actionFor(action, 'undo')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input), checkpoint = UndoCheckpointSchema.parse(inputCheckpoint);
      if (!lastUndo || canonicalJson(lastUndo) !== canonicalJson(checkpoint) || fingerprint(scenario) !== checkpoint.afterFingerprint) return failure('stale_undo', 'checkpoint_not_current');
      return update(scenario, { ...scenario.plan, activePlacements: checkpoint.previousPlacements, acceptedDraft: checkpoint.previousAcceptedDraft, planRevision: scenario.plan.planRevision + 1, updatedAt: action.occurredAt });
    }); },
    adoptDraft(input, inputDraft, action) { return guarded(() => {
      if (!actionFor(action, 'adopt')) return invalid('wrong_action_kind');
      const scenario = PlanningScenarioSchema.parse(input), draft = GeneratedDraftSchema.parse(inputDraft);
      if (fingerprint(scenario) !== draft.baseFingerprint) return failure('stale_preview', 'scenario_changed');
      const placements = draft.placements.map(p => ({ ...p, active: true, origin: 'adopted_suggestion' as const }));
      const changes = ChangeSetSchema.parse({ baseFingerprint: draft.baseFingerprint, operations: [
        ...scenario.plan.activePlacements.map(p => ({ kind: 'remove', placementId: p.placementId })),
        ...placements.map(placement => ({ kind: 'add', placement })),
      ] });
      const result = academic.preview(structuredClone(scenario), changes);
      if (!result.ok) return result;
      const preview = CandidatePreviewSchema.parse(result.value);
      if (canonicalJson(preview.changeSet) !== canonicalJson(changes)) return invalid('draft_changes_mismatch');
      if (draft.assumptions.some(a => !action.acknowledgedAssumptions.includes(a))) return failure('unresolved', 'assumptions_not_acknowledged');
      return transact(scenario, preview, action, { draftId: draft.draftId, adoptedAt: action.occurredAt });
    }); },
  };
}
