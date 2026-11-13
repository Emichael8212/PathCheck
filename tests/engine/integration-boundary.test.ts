// E-side regressions for E/L/U boundary defects found by running L's actual plannerCommands and
// U's actual synthetic catalog/row helpers against this engine (local scratch, not committed).
// ENTIRELY SYNTHETIC catalogs; no ASU rules, no student data.
import { describe, expect, it } from 'vitest';
import { canonicalJson, fingerprint } from '../../src/contracts';
import type { ChangeSet, GeneratedDraft, PlanPlacement, PlanningScenario, ProposedRow } from '../../src/contracts';
import { academicService, createAcademicService, createCatalogRegistry, evaluate, generateDraft, normalizeAttempts, preview } from '../../src/engine';
import { T, all, attempt, catalog, course, horizon, place, pre, reqAll, reqCourse, scenario } from '../fixtures/engine/synthetic';

const ok = <V>(r: { ok: true; value: V } | { ok: false; reasonCode: string }): V => { if (!r.ok) throw new Error(r.reasonCode); return r.value; };
const terms4 = horizon(4);
// 101 -> 201; 301 requires 201 AND 202 (prior term); 102 independent.
const cat = () => catalog([
  course('SYN-101'), course('SYN-102'), course('SYN-201', 3, pre('SYN-101')), course('SYN-202', 3, pre('SYN-101')),
  course('SYN-301', 3, all(pre('SYN-201'), pre('SYN-202'))),
], [reqAll('degree', ['r101', 'r102', 'r201', 'r202', 'r301']), reqCourse('r101', 'SYN-101'), reqCourse('r102', 'SYN-102'), reqCourse('r201', 'SYN-201'), reqCourse('r202', 'SYN-202'), reqCourse('r301', 'SYN-301')], { root: 'degree' });

/** Independent structural reference of contract ChangeSet semantics (order-preserving). */
function structural(base: readonly PlanPlacement[], ops: ChangeSet['operations']): PlanPlacement[] {
  const ps = structuredClone([...base]);
  for (const op of ops) {
    if (op.kind === 'add') ps.push(structuredClone(op.placement));
    else if (op.kind === 'remove') ps.splice(ps.findIndex(p => p.placementId === op.placementId), 1);
    else if (op.kind === 'move') ps.find(p => p.placementId === op.placementId)!.termId = structuredClone(op.termId);
    else { const a = ps.find(p => p.placementId === op.firstPlacementId)!, b = ps.find(p => p.placementId === op.secondPlacementId)!; [a.termId, b.termId] = [b.termId, a.termId]; }
  }
  return ps;
}

describe('preview placement order matches the structural change set (L apply check)', () => {
  // Student added 301 first, then 201, then 202 => unsorted active array; 301 conflicts (201 same term).
  const s = scenario(cat(), { terms: terms4, attempts: [attempt('SYN-101', { term: T(2025, 'fall') })], placements: [
    place('SYN-301', terms4[1]!, 'pl-301'), place('SYN-201', terms4[1]!, 'pl-201'), place('SYN-202', terms4[0]!, 'pl-202'),
  ] });
  it('every generated candidate proposes exactly base order + in-place edits + appended adds', () => {
    const r = ok(evaluate(s));
    expect(r.topFindings[0]!.code).toBe('prerequisite_unsatisfied');
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) expect(canonicalJson(c.proposedPlacements)).toBe(canonicalJson(structural(s.plan.activePlacements, c.changeSet.operations)));
  });
  it('an add that sorts before existing placements is appended, not re-sorted', () => {
    const add: PlanPlacement = { placementId: 'pl-102', courseId: 'SYN-102', termId: terms4[0]!, origin: 'student_selected', active: true };
    const p = ok(preview(s, { baseFingerprint: fingerprint(s), operations: [{ kind: 'add', placement: add }] }));
    expect(p.proposedPlacements.map(x => x.placementId)).toEqual(['pl-301', 'pl-201', 'pl-202', 'pl-102']);
  });
});

describe('normalization accepts the contract status tokens U submits', () => {
  const row = (rowId: string, rawStatus: string): ProposedRow => ({ rowId, rawCourseCode: 'SYN 102', rawTitle: null, rawTerm: 'Fall 2025', rawAttemptedCredits: '3', rawEarnedCredits: null, rawGrade: null, rawStatus, rawInstitution: null, provisionalCourseId: null, provenance: [], uncertainty: [] });
  it('in_progress is in progress (provisional), explicit unknown stays unknown, gibberish is flagged', () => {
    const out = ok(normalizeAttempts({ kind: 'manual_rows', rows: [row('a', 'in_progress'), row('b', 'unknown'), row('c', 'maybe-later')] }, cat()));
    const [a, b, c] = out.record.courseAttempts;
    expect([a!.status, a!.confidence]).toEqual(['in_progress', 'provisional']);
    expect([b!.status, b!.confidence]).toEqual(['unknown', 'unresolved']);
    expect([c!.status, c!.confidence]).toEqual(['unknown', 'unresolved']);
    expect(out.warnings).toEqual(expect.arrayContaining(['status_reported_unknown:b', 'unrecognized_status:c']));
    expect(out.warnings).not.toContain('unrecognized_status:a');
  });
});

describe('availability questions only cite findings present in the analysis', () => {
  // Four-course required chain with zero slack: more overlooked findings than the top three.
  const chain = catalog([course('SYN-101'), course('SYN-201', 3, pre('SYN-101')), course('SYN-301', 3, pre('SYN-201')), course('SYN-401', 3, pre('SYN-301')), course('SYN-102'), course('SYN-103')],
    [reqAll('degree', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']), reqCourse('r1', 'SYN-101'), reqCourse('r2', 'SYN-201'), reqCourse('r3', 'SYN-301'), reqCourse('r4', 'SYN-401'), reqCourse('r5', 'SYN-102'), reqCourse('r6', 'SYN-103')], { root: 'degree' });
  const cases: Array<[string, PlanningScenario]> = [
    ['empty plan, tight chain', scenario(chain, { terms: terms4 })],
    ['partial plan', scenario(chain, { terms: terms4, placements: [place('SYN-102', terms4[0]!), place('SYN-401', terms4[3]!)] })],
    ['conflicting plan', scenario(cat(), { terms: terms4, placements: [place('SYN-301', terms4[0]!)] })],
  ];
  it.each(cases)('%s', (_, s) => {
    const r = ok(evaluate(s));
    const present = new Set([...r.topFindings, ...r.evidenceGaps, ...r.bottlenecks].map(f => f.findingId));
    for (const q of r.availabilityQuestions) for (const id of q.findingIds) expect(present.has(id)).toBe(true);
  });
});

describe('assumeFuturePass=false never yields a conditional path claim', () => {
  const planned = (assumeFuturePass: boolean) => {
    const s = scenario(cat(), { terms: terms4, attempts: [attempt('SYN-101', { term: T(2025, 'fall') })], placements: [
      place('SYN-102', terms4[0]!), place('SYN-201', terms4[0]!), place('SYN-202', terms4[0]!), place('SYN-301', terms4[1]!),
    ] });
    return { ...s, assumptions: { ...s.assumptions, assumeFuturePass } };
  };
  it('true: conditional path found; false: insufficient evidence with a disclosed gap', () => {
    expect(ok(evaluate(planned(true))).outlook.kind).toBe('conditional_path_found');
    const r = ok(evaluate(planned(false)));
    expect(r.outlook.kind).toBe('insufficient_evidence');
    expect(r.evidenceGaps.some(g => g.code === 'future_pass_not_assumed')).toBe(true);
    expect(r.outlook.evidenceRefs).toContain(r.evidenceGaps.find(g => g.code === 'future_pass_not_assumed')!.findingId);
    expect(r.degreeAudit.totalStatus).not.toBe('satisfied');
  });
});

describe('draft assumptions cover the adoption preview assumptions (L adopt acknowledgement)', () => {
  it('acknowledging draft.assumptions acknowledges every label the adoption preview reports', () => {
    const s = scenario(cat(), { terms: terms4, attempts: [attempt('SYN-101', { term: T(2025, 'fall') })], placements: [place('SYN-102', terms4[2]!, 'pl-old')] });
    const d = ok(generateDraft(s)) as GeneratedDraft;
    expect('kind' in d).toBe(false);
    const ops: ChangeSet['operations'] = [
      ...s.plan.activePlacements.map(p => ({ kind: 'remove' as const, placementId: p.placementId })),
      ...d.placements.map(p => ({ kind: 'add' as const, placement: { ...p, active: true, origin: 'adopted_suggestion' as const } })),
    ];
    const p = ok(preview(s, { baseFingerprint: d.baseFingerprint, operations: ops }));
    expect(p.assumptions.length).toBeGreaterThan(0);
    for (const a of p.assumptions) expect(d.assumptions).toContain(a);
  });
});

describe('createAcademicService with an injected synthetic catalog registry', () => {
  it('lists and loads only the injected catalog with the same lookup rules; default service unchanged', () => {
    const c = cat();
    const svc = createAcademicService(createCatalogRegistry([c]));
    expect(ok(svc.listCatalogs()).map(r => r.catalogVersion)).toEqual([c.catalogRef.catalogVersion]);
    expect(canonicalJson(ok(svc.loadValidatedCatalog(c.catalogRef)))).toBe(canonicalJson(c));
    expect(svc.loadValidatedCatalog({ ...c.catalogRef, catalogYearId: 'other' })).toMatchObject({ ok: false, code: 'unavailable', reasonCode: 'unsupported_catalog_year' });
    expect(ok(academicService.listCatalogs()).some(r => r.catalogVersion === c.catalogRef.catalogVersion)).toBe(false);
    const s = scenario(c, { terms: terms4 });
    expect(canonicalJson(ok(svc.evaluate(s)))).toBe(canonicalJson(ok(academicService.evaluate(s))));
    expect(() => createCatalogRegistry([c, c])).toThrow();
  });
});
