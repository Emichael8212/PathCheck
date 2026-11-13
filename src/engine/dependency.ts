// Scenario-specific dependency pressure: outstanding demands, earliest/latest feasible
// modeled term, slack and unlock effect. Only necessary (all-branch) edges propagate;
// OR alternatives are never treated as mandatory.
import type { CatalogModel, PlanPlacement, PlanningScenario, PrerequisiteExpr, RequirementGroup, RuleFinding } from '../contracts';
import type { AuditDetail } from './audit';
import { minCreditsEligibility } from './audit';
import { availabilityFor } from './planCheck';
import { necessaryCourses } from './prerequisites';
import { compareStrings, compareTuples, courseCredits, finding, uniqueSorted } from './util';

export interface Demand {
  requirementId: string; kind: 'course' | 'choose' | 'credits';
  options: string[]; needCourses: number; needCredits: number;
  plannable: boolean; constraintOnly: boolean; reason: string | null;
}
export interface CoursePressure { courseId: string; earliest: number | null; latest: number | null; slack: number | null; dependents: string[]; mandatory: boolean }
export interface DependencyInfo {
  demands: Demand[]; mandatory: Set<string>; pressure: Map<string, CoursePressure>;
  /** Index into scenario.assumptions.terms of the last modeled term at or before target; -1 if none. */
  targetIndex: number; targetInHorizon: boolean;
}

export function outstandingDemands(scenario: PlanningScenario, audit: AuditDetail): Demand[] {
  const { catalog } = scenario;
  const groups = new Map(catalog.requirementGroups.map(g => [g.requirementId, g]));
  const used = new Set<string>();
  for (const u of audit.allocation.keys()) { const unit = audit.units.get(u); if (unit?.courseId) used.add(unit.courseId); }
  for (const u of audit.units.values()) if (u.courseId && u.schedulingQuality <= 1) used.add(u.courseId);
  const knownCredits = (c: string) => courseCredits(catalog, c) !== null;
  const out: Demand[] = [];
  for (const g of catalog.requirementGroups) {
    const o = audit.outcomes.get(g.requirementId)!;
    if (!o.active || o.status !== 'unmet' || !o.need) continue;
    const documented = g.uncertainty === 'documented';
    const base = { requirementId: g.requirementId, constraintOnly: !g.consumesCredits };
    if (g.kind === 'course') out.push({ ...base, kind: 'course', options: [g.courseId], needCourses: 1, needCredits: 0, plannable: documented && knownCredits(g.courseId), reason: documented ? (knownCredits(g.courseId) ? null : 'credits_unknown') : `requirement_${g.uncertainty}` });
    else if (g.kind === 'choose_n' && g.courseIds.length) {
      const options = g.courseIds.filter(c => !used.has(c) && knownCredits(c));
      out.push({ ...base, kind: 'choose', options, needCourses: o.need.courses, needCredits: 0, plannable: documented && options.length >= o.need.courses, reason: documented ? (options.length >= o.need.courses ? null : 'insufficient_alternatives') : `requirement_${g.uncertainty}` });
    } else if (g.kind === 'min_credits') {
      const options = g.courseIds.filter(c => !used.has(c) && knownCredits(c) && minCreditsEligibility(catalog, groups, g, { unitId: c, courseId: c, rawCode: null, quality: 0, schedulingQuality: 0, credits: courseCredits(catalog, c), attemptIds: [], placementIds: [], reasons: [], orphan: false }) === 0);
      const capacity = options.reduce((s, c) => s + (courseCredits(catalog, c) ?? 0), 0);
      const plannable = documented && options.length >= o.need.courses && capacity >= o.need.credits;
      out.push({ ...base, kind: 'credits', options, needCourses: o.need.courses, needCredits: o.need.credits, plannable, reason: !documented ? `requirement_${g.uncertainty}` : plannable ? null : g.eligibility?.inventoryStatus === 'unresolved' ? 'elective_inventory_unresolved' : 'insufficient_named_options' });
    } else if (g.kind === 'total_degree_credits') out.push({ ...base, kind: 'credits', options: [], needCourses: 0, needCredits: o.need.credits, plannable: false, reason: 'unallocated_total_credits' });
  }
  return out;
}

function earliestTerms(scenario: PlanningScenario, audit: AuditDetail, fixed: readonly PlanPlacement[]): Map<string, number | null> {
  const { catalog, plan, record } = scenario;
  const terms = scenario.assumptions.terms; const n = terms.length;
  const done = new Map<string, number>();
  for (const u of audit.units.values()) if (u.courseId && u.schedulingQuality === 0) done.set(u.courseId, -1);
  for (const a of record.courseAttempts) if (a.status === 'in_progress' && a.normalizedCourseId) {
    const idx = a.term ? terms.findIndex(t => t.sortIndex === a.term!.sortIndex) : -1;
    if (!done.has(a.normalizedCourseId)) done.set(a.normalizedCourseId, idx);
  }
  for (const p of fixed) { const idx = terms.findIndex(t => t.sortIndex === p.termId.sortIndex); if (!done.has(p.courseId) && idx >= 0) done.set(p.courseId, idx); }
  const ids = Object.keys(catalog.courses).sort(compareStrings);
  const E = new Map<string, number | null>(ids.map(id => [id, done.get(id) ?? 0]));
  const blockedAt = (c: string, t: number) => availabilityFor(plan.availabilityEvidence, c, terms[t]!.sortIndex)?.report === 'not_listed';
  const satisfiable = (expr: PrerequisiteExpr, t: number): boolean => {
    switch (expr.kind) {
      case 'unresolved': return true;
      case 'course': { const e = E.get(expr.courseId); return e !== null && e !== undefined && e < t; }
      case 'corequisite': { const e = E.get(expr.courseId); return e !== null && e !== undefined && ((expr.policy.concurrencyAllowed && e <= t) || (expr.policy.priorCompletionAllowed && e < t)); }
      case 'all': return expr.children.every(c => satisfiable(c, t));
      case 'any': return expr.children.some(c => satisfiable(c, t));
    }
  };
  // Optimistic start, monotone increase; prior-term cycles escalate past the horizon (null).
  for (let iter = 0; iter <= n + 1; iter++) {
    let changed = false;
    for (const id of ids) {
      if (done.has(id)) continue;
      const cur = E.get(id); if (cur === null) continue;
      let t = cur!; while (t < n && (!satisfiable(catalog.courses[id]!.prerequisite, t) || blockedAt(id, t))) t++;
      const next = t >= n ? null : t;
      if (next !== cur) { E.set(id, next); changed = true; }
    }
    if (!changed) break;
  }
  return E;
}

export function dependencyInfo(scenario: PlanningScenario, audit: AuditDetail, fixed: readonly PlanPlacement[]): DependencyInfo {
  const { catalog, plan } = scenario;
  const terms = scenario.assumptions.terms;
  let targetIndex = -1; terms.forEach((t, i) => { if (t.sortIndex <= plan.targetTerm.sortIndex) targetIndex = i; });
  const targetInHorizon = plan.targetTerm.sortIndex <= terms[terms.length - 1]!.sortIndex;
  const demands = outstandingDemands(scenario, audit);
  const satisfiedCourses = new Set<string>();
  for (const u of audit.units.values()) if (u.courseId && u.schedulingQuality <= 1) satisfiedCourses.add(u.courseId);
  // Mandatory = required-course demands plus their outstanding necessary prerequisites (transitive).
  const mandatory = new Set<string>();
  const addMandatory = (c: string) => {
    if (mandatory.has(c) || satisfiedCourses.has(c) || !catalog.courses[c]) return; mandatory.add(c);
    const n = necessaryCourses(catalog.courses[c]!.prerequisite); [...n.prior, ...n.coreq].forEach(addMandatory);
  };
  for (const d of demands) if (d.kind === 'course') d.options.forEach(addMandatory);
  // Prerequisites of already-placed courses that are not yet satisfied are mandatory too.
  for (const p of fixed) { const n = necessaryCourses(catalog.courses[p.courseId]!.prerequisite); [...n.prior, ...n.coreq].forEach(addMandatory); }

  const E = earliestTerms(scenario, audit, fixed);
  const dependents = new Map<string, Set<string>>();
  const ids = Object.keys(catalog.courses).sort(compareStrings);
  const nec = new Map(ids.map(id => [id, necessaryCourses(catalog.courses[id]!.prerequisite)]));
  for (const id of ids) for (const pre of [...nec.get(id)!.prior, ...nec.get(id)!.coreq]) { if (!dependents.has(pre)) dependents.set(pre, new Set()); dependents.get(pre)!.add(id); }
  const L = new Map<string, number | null>();
  const placedIdx = new Map(fixed.map(p => [p.courseId, terms.findIndex(t => t.sortIndex === p.termId.sortIndex)]));
  const relevant = new Set([...mandatory, ...fixed.map(p => p.courseId)]);
  for (const id of relevant) L.set(id, targetIndex >= 0 && targetInHorizon ? targetIndex : null);
  for (let iter = 0; iter <= terms.length + relevant.size; iter++) {
    let changed = false;
    for (const id of [...relevant].sort(compareStrings)) {
      let l = L.get(id) ?? null; if (l === null) continue;
      for (const d of dependents.get(id) ?? []) {
        if (!relevant.has(d)) continue;
        const ld = placedIdx.get(d) ?? L.get(d) ?? null; if (ld === null) continue;
        const bound = nec.get(d)!.prior.has(id) ? ld - 1 : ld;
        if (bound < l) l = bound;
      }
      if (l !== L.get(id)) { L.set(id, l); changed = true; }
    }
    if (!changed) break;
  }
  const transitive = (c: string): string[] => {
    const out = new Set<string>(); const stack = [c];
    while (stack.length) for (const d of dependents.get(stack.pop()!) ?? []) if (relevant.has(d) && !out.has(d)) { out.add(d); stack.push(d); }
    return uniqueSorted(out);
  };
  const pressure = new Map<string, CoursePressure>();
  for (const id of [...relevant].sort(compareStrings)) {
    const e = E.get(id) ?? null, l = L.get(id) ?? null;
    pressure.set(id, { courseId: id, earliest: e, latest: l, slack: e !== null && l !== null ? l - e : null, dependents: transitive(id), mandatory: mandatory.has(id) });
  }
  // Pressure for non-mandatory alternatives (earliest only) so the scheduler can order them.
  for (const d of demands) for (const c of d.options) if (!pressure.has(c)) pressure.set(c, { courseId: c, earliest: E.get(c) ?? null, latest: targetInHorizon && targetIndex >= 0 ? targetIndex : null, slack: null, dependents: [], mandatory: false });
  return { demands, mandatory, pressure, targetIndex, targetInHorizon };
}

/** Findings for overlooked (unselected) outstanding requirements and dependency bottlenecks. */
export function pressureFindings(scenario: PlanningScenario, info: DependencyInfo, placements: readonly PlanPlacement[]): { unselected: RuleFinding[]; bottlenecks: RuleFinding[] } {
  const { catalog, plan } = scenario; const terms = scenario.assumptions.terms;
  const groups = new Map(catalog.requirementGroups.map(g => [g.requirementId, g]));
  const placed = new Set(placements.map(p => p.courseId));
  const unselected: RuleFinding[] = [], bottlenecks: RuleFinding[] = [];
  const termAt = (i: number | null) => (i !== null && i >= 0 && i < terms.length ? terms[i]! : null);
  for (const d of info.demands) {
    const g: RequirementGroup = groups.get(d.requirementId)!;
    if (d.kind === 'course') {
      const c = d.options[0]!; const p = info.pressure.get(c);
      const params = { earliestIndex: p?.earliest ?? -1, latestIndex: p?.latest ?? -1, slack: p?.slack ?? 'unknown', dependents: p?.dependents.length ?? 0, dependentCourses: (p?.dependents ?? []).join(',') };
      const timeSensitive = p?.slack !== null && p?.slack !== undefined && p.slack <= 1;
      const et = termAt(p?.earliest ?? null);
      unselected.push(finding({ code: timeSensitive ? 'unselected_time_sensitive_course' : 'unselected_required_course', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, courseIds: [c, ...(p?.dependents ?? [])], termIds: et ? [et] : [], requirementIds: [d.requirementId], sourceRefs: g.sourceRefs, explanationParams: params, nextAction: d.plannable ? 'add_course_to_plan' : 'confirm_requirement_evidence' }));
    } else if (d.kind === 'choose') {
      unselected.push(finding({ code: 'unselected_choice_requirement', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, courseIds: d.options, requirementIds: [d.requirementId], sourceRefs: g.sourceRefs, explanationParams: { needCourses: d.needCourses, alternatives: d.options.length, anyOneSuffices: d.needCourses === 1 }, nextAction: 'choose_alternative' }));
    } else {
      unselected.push(finding({ code: 'unselected_credit_requirement', severity: 'warning', status: { status: d.plannable ? 'unsatisfied' : 'unresolved', conditional: false }, courseIds: d.options, requirementIds: [d.requirementId], sourceRefs: g.sourceRefs, explanationParams: { needCredits: d.needCredits, needCourses: d.needCourses, reason: d.reason ?? 'none' }, nextAction: d.plannable ? 'choose_elective' : 'confirm_elective_eligibility' }));
    }
  }
  for (const p of info.pressure.values()) {
    if (!p.mandatory) continue;
    const isPlaced = placed.has(p.courseId);
    if (p.earliest === null && info.targetInHorizon) {
      bottlenecks.push(finding({ code: 'no_feasible_term_in_horizon', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, courseIds: [p.courseId, ...p.dependents], explanationParams: { placed: isPlaced }, sourceRefs: catalog.courses[p.courseId]!.sourceRefs, nextAction: 'review_prerequisite_chain' }));
    } else if (p.slack !== null && p.slack < 0) {
      bottlenecks.push(finding({ code: 'target_at_risk_chain', severity: 'warning', status: { status: 'unsatisfied', conditional: false }, courseIds: [p.courseId, ...p.dependents], explanationParams: { slack: p.slack, earliestIndex: p.earliest!, latestIndex: p.latest!, placed: isPlaced }, sourceRefs: catalog.courses[p.courseId]!.sourceRefs, nextAction: 'start_chain_earlier_or_change_target' }));
    } else if (p.slack !== null && p.slack <= 1 && p.dependents.length > 0) {
      const window = terms.slice(p.earliest!, p.latest! + 1);
      const unknown = window.some(t => availabilityFor(plan.availabilityEvidence, p.courseId, t.sortIndex)?.report !== 'listed');
      bottlenecks.push(finding({ code: 'potential_bottleneck', severity: 'warning', status: { status: 'unresolved', conditional: true }, courseIds: [p.courseId, ...p.dependents], termIds: window, explanationParams: { slack: p.slack, dependents: p.dependents.length, offeringUnverified: unknown, placed: isPlaced }, sourceRefs: catalog.courses[p.courseId]!.sourceRefs, assumptions: unknown ? [`offering_unknown:${p.courseId}`] : [], nextAction: unknown ? 'check_course_listing' : 'keep_chain_on_schedule' }));
    }
  }
  bottlenecks.sort((a, b) => compareTuples([Number(a.explanationParams.slack ?? 99), a.findingId], [Number(b.explanationParams.slack ?? 99), b.findingId]));
  return { unselected, bottlenecks };
}

export function remainingCapacity(scenario: PlanningScenario, catalog: CatalogModel, placements: readonly PlanPlacement[], targetIndex: number): number {
  const terms = scenario.assumptions.terms; let total = 0;
  for (let i = 0; i <= targetIndex; i++) {
    const cap = scenario.assumptions.creditCapacity.find(c => c.termId.sortIndex === terms[i]!.sortIndex)!;
    const used = placements.filter(p => p.termId.sortIndex === terms[i]!.sortIndex).reduce((s, p) => s + (courseCredits(catalog, p.courseId) ?? 0), 0);
    total += Math.max(0, cap.maximum - used);
  }
  return total;
}
