// Full validator for a set of (hypothetical) active placements under a scenario.
// Used identically for the active plan, previews, candidates and generated drafts.
import type { AvailabilityEvidence, PlanPlacement, PlanningScenario, RuleFinding } from '../contracts';
import type { AuditDetail } from './audit';
import { POLICY, UNMODELED_REQUIREMENT_POLICIES, requirementPoliciesUnmodeled } from './policy';
import { evaluatePrerequisite, gradeIndexOf, impossibleCycles } from './prerequisites';
import { repeatPolicyScope } from './repeatPolicy';
import { compareTuples, courseCredits, definitelyNotPassed, finding, hasPolicyGap } from './util';

/** Codes that represent known (sourced or student-reported-scenario) hard constraint violations. */
export const HARD_CODES = new Set(['prerequisite_unsatisfied', 'reported_not_listed', 'term_capacity_exceeded', 'prerequisite_cycle']);
export const isHard = (f: RuleFinding) => HARD_CODES.has(f.code) && f.severity === 'error';

export function availabilityFor(evidence: readonly AvailabilityEvidence[], courseId: string, sortIndex: number): AvailabilityEvidence | null {
  return evidence.find(e => e.courseId === courseId && e.termId.sortIndex === sortIndex) ?? null;
}

export function sortPlacements(ps: readonly PlanPlacement[]): PlanPlacement[] {
  return [...ps].sort((a, b) => compareTuples([a.termId.sortIndex, a.courseId, a.placementId], [b.termId.sortIndex, b.courseId, b.placementId]));
}

export function validatePlacements(scenario: PlanningScenario, placementsIn: readonly PlanPlacement[], audit: AuditDetail): RuleFinding[] {
  const { catalog, record, plan, assumptions } = scenario;
  const placements = sortPlacements(placementsIn);
  const gradeIndex = gradeIndexOf(catalog);
  const out: RuleFinding[] = [];
  const referenced = new Set(catalog.requirementGroups.flatMap(g => g.kind === 'course' ? [g.courseId] : 'courseIds' in g ? g.courseIds : []));
  const offeringsUnknownPolicy = hasPolicyGap(catalog, POLICY.offerings);
  for (const p of placements) {
    const course = catalog.courses[p.courseId]!;
    const termIds = [p.termId];
    const others = placements.filter(x => x.placementId !== p.placementId);
    const r = evaluatePrerequisite(course.prerequisite, p.termId.sortIndex, { catalog, attempts: record.courseAttempts, placements: others, gradeIndex });
    const params = { placementId: p.placementId, reasons: r.reasons.join(',') };
    if (r.status === 'unsatisfied') out.push(finding({ code: 'prerequisite_unsatisfied', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: [p.courseId, ...r.missing.filter(m => m !== p.courseId)], termIds, sourceRefs: course.sourceRefs, explanationParams: { ...params, missing: r.missing.join(',') }, nextAction: 'reschedule_or_add_prerequisite' }));
    else if (r.status === 'unresolved') out.push(finding({ code: 'prerequisite_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: params, assumptions: r.assumptions, nextAction: 'confirm_prerequisite_with_department' }));
    else if (r.conditional) out.push(finding({ code: 'prerequisite_conditional', severity: 'info', status: { status: 'satisfied', conditional: true }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: params, assumptions: r.assumptions, nextAction: null }));

    const unit = audit.units.get(`unit:${p.courseId}`);
    if (unit && unit.schedulingQuality === 0) out.push(finding({ code: 'course_already_completed', severity: 'warning', status: { status: 'satisfied', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: { placementId: p.placementId }, nextAction: 'remove_duplicate_course' }));
    if (record.courseAttempts.some(a => a.normalizedCourseId === p.courseId && a.status === 'in_progress')) out.push(finding({ code: 'course_in_progress_replanned', severity: 'warning', status: { status: 'unresolved', conditional: true }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: { placementId: p.placementId }, nextAction: 'confirm_in_progress_outcome' }));
    if (placements.filter(x => x.courseId === p.courseId).length > 1) out.push(finding({ code: 'duplicate_placement', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: { placementId: p.placementId }, nextAction: 'remove_duplicate_course' }));
    if (p.termId.sortIndex > plan.targetTerm.sortIndex) out.push(finding({ code: 'placement_after_target', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: { placementId: p.placementId, targetSortIndex: plan.targetTerm.sortIndex }, nextAction: 'move_before_target_or_change_target' }));
    if (course.credits === 'unknown') out.push(finding({ code: 'course_credits_unknown', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, nextAction: 'confirm_course_credits' }));
    if (!referenced.has(p.courseId)) out.push(finding({ code: 'course_not_in_requirements', severity: 'info', status: { status: 'unresolved', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: course.sourceRefs, explanationParams: { placementId: p.placementId }, nextAction: null }));

    const ev = availabilityFor(plan.availabilityEvidence, p.courseId, p.termId.sortIndex);
    const evParams = { placementId: p.placementId, seatAvailability: 'not_verified', summer: p.termId.season === 'summer' };
    if (ev?.report === 'not_listed') out.push(finding({ code: 'reported_not_listed', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: [p.courseId], termIds, sourceRefs: [ev.sourceRef], explanationParams: { ...evParams, sourceKind: ev.sourceKind, observedAt: ev.observedAt }, assumptions: [`availability:${ev.sourceKind}`], nextAction: 'move_to_another_term' }));
    else if (ev?.report === 'listed') out.push(finding({ code: 'reported_listed', severity: 'info', status: { status: 'satisfied', conditional: true }, courseIds: [p.courseId], termIds, sourceRefs: [ev.sourceRef], explanationParams: { ...evParams, sourceKind: ev.sourceKind, observedAt: ev.observedAt }, assumptions: [`availability:${ev.sourceKind}`], nextAction: null }));
    else out.push(finding({ code: 'offering_unknown', severity: 'warning', status: { status: 'unresolved', conditional: true }, courseIds: [p.courseId], termIds, sourceRefs: ev ? [ev.sourceRef] : [], explanationParams: { ...evParams, policyUnresolved: offeringsUnknownPolicy, reported: ev ? 'unknown' : 'none' }, assumptions: [`offering_unknown:${p.courseId}@${p.termId.sortIndex}`], nextAction: 'check_course_listing' }));
  }
  for (const cap of assumptions.creditCapacity) {
    const inTerm = placements.filter(p => p.termId.sortIndex === cap.termId.sortIndex);
    const ip = record.courseAttempts.filter(a => a.status === 'in_progress' && a.term?.sortIndex === cap.termId.sortIndex && !inTerm.some(p => p.courseId === a.normalizedCourseId));
    const credits = [...inTerm.map(p => courseCredits(catalog, p.courseId)), ...ip.map(a => a.attemptedCredits)];
    const known = credits.filter((c): c is number => c !== null).reduce((s, c) => s + c, 0);
    const params = { credits: known, maximum: cap.maximum, capacitySource: cap.source };
    if (known > cap.maximum) out.push(finding({ code: 'term_capacity_exceeded', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: inTerm.map(p => p.courseId), termIds: [cap.termId], explanationParams: params, assumptions: [`capacity:${cap.source}`], nextAction: 'move_course_to_lighter_term' }));
    else if (credits.some(c => c === null)) out.push(finding({ code: 'term_capacity_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: inTerm.map(p => p.courseId), termIds: [cap.termId], explanationParams: params, assumptions: [`capacity:${cap.source}`], nextAction: 'confirm_course_credits' }));
  }
  const relevant = new Set([...placements.map(p => p.courseId)]);
  for (const comp of impossibleCycles(catalog)) if (comp.some(c => relevant.has(c))) {
    out.push(finding({ code: 'prerequisite_cycle', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: comp, sourceRefs: comp.flatMap(c => catalog.courses[c]!.sourceRefs), explanationParams: { size: comp.length }, nextAction: 'report_catalog_conflict' }));
  }
  return out;
}

/** Evidence gaps that come from the record, catalog and horizon rather than placements. */
export function recordAndCatalogGaps(scenario: PlanningScenario, audit: AuditDetail): RuleFinding[] {
  const { catalog, record, plan, assumptions } = scenario;
  const out: RuleFinding[] = [];
  if (catalog.catalogRef.catalogYearId === null) out.push(finding({ code: 'catalog_applicability_unverified', severity: 'warning', status: { status: 'unresolved', conditional: false }, sourceRefs: catalog.catalogRef.sources.map(s => s.sourceId), explanationParams: { catalogVersion: catalog.catalogRef.catalogVersion, ruleSetStatus: catalog.catalogRef.ruleSetStatus }, nextAction: 'confirm_governing_catalog' }));
  if (requirementPoliciesUnmodeled(catalog)) for (const policyId of UNMODELED_REQUIREMENT_POLICIES) out.push(finding({ code: 'requirement_policy_unmodeled', severity: 'warning', status: { status: 'unresolved', conditional: false }, explanationParams: { policyId }, idParts: [policyId], nextAction: 'confirm_policy_with_department' }));
  for (const g of catalog.policyGaps) if (g.blocksConclusions) out.push(finding({ code: 'policy_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, requirementIds: [], sourceRefs: g.sourceRefs, explanationParams: { policyId: g.policyId }, idParts: [g.policyId], nextAction: 'confirm_policy_with_department' }));
  for (const a of record.courseAttempts) {
    const params = { attemptId: a.attemptId };
    if (a.normalizedCourseId === null && !definitelyNotPassed(a)) out.push(finding({ code: a.origin === 'transfer' ? 'transfer_equivalency_unverified' : 'unmapped_attempt', severity: 'warning', status: { status: 'unresolved', conditional: false }, explanationParams: params, idParts: [a.attemptId], nextAction: a.origin === 'transfer' ? 'request_transfer_evaluation' : 'resolve_course_mapping' }));
    else if (a.normalizedCourseId !== null && (a.status === 'unknown' || a.status === 'incomplete' || a.status === 'transfer_pending' || (a.status === 'completed' && a.earnedCredits === null) || a.confidence === 'unresolved')) out.push(finding({ code: 'attempt_status_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: [a.normalizedCourseId], explanationParams: { ...params, status: a.status }, idParts: [a.attemptId], nextAction: 'confirm_attempt_details' }));
    if (a.status === 'in_progress') out.push(finding({ code: 'in_progress_not_earned', severity: 'info', status: { status: 'unresolved', conditional: true }, courseIds: a.normalizedCourseId ? [a.normalizedCourseId] : [], explanationParams: params, idParts: [a.attemptId], assumptions: [`future_pass:${a.normalizedCourseId ?? a.attemptId}`], nextAction: null }));
  }
  for (const u of audit.units.values()) if (u.reasons.includes('repeat_policy_unresolved') && u.courseId) {
    const scope = repeatPolicyScope(catalog, u.courseId);
    const detail = u.reasons.filter(r => r.startsWith('repeat_') && r !== 'repeat_policy_unresolved');
    out.push(finding({ code: 'repeat_policy_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, courseIds: [u.courseId],
      explanationParams: { attempts: u.attemptIds.length, policyScope: scope, ...(detail.length ? { reasons: detail.join(',') } : {}) },
      sourceRefs: [...catalog.policyGaps.filter(g => g.policyId === POLICY.repeatCredit).flatMap(g => g.sourceRefs), ...(scope === 'in_scope' ? catalog.repeatCreditPolicy!.sourceRefs : [])], nextAction: 'confirm_repeat_policy' }));
  }
  for (const g of catalog.requirementGroups) {
    const o = audit.outcomes.get(g.requirementId)!;
    if (!o.active || o.status !== 'unresolved' || g.kind === 'all' || (g.kind === 'choose_n' && g.requirementIds.length > 0)) continue;
    out.push(finding({ code: 'requirement_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, requirementIds: [g.requirementId], sourceRefs: g.sourceRefs, explanationParams: { reasons: o.reasons.join(',') }, nextAction: 'confirm_requirement_evidence' }));
  }
  if (record.unresolvedItems.length) out.push(finding({ code: 'record_items_unresolved', severity: 'warning', status: { status: 'unresolved', conditional: false }, explanationParams: { count: record.unresolvedItems.length }, nextAction: 'review_academic_record' }));
  const terms = assumptions.terms;
  if (plan.targetTerm.sortIndex > terms[terms.length - 1]!.sortIndex) out.push(finding({ code: 'target_outside_horizon', severity: 'warning', status: { status: 'unresolved', conditional: false }, termIds: [plan.targetTerm], explanationParams: { lastModeledSortIndex: terms[terms.length - 1]!.sortIndex }, nextAction: 'extend_modeled_terms' }));
  if (plan.targetTerm.sortIndex < terms[0]!.sortIndex) out.push(finding({ code: 'target_before_horizon', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, termIds: [plan.targetTerm], nextAction: 'change_target_term' }));
  const assumed = assumptions.creditCapacity.filter(c => c.source === 'scenario_assumption');
  if (assumed.length) out.push(finding({ code: 'capacity_is_assumption', severity: 'info', status: { status: 'unresolved', conditional: true }, termIds: assumed.map(c => c.termId), explanationParams: { maximum: Math.max(...assumed.map(c => c.maximum)) }, assumptions: ['capacity:scenario_assumption'], nextAction: 'confirm_personal_credit_load' }));
  return out;
}
