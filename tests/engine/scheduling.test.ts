// T-SCH / T-AVAIL engine-side fixtures (SCH-01..19; SCH-12/20 transactions are L-owned).
// ENTIRELY SYNTHETIC catalog graph; no ASU rules.
import { describe, expect, it } from 'vitest';
import { SEARCH_POLICY, SearchOptionsSchema, canonicalJson, fingerprint, validateAnalysisForScenario } from '../../src/contracts';
import type { CandidatePreview, ChangeSet, GeneratedDraft, PlanningScenario } from '../../src/contracts';
import { evaluate, generateDraft, preview, startDraftGeneration, validateCandidate } from '../../src/engine';
import { computeAudit } from '../../src/engine/audit';
import { dependencyInfo } from '../../src/engine/dependency';
import { validatePlacements } from '../../src/engine/planCheck';
import { createSearch } from '../../src/engine/search';
import { T, any, attempt, catalog, chooseCourses, course, horizon, place, pre, reqAll, reqCourse, report, scenario, unresolvedRule } from '../fixtures/engine/synthetic';

// Chain 101 -> 201 -> 301 -> 401; 202 requires 101 OR 102; one-of elective {310, 311}.
const chainCatalog = (o: { electiveRule?: boolean } = {}) => catalog([
  course('TEST-101'), course('TEST-201', 3, pre('TEST-101')), course('TEST-301', 3, pre('TEST-201')), course('TEST-401', 3, pre('TEST-301')),
  course('TEST-102'), course('TEST-202', 3, any(pre('TEST-101'), pre('TEST-102'))),
  course('TEST-310', 3, o.electiveRule ? unresolvedRule() : { kind: 'all', children: [] }), course('TEST-311'),
], [
  reqAll('root', ['r101', 'r201', 'r301', 'r401', 'r102', 'r202', 'elective']),
  reqCourse('r101', 'TEST-101'), reqCourse('r201', 'TEST-201'), reqCourse('r301', 'TEST-301'), reqCourse('r401', 'TEST-401'),
  reqCourse('r102', 'TEST-102'), reqCourse('r202', 'TEST-202'), chooseCourses('elective', 1, ['TEST-310', 'TEST-311']),
], { root: 'root' });
const terms4 = horizon(4);
const ok = <V>(r: { ok: true; value: V } | { ok: false; reasonCode: string }): V => { if (!r.ok) throw new Error(r.reasonCode); return r.value; };
const draftOf = (s: PlanningScenario): GeneratedDraft => { const v = ok(generateDraft(s)); if ('kind' in v) throw new Error('no draft'); return v; };
const changes = (s: PlanningScenario, operations: ChangeSet['operations']): ChangeSet => ({ baseFingerprint: fingerprint(s), operations });

describe('SCH-01..04 overlooked requirements, slack and alternatives', () => {
  it('SCH-01 omitted time-sensitive chain start is identified with its downstream dependents', () => {
    const s = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-102', terms4[0]!)] });
    const r = ok(evaluate(s));
    const f = r.topFindings.find(x => x.courseIds[0] === 'TEST-101')!;
    expect(f.code).toBe('unselected_time_sensitive_course');
    expect(f.courseIds).toEqual(expect.arrayContaining(['TEST-201', 'TEST-301', 'TEST-401']));
    expect(f.explanationParams.slack).toBe(0);
  });
  it('SCH-02 many dependents but ample slack is not ranked critical', () => {
    const terms8 = horizon(8);
    const s = scenario(chainCatalog(), { terms: terms8, attempts: [attempt('TEST-102'), attempt('TEST-310')] });
    const r = ok(evaluate(s));
    const all = [...r.topFindings, ...r.bottlenecks];
    expect(all.some(f => f.code === 'unselected_time_sensitive_course' && f.courseIds[0] === 'TEST-101')).toBe(false);
    expect(r.bottlenecks.some(f => f.courseIds[0] === 'TEST-101')).toBe(false);
  });
  it('SCH-03 OR prerequisite alternatives create no mandatory edge', () => {
    const s = scenario(chainCatalog(), { terms: terms4 });
    const info = dependencyInfo(s, computeAudit({ catalog: s.catalog, attempts: [], placements: [], targetSort: s.plan.targetTerm.sortIndex }), []);
    expect(info.pressure.get('TEST-102')?.dependents ?? []).not.toContain('TEST-202');
    expect(info.pressure.get('TEST-101')!.dependents).not.toContain('TEST-202');
    const viaB = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-102', terms4[0]!), place('TEST-202', terms4[1]!)] });
    expect(ok(evaluate(viaB)).topFindings.some(f => f.code === 'prerequisite_unsatisfied')).toBe(false);
  });
  it('SCH-04 an already-satisfied elective group gets no extra elective recommendation', () => {
    const s = scenario(chainCatalog(), { terms: terms4, attempts: [attempt('TEST-310')] });
    const r = ok(evaluate(s));
    expect([...r.topFindings, ...r.bottlenecks].some(f => f.requirementIds.includes('elective'))).toBe(false);
    expect(draftOf(s).placements.some(p => p.courseId === 'TEST-311')).toBe(false);
  });
});

describe('SCH-05/11 previews are non-mutating and honest about tradeoffs', () => {
  it('SCH-05 a change that fixes one issue and causes another is a tradeoff, both shown', () => {
    // TEST-201 placed same term as its prerequisite; moving it after the target fixes the conflict but adds a new issue.
    const terms = horizon(4); const target = terms[2]!;
    const s = scenario(chainCatalog(), { terms, target, placements: [place('TEST-101', terms[1]!), place('TEST-201', terms[1]!)] });
    const p = ok(preview(s, changes(s, [{ kind: 'move', placementId: `p-TEST-201-${terms[1]!.sortIndex}`, termId: terms[3]! }])));
    expect(p.benefitClass).toBe('tradeoff');
    expect(p.before.some(f => f.code === 'prerequisite_unsatisfied')).toBe(true);
    expect(p.after.some(f => f.code === 'prerequisite_unsatisfied')).toBe(false);
    expect(p.after.some(f => f.code === 'placement_after_target')).toBe(true);
  });
  it('SCH-11 preview leaves the scenario identical; stale base fingerprint is refused', () => {
    const s = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-101', terms4[0]!)] });
    const snapshot = canonicalJson(s);
    ok(preview(s, changes(s, [{ kind: 'add', placement: place('TEST-201', terms4[1]!) }])));
    expect(canonicalJson(s)).toBe(snapshot);
    const stale = { ...changes(s, [{ kind: 'remove', placementId: `p-TEST-101-${terms4[0]!.sortIndex}` }]), baseFingerprint: fingerprint(scenario(chainCatalog())) };
    expect(preview(s, stale)).toMatchObject({ ok: false, code: 'stale_preview' });
  });
  it('validateCandidate revalidates freshly and rejects tampered preview content or hard conflicts', () => {
    const s = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-101', terms4[0]!)] });
    const p = ok(preview(s, changes(s, [{ kind: 'add', placement: place('TEST-201', terms4[1]!) }])));
    expect(ok(validateCandidate(s, p)).placements).toEqual(p.proposedPlacements);
    const tampered: CandidatePreview = { ...p, benefitClass: 'improved', after: [] };
    expect(validateCandidate(s, tampered)).toMatchObject({ ok: false, reasonCode: 'preview_content_mismatch' });
    const bad = ok(preview(s, changes(s, [{ kind: 'add', placement: place('TEST-301', terms4[1]!) }])));
    expect(bad.validabilityStatus).toBe('invalid');
    expect(validateCandidate(s, bad)).toMatchObject({ ok: false, code: 'known_hard_conflict' });
  });
  it('engine-generated candidates never introduce a hidden hard conflict', () => {
    const s = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-101', terms4[1]!), place('TEST-201', terms4[1]!)] });
    const r = ok(evaluate(s));
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) { const v = validateCandidate(s, c); expect(v.ok).toBe(true); expect(c.validabilityStatus).not.toBe('invalid'); }
  });
});

describe('SCH-06..10/16 availability evidence (student-reported, never seats)', () => {
  const at = (r: 'listed' | 'not_listed' | 'unknown' | null) => scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-101', terms4[0]!)], availability: r ? [report('TEST-101', terms4[0]!, r)] : [] });
  it('SCH-06 unknown offering yields a conditional placement with an explicit assumption', () => {
    const r = ok(evaluate(at(null)));
    const gap = r.evidenceGaps.find(f => f.code === 'offering_unknown')!;
    expect(gap.status).toEqual({ status: 'unresolved', conditional: true });
    expect(gap.assumptions).toContain(`offering_unknown:TEST-101@${terms4[0]!.sortIndex}`);
    expect(r.outlook.assumptionRefs).toContain(`offering_unknown:TEST-101@${terms4[0]!.sortIndex}`);
  });
  it('SCH-07 listed report is source-stamped conditional evidence, never a seat claim', () => {
    const s = at('listed');
    const r = ok(evaluate(s));
    expect([...r.evidenceGaps, ...r.topFindings].some(x => x.code === 'offering_unknown' && x.courseIds[0] === 'TEST-101')).toBe(false);
    const f = ok(preview(s, changes(s, [{ kind: 'add', placement: place('TEST-102', terms4[0]!) }]))).after.find(x => x.code === 'reported_listed')!;
    expect(f.status).toEqual({ status: 'satisfied', conditional: true });
    expect(f.explanationParams).toMatchObject({ seatAvailability: 'not_verified', sourceKind: 'student_report', observedAt: '2026-01-01T00:00:00Z' });
    expect(f.sourceRefs).toEqual([`syn-report-TEST-101-${terms4[0]!.sortIndex}`]);
    expect(f.assumptions).toEqual(['availability:student_report']);
  });
  it('SCH-08 not_listed is a hard conflict for that placement and the generator avoids that term', () => {
    const r = ok(evaluate(at('not_listed')));
    expect(r.topFindings[0]!.code).toBe('reported_not_listed');
    expect(r.outlook.kind).toBe('known_constraints_block_current_plan');
    const gen = scenario(chainCatalog(), { terms: horizon(5), availability: [report('TEST-101', horizon(5)[0]!, 'not_listed')] });
    const v = ok(generateDraft(gen));
    if (!('kind' in v)) expect(v.placements.some(p => p.courseId === 'TEST-101' && p.termId.sortIndex === horizon(5)[0]!.sortIndex)).toBe(false);
  });
  it('SCH-09 editing an availability report invalidates prior previews and recalculates', () => {
    const s = at(null); const p = ok(preview(s, changes(s, [{ kind: 'add', placement: place('TEST-201', terms4[1]!) }])));
    const edited = at('not_listed');
    expect(validateCandidate(edited, p)).toMatchObject({ ok: false, code: 'stale_preview' });
    expect(ok(evaluate(edited)).inputFingerprint).not.toBe(ok(evaluate(s)).inputFingerprint);
  });
  it('SCH-10 at most three high-impact questions, including unselected courses, never re-asking answered ones', () => {
    const s = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-102', terms4[0]!)] });
    const q = ok(evaluate(s)).availabilityQuestions;
    expect(q.length).toBeGreaterThan(0); expect(q.length).toBeLessThanOrEqual(3);
    expect(q.some(x => x.courseId === 'TEST-101')).toBe(true); // unselected, time-sensitive
    const answered = scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-102', terms4[0]!)], availability: [report('TEST-101', terms4[0]!, 'unknown')] });
    expect(ok(evaluate(answered)).availabilityQuestions.some(x => x.courseId === 'TEST-101' && x.termId.sortIndex === terms4[0]!.sortIndex)).toBe(false);
  });
  it('SCH-16 capacity and summer offerings are explicit assumptions, not official facts', () => {
    const summer = T(2026, 'summer');
    const s = scenario(chainCatalog(), { terms: [T(2026, 'spring'), summer, T(2026, 'fall')], placements: [place('TEST-101', summer)] });
    const r = ok(evaluate(s));
    expect(r.evidenceGaps.some(f => f.code === 'capacity_is_assumption')).toBe(true);
    expect(r.evidenceGaps.find(f => f.code === 'offering_unknown')!.explanationParams.summer).toBe(true);
  });
});

describe('SCH-13/14 generator: one unadopted validated draft or honest bounded failure', () => {
  it('SCH-13 one multi-term draft, unadopted, judged by the same validator', () => {
    const s = scenario(chainCatalog(), { terms: terms4, capacity: 9 });
    const d = draftOf(s);
    expect(d.placements.every(p => p.origin === 'system_projection' && !p.active)).toBe(true);
    expect(new Set(d.placements.map(p => p.termId.sortIndex)).size).toBeGreaterThan(1);
    expect(d.validation.some(f => f.severity === 'error')).toBe(false);
    const a = computeAudit({ catalog: s.catalog, attempts: [], placements: d.placements, targetSort: s.plan.targetTerm.sortIndex });
    expect(a.rootStatus).toEqual({ status: 'satisfied', conditional: true });
    expect(d.search).toMatchObject({ policyVersion: 'search-v1', stopReason: 'qualifying_candidate' });
    expect(d.assumptions).toEqual(expect.arrayContaining(['capacity:scenario_assumption']));
  });
  it('SCH-14 exhausted bounds or an impossible horizon return no_valid_draft, never impossible', () => {
    const tight = scenario(chainCatalog(), { terms: horizon(3) }); // 4-term chain cannot fit in 3 terms
    expect(ok(generateDraft(tight))).toMatchObject({ kind: 'no_valid_draft_under_search_bounds' });
    const r = ok(evaluate(tight));
    expect(r.outlook.kind).toBe('target_at_risk');
    const budget = scenario(chainCatalog(), { terms: terms4, searchOptions: { ...SEARCH_POLICY, maxExpansions: 1 } });
    expect(ok(generateDraft(budget))).toMatchObject({ kind: 'no_valid_draft_under_search_bounds', expansions: 1 });
  });
  it('SCH-14 unsupported policy stays an explicit assumption in the draft', () => {
    // Only the unresolved-rule course can satisfy the elective once TEST-311 is reported not listed everywhere.
    const s = scenario(chainCatalog({ electiveRule: true }), { terms: terms4, availability: terms4.map(t => report('TEST-311', t, 'not_listed')) });
    const d = draftOf(s);
    expect(d.placements.some(p => p.courseId === 'TEST-310')).toBe(true);
    expect(d.assumptions).toContain('prerequisite_unresolved:TEST-310');
    expect(d.validation.some(f => f.code === 'prerequisite_unresolved' && f.courseIds[0] === 'TEST-310')).toBe(true);
  });
});

describe('SCH-15/17/18/19 fingerprints, determinism, chunking, cancellation', () => {
  const base = () => scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-101', terms4[0]!)], availability: [report('TEST-101', terms4[0]!, 'listed')] });
  it('SCH-17 identical input -> identical draft, ranking, findings, expansions and stop reason (chunked too)', () => {
    const s = base();
    const one = ok(generateDraft(s)), two = ok(generateDraft(structuredClone(s)));
    expect(canonicalJson(one)).toBe(canonicalJson(two));
    const gen = ok(startDraftGeneration(s));
    let res; let guard = 0;
    for (;;) { const step = gen.step(1); if (step.done) { res = step.result; break; } if (++guard > 5000) throw new Error('no progress'); }
    expect(canonicalJson(ok(res))).toBe(canonicalJson(one));
    expect(canonicalJson(ok(evaluate(s)))).toBe(canonicalJson(ok(evaluate(structuredClone(s)))));
  });
  it('SCH-18 external cancellation is search_interrupted with the plan untouched', () => {
    const s = base(); const snapshot = canonicalJson(s);
    const gen = ok(startDraftGeneration(s));
    gen.step(1);
    expect(gen.cancel()).toEqual({ ok: false, code: 'search_interrupted', reasonCode: 'search_interrupted_not_evaluated' });
    expect(gen.step(10)).toEqual({ done: true, result: { ok: false, code: 'search_interrupted', reasonCode: 'search_interrupted_not_evaluated' } });
    expect(canonicalJson(s)).toBe(snapshot);
  });
  it('SCH-15/19 every fingerprint constituent changed independently makes a preview stale', () => {
    const s = base();
    const p = ok(preview(s, changes(s, [{ kind: 'add', placement: place('TEST-201', terms4[1]!) }])));
    const mutations: Array<[string, (x: PlanningScenario) => void]> = [
      ['catalog content', x => { x.catalog.courses['TEST-311']!.title = 'changed'; }],
      ['catalog version', x => { x.catalog.catalogRef.catalogVersion = 'synthetic-engine-v2'; x.plan.catalogRef.catalogVersion = 'synthetic-engine-v2'; }],
      ['record revision', x => { x.record.recordRevision = 1; }],
      ['record content, same revision', x => { x.record.courseAttempts.push(attempt('TEST-102', { attemptId: 'new' })); }],
      ['plan revision', x => { x.plan.planRevision = 1; }],
      ['placement content, same revision', x => { x.plan.activePlacements[0]!.placementId = 'renamed'; }],
      ['target term', x => { x.plan.targetTerm = terms4[2]!; }],
      ['availability revision', x => { x.plan.availabilityRevision = 1; }],
      ['availability content, same revision', x => { x.plan.availabilityEvidence[0]!.report = 'unknown'; }],
      ['capacity assumption', x => { x.assumptions.creditCapacity[0]!.maximum = 12; }],
      ['evaluation policy', x => { x.assumptions.evaluationPolicy = 'other'; }],
      ['evaluatedAt snapshot', x => { x.assumptions.evaluatedAt = '2026-02-01T00:00:00Z'; }],
      ['search options', x => { x.searchOptions = { ...x.searchOptions, beamWidth: 16 }; }],
      ['engine version', x => { x.engineVersion = 'pathcheck-engine-v0'; }],
    ];
    for (const [label, mutate] of mutations) {
      const changed = structuredClone(s); mutate(changed);
      const v = validateCandidate(changed, p);
      expect(v.ok, label).toBe(false);
      if (label !== 'engine version') expect(v, label).toMatchObject({ code: 'stale_preview' });
    }
    expect(validateCandidate(s, p).ok).toBe(true);
  });
  it('fixed search budgets are bounded by the frozen contract', () => {
    expect(SearchOptionsSchema.safeParse({ ...SEARCH_POLICY, maxExpansions: 1501 }).success).toBe(false);
    expect(SearchOptionsSchema.safeParse({ ...SEARCH_POLICY, beamWidth: 33 }).success).toBe(false);
    const wide = scenario(chainCatalog(), { terms: terms4, searchOptions: { ...SEARCH_POLICY, beamWidth: 32, maxExpansions: 1500, horizonTerms: 10 } });
    expect(draftOf(wide).search.expansions).toBeLessThanOrEqual(1500);
  });
});

describe('analysis contract conformance', () => {
  it('evaluate output passes the lead validator; bounds of 3 hold', () => {
    for (const s of [scenario(chainCatalog(), { terms: terms4 }), scenario(chainCatalog(), { terms: terms4, placements: [place('TEST-201', terms4[0]!), place('TEST-301', terms4[0]!), place('TEST-401', terms4[0]!)] })]) {
      const r = ok(evaluate(s));
      expect(validateAnalysisForScenario(s, r).ok).toBe(true);
      expect(r.topFindings.length).toBeLessThanOrEqual(3); expect(r.candidates.length).toBeLessThanOrEqual(3); expect(r.availabilityQuestions.length).toBeLessThanOrEqual(3);
    }
  });
  it('a clean, satisfiable synthetic scenario yields conditional_path_found (never a guarantee)', () => {
    expect(ok(evaluate(scenario(chainCatalog(), { terms: terms4 }))).outlook.kind).toBe('conditional_path_found');
  });
  it('target outside the modeled horizon is an explicit evidence gap, not a path claim', () => {
    const s = scenario(chainCatalog(), { terms: terms4, target: T(2030, 'fall') });
    const r = ok(evaluate(s));
    expect(r.outlook.kind).toBe('insufficient_evidence');
    expect(r.evidenceGaps.some(f => f.code === 'target_outside_horizon')).toBe(true);
  });
  it('rejects scenarios from another engine version or unreviewed catalogs with typed failures', () => {
    const s = scenario(chainCatalog(), { terms: terms4 });
    expect(evaluate({ ...s, engineVersion: 'other' })).toMatchObject({ ok: false, reasonCode: 'unsupported_engine_version' });
    expect(evaluate({ ...s, schemaVersion: 2 } as unknown as PlanningScenario)).toMatchObject({ ok: false, code: 'validation_error' });
  });
});

describe('retakes under unsourced repeat policy: planning unchanged, credit claims withheld', () => {
  const F = { status: 'failed' as const, earnedCredits: 0, grade: 'F', term: T(2025, 'fall') };
  it('a failed required course is still scheduled before its dependents; the draft does not claim the requirement', () => {
    const s = scenario(chainCatalog(), { terms: horizon(8), attempts: [attempt('TEST-101', F)] });
    const d = draftOf(s);
    const at = (c: string) => d.placements.find(p => p.courseId === c)?.termId.sortIndex ?? Infinity;
    expect(d.placements.filter(p => p.courseId === 'TEST-101')).toHaveLength(1);
    expect(at('TEST-101')).toBeLessThan(at('TEST-201'));
    const withDraft = computeAudit({ catalog: s.catalog, attempts: s.record.courseAttempts, placements: d.placements, targetSort: s.plan.targetTerm.sortIndex });
    expect(withDraft.outcomes.get('r101')).toMatchObject({ status: 'unresolved', conditional: false });
    expect(withDraft.units.get('unit:TEST-101')!.reasons).toContain('repeat_policy_unresolved');
  });
  it('a planned retake is taken for scheduling: no second retake demand, dependents keep their earliest term', () => {
    const t = horizon(8);
    const s = scenario(chainCatalog(), { terms: t, attempts: [attempt('TEST-101', F)], placements: [place('TEST-101', t[0]!)] });
    const info = dependencyInfo(s, computeAudit({ catalog: s.catalog, attempts: s.record.courseAttempts, placements: s.plan.activePlacements, targetSort: s.plan.targetTerm.sortIndex }), s.plan.activePlacements);
    expect(info.demands.some(d => d.options.includes('TEST-101'))).toBe(false);
    expect(info.pressure.get('TEST-201')?.earliest).toBe(1);
    const search = createSearch({ scenario: s, fixed: s.plan.activePlacements, placementPrefix: 'syn', origin: 'system_projection', active: false });
    let step = search.step(5000); while (!step.done) step = search.step(5000);
    expect(step.outcome.kind).toBe('found');
    // `placements` are only the search's additions: no second retake on top of the planned one.
    if (step.outcome.kind === 'found') expect(step.outcome.placements.filter(p => p.courseId === 'TEST-101')).toEqual([]);
  });
  it('a planned duplicate of a passed course still warns course_already_completed', () => {
    const s = scenario(chainCatalog(), { terms: terms4, attempts: [attempt('TEST-101')], placements: [place('TEST-101', terms4[0]!)] });
    const a = computeAudit({ catalog: s.catalog, attempts: s.record.courseAttempts, placements: s.plan.activePlacements, targetSort: s.plan.targetTerm.sortIndex });
    expect(validatePlacements(s, s.plan.activePlacements, a).map(f => f.code)).toContain('course_already_completed');
    expect(a.outcomes.get('r101')).toMatchObject({ status: 'unresolved' });
  });
});
