// Pure, non-mutating previews, fresh candidate validation and bounded candidate generation.
import { CandidatePreviewSchema, ChangeSetSchema, canonicalJson, fingerprint } from '../contracts';
import type { CandidatePreview, ChangeSet, InputFingerprint, PlanPlacement, PlanningScenario, Result, RuleFinding } from '../contracts';
import type { ValidatedCandidate } from '../contracts';
import { analyzePlacements, issueFindings, satisfiedLeafCount } from './analysis';
import type { PlanAnalysis } from './analysis';
import { availabilityFor, sortPlacements } from './planCheck';
import { evaluatePrerequisite, gradeIndexOf } from './prerequisites';
import { compareTuples, courseCredits, shortDigest, stableId, uniqueSorted } from './util';

export function applyChangeSet(scenario: PlanningScenario, base: readonly PlanPlacement[], changes: ChangeSet): Result<PlanPlacement[]> {
  const terms = new Set(scenario.assumptions.terms.map(t => t.sortIndex));
  let ps = base.map(p => ({ ...p }));
  const fail = (reasonCode: string): Result<PlanPlacement[]> => ({ ok: false, code: 'validation_error', reasonCode });
  for (const op of changes.operations) {
    if (op.kind === 'add') {
      const p = op.placement;
      if (!p.active || p.origin === 'system_projection') return fail('add_requires_active_placement');
      if (!scenario.catalog.courses[p.courseId]) return fail('unknown_course');
      if (!terms.has(p.termId.sortIndex)) return fail('term_outside_horizon');
      if (ps.some(x => x.placementId === p.placementId)) return fail('duplicate_placement_id');
      ps.push({ ...p });
    } else if (op.kind === 'move') {
      const p = ps.find(x => x.placementId === op.placementId); if (!p) return fail('unknown_placement');
      if (!terms.has(op.termId.sortIndex)) return fail('term_outside_horizon');
      p.termId = op.termId;
    } else if (op.kind === 'remove') {
      if (!ps.some(x => x.placementId === op.placementId)) return fail('unknown_placement');
      ps = ps.filter(x => x.placementId !== op.placementId);
    } else {
      const a = ps.find(x => x.placementId === op.firstPlacementId), b = ps.find(x => x.placementId === op.secondPlacementId);
      if (!a || !b || a === b) return fail('invalid_swap');
      const t = a.termId; a.termId = b.termId; b.termId = t;
    }
  }
  return { ok: true, value: ps };
}

const hardKey = (f: RuleFinding) => f.findingId;
interface Comparison { fixedHard: number; introducedHard: number; coverageDelta: number; riskDelta: number; unselectedDelta: number; newWarnings: number }
function compare(before: PlanAnalysis, after: PlanAnalysis): Comparison {
  const hb = new Set(before.hard.map(hardKey)), ha = new Set(after.hard.map(hardKey));
  const risk = (a: PlanAnalysis) => a.bottlenecks.filter(f => f.code === 'target_at_risk_chain' || f.code === 'no_feasible_term_in_horizon').length;
  const warnCodes = new Set(['duplicate_placement', 'placement_after_target', 'course_already_completed', 'course_in_progress_replanned']);
  const wb = new Set(before.planFindings.filter(f => warnCodes.has(f.code)).map(f => f.findingId));
  return {
    fixedHard: [...hb].filter(k => !ha.has(k)).length, introducedHard: [...ha].filter(k => !hb.has(k)).length,
    coverageDelta: satisfiedLeafCount(after) - satisfiedLeafCount(before), riskDelta: risk(after) - risk(before),
    unselectedDelta: after.unselected.length - before.unselected.length,
    newWarnings: after.planFindings.filter(f => warnCodes.has(f.code) && !wb.has(f.findingId)).length,
  };
}

export interface PreviewDetail { preview: CandidatePreview; comparison: Comparison; after: PlanAnalysis }

export function previewWith(scenario: PlanningScenario, base: InputFingerprint, before: PlanAnalysis, changes: ChangeSet): Result<PreviewDetail> {
  const applied = applyChangeSet(scenario, scenario.plan.activePlacements, changes);
  if (!applied.ok) return applied;
  const proposed = sortPlacements(applied.value);
  const after = analyzePlacements(scenario, proposed);
  const cmp = compare(before, after);
  const benefit = cmp.fixedHard > 0 || cmp.coverageDelta > 0 || cmp.riskDelta < 0 || cmp.unselectedDelta < 0;
  const harm = cmp.introducedHard > 0 || cmp.coverageDelta < 0 || cmp.riskDelta > 0 || cmp.newWarnings > 0;
  const changedIds = new Set(proposed.filter(p => { const o = scenario.plan.activePlacements.find(x => x.placementId === p.placementId); return !o || o.termId.sortIndex !== p.termId.sortIndex; }).map(p => p.placementId));
  const touching = (f: RuleFinding) => changedIds.has(String(f.explanationParams.placementId ?? ''));
  const afterFindings = issueFindings(after);
  const validability: CandidatePreview['validabilityStatus'] = cmp.introducedHard > 0 || after.hard.some(touching) ? 'invalid'
    : after.planFindings.some(f => touching(f) && f.status.status === 'unresolved' && f.code !== 'offering_unknown') ? 'unresolved'
    : changedIds.size > 0 || after.planFindings.some(f => touching(f) && f.status.conditional) ? 'conditional' : 'valid';
  const assumptions = uniqueSorted([...after.planFindings.filter(touching).flatMap(f => f.assumptions), ...scenario.assumptions.creditCapacity.filter(c => c.source === 'scenario_assumption').map(() => 'capacity:scenario_assumption')]);
  const preview: CandidatePreview = {
    previewId: stableId('preview', [shortDigest({ base, changes: changes.operations }, 24)]), baseFingerprint: base, changeSet: changes,
    proposedPlacements: proposed, before: issueFindings(before), after: afterFindings, assumptions,
    benefitClass: benefit && !harm ? 'improved' : benefit ? 'tradeoff' : 'no_valid_alternative', validabilityStatus: validability,
  };
  const parsed = CandidatePreviewSchema.safeParse(preview);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_preview' };
  return { ok: true, value: { preview: parsed.data, comparison: cmp, after } };
}

export function preview(scenario: PlanningScenario, changes: ChangeSet): Result<CandidatePreview> {
  const cs = ChangeSetSchema.safeParse(changes);
  if (!cs.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_change_set' };
  const base = fingerprint(scenario);
  if (cs.data.baseFingerprint !== base) return { ok: false, code: 'stale_preview', reasonCode: 'base_fingerprint_mismatch' };
  const r = previewWith(scenario, base, analyzePlacements(scenario, scenario.plan.activePlacements), cs.data);
  return r.ok ? { ok: true, value: r.value.preview } : r;
}

export function validateCandidate(scenario: PlanningScenario, input: CandidatePreview): Result<ValidatedCandidate> {
  const parsed = CandidatePreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_preview' };
  const current = fingerprint(scenario);
  if (parsed.data.baseFingerprint !== current) return { ok: false, code: 'stale_preview', reasonCode: 'stale_preview' };
  // Fresh, complete revalidation; never trust preview-carried findings.
  const fresh = previewWith(scenario, current, analyzePlacements(scenario, scenario.plan.activePlacements), parsed.data.changeSet);
  if (!fresh.ok) return fresh;
  if (canonicalJson(fresh.value.preview) !== canonicalJson(parsed.data)) return { ok: false, code: 'validation_error', reasonCode: 'preview_content_mismatch' };
  if (fresh.value.comparison.introducedHard > 0) return { ok: false, code: 'known_hard_conflict', reasonCode: 'candidate_introduces_hard_conflict' };
  return { ok: true, value: { baseFingerprint: current, placements: fresh.value.preview.proposedPlacements, findings: fresh.value.preview.after, assumptions: fresh.value.preview.assumptions } };
}

/** Bounded, deterministic candidate generation for the selected-course path (max 3 returned). */
export function generateCandidates(scenario: PlanningScenario, base: InputFingerprint, before: PlanAnalysis): CandidatePreview[] {
  const { catalog, record, plan } = scenario; const terms = scenario.assumptions.terms;
  const gradeIndex = gradeIndexOf(catalog);
  const active = plan.activePlacements;
  const ids = new Set(active.map(p => p.placementId));
  const load = (ps: readonly PlanPlacement[], sort: number) => ps.filter(p => p.termId.sortIndex === sort).reduce((s, p) => s + (courseCredits(catalog, p.courseId) ?? 0), 0)
    + record.courseAttempts.filter(a => a.status === 'in_progress' && a.term?.sortIndex === sort).reduce((s, a) => s + (a.attemptedCredits ?? 0), 0);
  const cap = (sort: number) => scenario.assumptions.creditCapacity.find(c => c.termId.sortIndex === sort)!.maximum;
  const canPlace = (courseId: string, sort: number, ps: readonly PlanPlacement[], extraCredits: number): boolean => {
    if (availabilityFor(plan.availabilityEvidence, courseId, sort)?.report === 'not_listed') return false;
    const credits = courseCredits(catalog, courseId); if (credits === null) return false;
    if (load(ps, sort) + credits - extraCredits > cap(sort)) return false;
    return evaluatePrerequisite(catalog.courses[courseId]!.prerequisite, sort, { catalog, attempts: record.courseAttempts, placements: ps, gradeIndex }).status !== 'unsatisfied';
  };
  const newId = (courseId: string, sort: number) => { let id = `sugg-${courseId}-${sort}`, n = 1; while (ids.has(id)) id = `sugg-${courseId}-${sort}-${n++}`; return id; };
  const targetSort = plan.targetTerm.sortIndex;
  const window = terms.filter(t => t.sortIndex <= targetSort);
  const sets: ChangeSet['operations'][] = [];
  const add = (ops: ChangeSet['operations']) => { if (ops.length && sets.length < 16) sets.push(ops); };

  for (const f of before.hard) {
    const pid = String(f.explanationParams.placementId ?? '');
    const p = active.find(x => x.placementId === pid);
    if (f.code === 'prerequisite_unsatisfied' && p) {
      const rest = active.filter(x => x.placementId !== p.placementId);
      const later = terms.find(t => t.sortIndex > p.termId.sortIndex && canPlace(p.courseId, t.sortIndex, rest, 0));
      if (later) add([{ kind: 'move', placementId: p.placementId, termId: later }]);
      for (const m of String(f.explanationParams.missing ?? '').split(',').filter(Boolean)) {
        const mp = active.find(x => x.courseId === m);
        const earlier = [...terms].reverse().filter(t => t.sortIndex < p.termId.sortIndex);
        if (mp) {
          const others = active.filter(x => x.placementId !== mp.placementId);
          const t = earlier.find(t => canPlace(m, t.sortIndex, others, 0));
          if (t) add([{ kind: 'move', placementId: mp.placementId, termId: t }]);
          if (mp.termId.sortIndex > p.termId.sortIndex) add([{ kind: 'swap', firstPlacementId: p.placementId, secondPlacementId: mp.placementId }]);
        } else if (catalog.courses[m]) {
          const t = [...earlier].reverse().find(t => canPlace(m, t.sortIndex, active, 0));
          if (t) add([{ kind: 'add', placement: { placementId: newId(m, t.sortIndex), courseId: m, termId: t, origin: 'adopted_suggestion', active: true } }]);
        }
      }
    } else if (f.code === 'reported_not_listed' && p) {
      const rest = active.filter(x => x.placementId !== p.placementId);
      const alt = [...terms].sort((a, b) => compareTuples([Math.abs(a.sortIndex - p.termId.sortIndex), a.sortIndex < p.termId.sortIndex ? 1 : 0, a.sortIndex], [Math.abs(b.sortIndex - p.termId.sortIndex), b.sortIndex < p.termId.sortIndex ? 1 : 0, b.sortIndex]))
        .find(t => t.sortIndex !== p.termId.sortIndex && canPlace(p.courseId, t.sortIndex, rest, 0));
      if (alt) add([{ kind: 'move', placementId: p.placementId, termId: alt }]);
    } else if (f.code === 'term_capacity_exceeded') {
      const sort = f.termIds[0]!.sortIndex;
      const inTerm = active.filter(x => x.termId.sortIndex === sort)
        .sort((a, b) => compareTuples([-(before.info.pressure.get(a.courseId)?.slack ?? 99), a.placementId], [-(before.info.pressure.get(b.courseId)?.slack ?? 99), b.placementId]));
      for (const x of inTerm.slice(0, 2)) {
        const rest = active.filter(y => y.placementId !== x.placementId);
        const t = terms.find(t => t.sortIndex > sort && canPlace(x.courseId, t.sortIndex, rest, 0));
        if (t) add([{ kind: 'move', placementId: x.placementId, termId: t }]);
      }
    }
  }
  const unselected = [...before.unselected].sort((a, b) => compareTuples([a.code === 'unselected_time_sensitive_course' ? 0 : a.code === 'unselected_required_course' ? 1 : 2, Number(a.explanationParams.slack ?? 99), a.findingId], [b.code === 'unselected_time_sensitive_course' ? 0 : b.code === 'unselected_required_course' ? 1 : 2, Number(b.explanationParams.slack ?? 99), b.findingId]));
  for (const f of unselected.slice(0, 4)) {
    const options = f.code === 'unselected_required_course' || f.code === 'unselected_time_sensitive_course' ? [f.courseIds[0]!] : f.code === 'unselected_choice_requirement' ? f.courseIds.slice(0, 2) : [];
    for (const c of options) {
      if (active.some(p => p.courseId === c)) continue;
      const t = window.find(t => canPlace(c, t.sortIndex, active, 0));
      if (t) add([{ kind: 'add', placement: { placementId: newId(c, t.sortIndex), courseId: c, termId: t, origin: 'adopted_suggestion', active: true } }]);
    }
  }
  const results = new Map<string, { preview: CandidatePreview; rank: (number | string)[] }>();
  const vRank = { valid: 0, conditional: 1, unresolved: 2, invalid: 3 } as const;
  for (const ops of sets) {
    const r = previewWith(scenario, base, before, { baseFingerprint: base, operations: ops });
    if (!r.ok || r.value.preview.benefitClass === 'no_valid_alternative' || r.value.comparison.introducedHard > 0) continue;
    const key = canonicalJson(r.value.preview.proposedPlacements.map(p => [p.courseId, p.termId.sortIndex]));
    const c = r.value.comparison;
    const rank = [r.value.preview.benefitClass === 'improved' ? 0 : 1, -c.fixedHard, -c.coverageDelta, c.riskDelta, vRank[r.value.preview.validabilityStatus], ops.length, r.value.preview.previewId];
    const prev = results.get(key);
    if (!prev || compareTuples(rank, prev.rank) < 0) results.set(key, { preview: r.value.preview, rank });
  }
  return [...results.values()].sort((a, b) => compareTuples(a.rank, b.rank)).slice(0, 3).map(x => x.preview);
}
