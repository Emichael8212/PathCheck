// T-ENG 1-28 deterministic rule-evaluation fixtures. ENTIRELY SYNTHETIC rules and records.
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../../src/contracts';
import { evaluatePrerequisite, evaluate } from '../../src/engine';
import { computeAudit } from '../../src/engine/audit';
import { impossibleCycles } from '../../src/engine/prerequisites';
import type { CatalogModel, CourseAttempt, PlanPlacement, PrerequisiteExpr } from '../../src/contracts';
import { SYN, SYN_GRADES, T, all, any, attempt, catalog, chooseCourses, coreq, course, minCredits, place, pre, reqAll, reqCourse, scenario, totalCredits, unresolvedRule } from '../fixtures/engine/synthetic';

const baseCat = (o: Parameters<typeof catalog>[2] = {}) => catalog(['TEST-101', 'TEST-102', 'TEST-103', 'TEST-201'].map(c => course(c)), [reqCourse('req', 'TEST-101')], o);
const auditOf = (cat: CatalogModel, attempts: CourseAttempt[], placements: PlanPlacement[] = []) => computeAudit({ catalog: cat, attempts, placements, targetSort: 99999 });
const req = (cat: CatalogModel, attempts: CourseAttempt[], id = 'req') => auditOf(cat, attempts).audit.requirements.find(r => r.requirementId === id)!;
const FALL25 = T(2025, 'fall').sortIndex;
const prereq = (expr: PrerequisiteExpr, attempts: CourseAttempt[], o: { cat?: CatalogModel; placements?: Pick<PlanPlacement, 'courseId' | 'termId'>[]; at?: number; grades?: boolean } = {}) => {
  const cat = o.cat ?? baseCat(o.grades === false ? {} : { gradeScale: SYN_GRADES });
  return evaluatePrerequisite(expr, o.at ?? FALL25, { catalog: cat, attempts, placements: o.placements ?? [], gradeIndex: cat.gradeScale ? new Map(cat.gradeScale.ordered.map((g, i) => [g, i])) : null });
};

describe('T-ENG degree requirement cases', () => {
  it('1 required course completed with earned credit satisfies', () => expect(req(baseCat(), [attempt('TEST-101')]).status).toBe('satisfied'));
  it('2 required course not attempted is unmet', () => expect(req(baseCat(), []).status).toBe('unmet'));
  it('3 in-progress is not earned credit (conditional only)', () => {
    const r = auditOf(baseCat(), [attempt('TEST-101', { status: 'in_progress', earnedCredits: null, grade: null })]);
    expect(r.audit.requirements[0]).toMatchObject({ status: 'satisfied', conditional: true });
    expect(r.audit.totalStatus).toBe('unmet'); expect(r.audit.applicableCredits).toBe(0); expect(r.audit.earnedCredits).toBe(0);
  });
  it('4 failed attempt does not satisfy', () => expect(req(baseCat(), [attempt('TEST-101', { status: 'failed', earnedCredits: 0, grade: 'F' })]).status).toBe('unmet'));
  it('5 repeat passed after fail: BLOCKED for a sourced policy (contract gap) -> fail closed unresolved', () => {
    // contracts-v1 cannot carry a sourced repeat rule; even with no policy gap the engine must not invent one.
    const r = auditOf(baseCat(), [attempt('TEST-101', { status: 'failed', earnedCredits: 0, grade: 'F', term: T(2024, 'spring') }), attempt('TEST-101', { term: T(2024, 'fall') })]);
    expect(r.audit.requirements[0]!.status).toBe('unresolved');
    expect(r.audit.totalStatus).toBe('unresolved');
  });
  it('6 repeat policy unknown -> unresolved; raw earned credit not double counted', () => {
    const cat = baseCat({ policyGaps: [{ policyId: 'repeat-credit-policy', description: 'synthetic unknown repeat policy', sourceRefs: [SYN], blocksConclusions: true }] });
    const r = auditOf(cat, [attempt('TEST-101', { term: T(2024, 'spring') }), attempt('TEST-101', { term: T(2024, 'fall') })]);
    expect(r.audit.requirements[0]!.status).toBe('unresolved'); expect(r.audit.earnedCredits).toBeNull();
  });
  it('6b pass plus in-progress retake (no sourced repeat policy) is unresolved, never definite', () => {
    const ip = { status: 'in_progress' as const, earnedCredits: null, grade: null, term: T(2025, 'spring') };
    const r = auditOf(baseCat(), [attempt('TEST-101', { term: T(2024, 'fall') }), attempt('TEST-101', ip)]);
    expect(r.audit.requirements[0]!.status).toBe('unresolved'); expect(r.audit.totalStatus).toBe('unresolved');
    expect(r.units.get('unit:TEST-101')!.reasons).toContain('repeat_policy_unresolved');
    const gaps = evaluate(scenario(baseCat(), { attempts: [attempt('TEST-101', { term: T(2024, 'fall') }), attempt('TEST-101', ip)] }));
    if (!gaps.ok) throw new Error(gaps.reasonCode);
    expect(gaps.value.evidenceGaps.map(f => f.code)).toContain('repeat_policy_unresolved');
    // Two in-progress rows of one course are not silently collapsed into one conditional pass.
    expect(auditOf(baseCat(), [attempt('TEST-101', ip), attempt('TEST-101', ip)]).audit.requirements[0]!.status).toBe('unresolved');
    // Unchanged controls: a single in-progress retake after a definite failure stays conditional,
    // and a lone pass stays definite.
    const f = auditOf(baseCat(), [attempt('TEST-101', { status: 'failed', earnedCredits: 0, grade: 'F' }), attempt('TEST-101', ip)]);
    expect(f.audit.requirements[0]).toMatchObject({ status: 'satisfied', conditional: true });
    expect(auditOf(baseCat(), [attempt('TEST-101')]).audit.requirements[0]).toMatchObject({ status: 'satisfied', conditional: false });
  });
  it('7 unverified transfer course is unresolved (degree and prerequisite)', () => {
    const t = attempt(null, { rawCourseCode: 'TEST 101', origin: 'transfer', status: 'transfer_pending', institution: 'Synthetic CC' });
    expect(req(baseCat(), [t]).status).toBe('unresolved');
    expect(prereq(pre('TEST-101'), [t]).status).toBe('unresolved');
  });
  it('8 verified equivalency satisfies the appropriate requirement only', () => {
    const cat = catalog([course('TEST-101'), course('TEST-150'), course('TEST-102')], [reqAll('root', ['req', 'other']), reqCourse('req', 'TEST-101'), reqCourse('other', 'TEST-102')],
      { root: 'root', equivalencies: [{ fromCourseId: 'TEST-150', toCourseId: 'TEST-101', status: 'verified', sourceRefs: [SYN] }] });
    const a = auditOf(cat, [attempt('TEST-150')]);
    expect(a.audit.requirements.find(r => r.requirementId === 'req')!.status).toBe('satisfied');
    expect(a.audit.requirements.find(r => r.requirementId === 'other')!.status).toBe('unmet');
    const unresolvedEq = catalog([course('TEST-101'), course('TEST-150')], [reqCourse('req', 'TEST-101')], { equivalencies: [{ fromCourseId: 'TEST-150', toCourseId: 'TEST-101', status: 'unresolved', sourceRefs: [SYN] }] });
    expect(req(unresolvedEq, [attempt('TEST-150')]).status).toBe('unresolved');
  });
});

describe('T-ENG prerequisite expression cases', () => {
  const done = (c: string, o: Partial<CourseAttempt> = {}) => attempt(c, { term: T(2024, 'fall'), ...o });
  it('9 AND with all prerequisites satisfied', () => expect(prereq(all(pre('TEST-101'), pre('TEST-102')), [done('TEST-101'), done('TEST-102')]).status).toBe('satisfied'));
  it('10 AND with one missing prerequisite', () => {
    const r = prereq(all(pre('TEST-101'), pre('TEST-102')), [done('TEST-101')]);
    expect(r.status).toBe('unsatisfied'); expect(r.missing).toEqual(['TEST-102']);
  });
  it('11 OR with one valid branch is satisfied (not two unmet prerequisites)', () => {
    const r = prereq(any(pre('TEST-101'), pre('TEST-102')), [done('TEST-101')]);
    expect(r.status).toBe('satisfied'); expect(r.missing).toEqual([]);
  });
  it('12 OR with both branches invalid', () => expect(prereq(any(pre('TEST-101'), pre('TEST-102')), []).status).toBe('unsatisfied'));
  it('13 OR with one branch unresolved and no satisfied branch -> unresolved', () => expect(prereq(any(pre('TEST-101'), unresolvedRule()), []).status).toBe('unresolved'));
  it('14 nested AND(OR(...), ...)', () => {
    const e = all(any(pre('TEST-101'), pre('TEST-102')), pre('TEST-103'));
    expect(prereq(e, [done('TEST-102'), done('TEST-103')]).status).toBe('satisfied');
    expect(prereq(e, [done('TEST-102')]).status).toBe('unsatisfied');
  });
  it('15 minimum grade met', () => expect(prereq(pre('TEST-101', 'C'), [done('TEST-101', { grade: 'B' })]).status).toBe('satisfied'));
  it('16 minimum grade not met', () => expect(prereq(pre('TEST-101', 'C'), [done('TEST-101', { grade: 'D' })]).status).toBe('unsatisfied'));
  it('17 minimum grade unknown (missing grade, unknown letter, or no sourced scale) -> unresolved', () => {
    expect(prereq(pre('TEST-101', 'C'), [done('TEST-101', { grade: null })]).status).toBe('unresolved');
    expect(prereq(pre('TEST-101', 'C'), [done('TEST-101', { grade: 'Q' })]).status).toBe('unresolved');
    expect(prereq(pre('TEST-101', 'C'), [done('TEST-101', { grade: 'A' })], { grades: false }).status).toBe('unresolved');
  });
  it('18 prior-term prerequisite placed in the same term -> conflict', () => {
    const r = prereq(pre('TEST-101'), [], { placements: [place('TEST-101', T(2025, 'fall'))] });
    expect(r.status).toBe('unsatisfied'); expect(r.reasons).toContain('prerequisite_same_term');
  });
  it('19 earlier future placement -> conditional eligibility depending on future pass', () => {
    const r = prereq(pre('TEST-101'), [], { placements: [place('TEST-101', T(2025, 'spring'))] });
    expect(r).toMatchObject({ status: 'satisfied', conditional: true }); expect(r.assumptions).toContain('future_pass:TEST-101');
    // In-progress earlier attempt: conditional for a later term, never a completed fact.
    expect(prereq(pre('TEST-101'), [done('TEST-101', { status: 'in_progress', earnedCredits: null, grade: null })])).toMatchObject({ status: 'satisfied', conditional: true });
  });
  it('20 valid same-term corequisite when concurrency is authorized', () => {
    expect(prereq(coreq('TEST-101', true, false), [], { placements: [place('TEST-101', T(2025, 'fall'))] })).toMatchObject({ status: 'satisfied', conditional: true });
    expect(prereq(coreq('TEST-101', false, true), [], { placements: [place('TEST-101', T(2025, 'fall'))] }).status).toBe('unsatisfied');
  });
  it('21 unverified same-term corequisite (unresolved permission) -> unresolved', () => {
    expect(prereq(all(coreq('TEST-101'), unresolvedRule('synthetic concurrency permission')), [], { placements: [place('TEST-101', T(2025, 'fall'))] }).status).toBe('unresolved');
    const eqCat = catalog([course('TEST-101'), course('TEST-150')], [reqCourse('req', 'TEST-101')], { equivalencies: [{ fromCourseId: 'TEST-150', toCourseId: 'TEST-101', status: 'unresolved', sourceRefs: [SYN] }] });
    expect(prereq(coreq('TEST-101'), [], { cat: eqCat, placements: [place('TEST-150', T(2025, 'fall'))] }).status).toBe('unresolved');
  });
  it('22 legitimate corequisite pair is not an impossible cycle', () => {
    const cat = catalog([course('TEST-101', 3, coreq('TEST-102')), course('TEST-102', 1, coreq('TEST-101'))], [reqCourse('req', 'TEST-101')]);
    expect(impossibleCycles(cat)).toEqual([]);
  });
  it('23 true prior-term cycle is flagged', () => {
    const cat = catalog([course('TEST-101', 3, pre('TEST-102')), course('TEST-102', 3, pre('TEST-101'))], [reqCourse('req', 'TEST-101')]);
    expect(impossibleCycles(cat)).toEqual([['TEST-101', 'TEST-102']]);
    // OR alternatives are not mandatory edges, so an escapable OR loop is not a cycle.
    const orCat = catalog([course('TEST-101', 3, any(pre('TEST-102'), pre('TEST-103'))), course('TEST-102', 3, pre('TEST-101')), course('TEST-103')], [reqCourse('req', 'TEST-101')]);
    expect(impossibleCycles(orCat)).toEqual([]);
  });
});

describe('T-ENG allocation and credit cases', () => {
  it('24 restricted credit double count prevented', () => {
    const cat = catalog([course('TEST-301'), course('TEST-302')], [reqAll('root', ['major', 'elective']), reqCourse('major', 'TEST-301'), chooseCourses('elective', 1, ['TEST-301', 'TEST-302'])], { root: 'root' });
    expect(auditOf(cat, [attempt('TEST-301')]).audit.totalStatus).toBe('unmet');
  });
  it('25 choose-N satisfied by appropriate alternatives; missing alternatives are not all mandatory', () => {
    const cat = catalog(['TEST-101', 'TEST-102', 'TEST-103', 'TEST-104'].map(c => course(c)), [chooseCourses('pick', 2, ['TEST-101', 'TEST-102', 'TEST-103', 'TEST-104'])]);
    expect(auditOf(cat, [attempt('TEST-102'), attempt('TEST-104')]).audit.totalStatus).toBe('satisfied');
    const s = scenario(cat, { attempts: [attempt('TEST-102')] });
    const r = evaluate(s); if (!r.ok) throw new Error(r.reasonCode);
    const choice = r.value.topFindings.find(f => f.code === 'unselected_choice_requirement')!;
    expect(choice.explanationParams).toMatchObject({ needCourses: 1, anyOneSuffices: true });
    expect(r.value.topFindings.some(f => f.code === 'unselected_required_course')).toBe(false);
  });
  it('26 credit threshold counts earned, not attempted-but-unearned, credits', () => {
    const cat = catalog([course('TEST-101'), course('TEST-102')], [reqAll('root', ['pool', 'total']), minCredits('pool', 6, ['TEST-101', 'TEST-102']), totalCredits('total', 6)], { root: 'root' });
    const r = auditOf(cat, [attempt('TEST-101'), attempt('TEST-102', { status: 'failed', earnedCredits: 0, attemptedCredits: 3, grade: 'F' })]);
    expect(r.audit.totalStatus).toBe('unmet'); expect(r.audit.applicableCredits).toBe(3);
  });
  it('27 catalog discrepancy prevents certainty', () => {
    const disputed = catalog([course('TEST-101')], [reqCourse('req', 'TEST-101', { uncertainty: 'disputed' })]);
    const r = auditOf(disputed, [attempt('TEST-101')]);
    expect(r.audit.totalStatus).toBe('unresolved'); expect(r.audit.disputedRules).toContain('req');
    const gap = baseCat({ policyGaps: [{ policyId: 'credit-total-conflict', description: 'synthetic conflicting totals', sourceRefs: [SYN], blocksConclusions: true }] });
    expect(auditOf(gap, [attempt('TEST-101')]).audit.totalStatus).toBe('unresolved');
  });
  it('28 snapshot invalidation after catalog or record change', () => {
    const s = scenario(baseCat(), { attempts: [attempt('TEST-101', { attemptId: 'fixed' })] });
    const fp = fingerprint(s);
    const recordChanged = structuredClone(s); recordChanged.record.courseAttempts[0]!.grade = 'C';
    const catalogChanged = structuredClone(s); catalogChanged.catalog.courses['TEST-101']!.credits = 4;
    expect(fingerprint(recordChanged)).not.toBe(fp); expect(fingerprint(catalogChanged)).not.toBe(fp);
    const r = evaluate(s); if (!r.ok) throw new Error();
    expect(r.value.inputFingerprint).toBe(fp);
  });
});
