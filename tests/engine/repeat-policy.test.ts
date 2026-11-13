// T-ENG-5/6 consumer of the scoped, evidence-backed `repeatCreditPolicy` contract.
// ENTIRELY SYNTHETIC rules, grades and records: no ASU repeat policy is asserted or implied.
import { describe, expect, it } from 'vitest';
import { canonicalJson, fingerprint, validateAnalysisForScenario } from '../../src/contracts';
import type { CatalogModel, CourseAttempt, PlanPlacement, PlanningScenario } from '../../src/contracts';
import { evaluate, evaluatePrerequisite, generateDraft } from '../../src/engine';
import { computeAudit } from '../../src/engine/audit';
import { validatePlacements } from '../../src/engine/planCheck';
import { SYN, SYN_GRADES, T, attempt, catalog, course, horizon, place, pre, reqAll, reqCourse, scenario, synRepeatPolicy, totalCredits } from '../fixtures/engine/synthetic';

type Opts = Parameters<typeof catalog>[2];
const cat101 = (o: Opts = {}) => catalog(['TEST-101', 'TEST-102', 'TEST-150'].map(c => course(c)), [reqCourse('req', 'TEST-101')], { gradeScale: SYN_GRADES, ...o });
const scoped = (o: Opts = {}) => cat101({ repeatCreditPolicy: synRepeatPolicy(['TEST-101']), ...o });
const auditOf = (cat: CatalogModel, attempts: CourseAttempt[], placements: PlanPlacement[] = []) => computeAudit({ catalog: cat, attempts, placements, targetSort: 99999 });
const req = (r: ReturnType<typeof auditOf>, id = 'req') => r.audit.requirements.find(x => x.requirementId === id)!;
const ok = <V>(r: { ok: true; value: V } | { ok: false; reasonCode: string }): V => { if (!r.ok) throw new Error(r.reasonCode); return r.value; };

const SP24 = T(2024, 'spring'), FA24 = T(2024, 'fall'), SP25 = T(2025, 'spring');
const F = (o: Partial<CourseAttempt> = {}) => attempt('TEST-101', { status: 'failed', earnedCredits: 0, grade: 'F', term: SP24, ...o });
const PASS = (grade = 'B', o: Partial<CourseAttempt> = {}) => attempt('TEST-101', { grade, term: FA24, ...o });
const IP = (o: Partial<CourseAttempt> = {}) => attempt('TEST-101', { status: 'in_progress', earnedCredits: null, grade: null, term: SP25, ...o });
const retake = place('TEST-101', T(2026, 'spring'));

describe('T-ENG-5 positive: repeat passed after fail under a sourced (synthetic) scoped policy', () => {
  it('counts the latest qualifying attempt once: definite satisfaction, applicable and earned credit 3', () => {
    const fail = F(), pass = PASS();
    const r = auditOf(scoped(), [fail, pass]);
    expect(req(r)).toMatchObject({ status: 'satisfied', conditional: false, attemptIds: [pass.attemptId], applicableCredits: 3 });
    expect(r.audit).toMatchObject({ totalStatus: 'satisfied', applicableCredits: 3, earnedCredits: 3 });
    expect(r.units.get('unit:TEST-101')!.reasons).toEqual(['repeat_policy_applied']);
    expect(r.units.get('unit:TEST-101')!.reasons).not.toContain('repeat_policy_unresolved');
  });
  it('a non-qualifying completion then a qualifying retake counts once (no double count)', () => {
    const d = PASS('D', { term: SP24 }), a = PASS('A');
    const r = auditOf(scoped(), [d, a]);
    expect(req(r)).toMatchObject({ status: 'satisfied', conditional: false, attemptIds: [a.attemptId], applicableCredits: 3 });
    expect(r.audit.earnedCredits).toBe(3);
  });
  it('selects the LATEST qualifying attempt; a later non-qualifying attempt does not displace it', () => {
    const b = PASS('B', { term: SP24, attemptId: 'early-b' }), c = PASS('C', { term: FA24, attemptId: 'later-c' }), d = PASS('D', { term: SP25 });
    expect(req(auditOf(scoped(), [b, c, d])).attemptIds).toEqual(['later-c']);
    expect(req(auditOf(scoped(), [b, d])).attemptIds).toEqual(['early-b']);
    // Input order never changes the selection.
    expect(req(auditOf(scoped(), [d, c, b])).attemptIds).toEqual(['later-c']);
  });
  it('grade comparison is case-insensitive', () => {
    expect(req(auditOf(scoped(), [F(), PASS('b')]))).toMatchObject({ status: 'satisfied', conditional: false });
  });
  it('repeated attempts stay distinct records: evaluate preserves both rows and reports no repeat gap', () => {
    const fail = F(), pass = PASS();
    const s = scenario(scoped(), { attempts: [fail, pass] });
    const r = ok(evaluate(s));
    expect(s.record.courseAttempts.map(a => a.attemptId)).toEqual([fail.attemptId, pass.attemptId]);
    expect(r.degreeAudit.requirements[0]).toMatchObject({ status: 'satisfied', conditional: false, attemptIds: [pass.attemptId] });
    expect(r.evidenceGaps.some(f => f.code === 'repeat_policy_unresolved')).toBe(false);
    expect(validateAnalysisForScenario(s, r).ok).toBe(true);
  });
  it('degree total credit counts a repeated course once: 6 credits satisfy 6, never 9', () => {
    const groups = [reqAll('root', ['r101', 'r102', 'total']), reqCourse('r101', 'TEST-101'), reqCourse('r102', 'TEST-102'), totalCredits('total', 6, { consumesCredits: false })];
    const records = [PASS('C', { term: SP24 }), PASS('B'), attempt('TEST-102')];
    const six = auditOf(catalog([course('TEST-101'), course('TEST-102')], groups, { root: 'root', gradeScale: SYN_GRADES, repeatCreditPolicy: synRepeatPolicy(['TEST-101']) }), records);
    expect(six.audit).toMatchObject({ totalStatus: 'satisfied', applicableCredits: 6, earnedCredits: 6 });
    const nineGroups = groups.map(g => g.requirementId === 'total' ? totalCredits('total', 9, { consumesCredits: false }) : g);
    const nine = auditOf(catalog([course('TEST-101'), course('TEST-102')], nineGroups, { root: 'root', gradeScale: SYN_GRADES, repeatCreditPolicy: synRepeatPolicy(['TEST-101']) }), records);
    expect(nine.outcomes.get('total')).toMatchObject({ status: 'unmet', need: { credits: 3, courses: 0 } });
    expect(nine.audit.earnedCredits).toBe(6);
  });
});

describe('scoped policy with pending retakes (projected repeats)', () => {
  it('failed then in-progress retake is conditional on a qualifying grade, not earned', () => {
    const ip = IP();
    const r = auditOf(scoped(), [F(), ip]);
    expect(req(r)).toMatchObject({ status: 'satisfied', conditional: true, attemptIds: [ip.attemptId], applicableCredits: 0 });
    expect(r.audit).toMatchObject({ totalStatus: 'unmet', earnedCredits: 0, applicableCredits: 0 });
    expect(r.units.get('unit:TEST-101')!.reasons).toEqual(expect.arrayContaining(['repeat_policy_applied', 'repeat_requires_qualifying_grade', 'in_progress_not_earned']));
  });
  it('failed then planned retake is conditional and carries the placement', () => {
    const r = auditOf(scoped(), [F()], [retake]);
    expect(req(r)).toMatchObject({ status: 'satisfied', conditional: true, placementIds: [retake.placementId] });
    expect(r.units.get('unit:TEST-101')).toMatchObject({ quality: 1, schedulingQuality: 1 });
  });
  it('a qualifying pass plus a planned retake stays definite (credit counted once either way) and still warns', () => {
    const s = scenario(scoped(), { attempts: [PASS()], placements: [place('TEST-101', horizon()[0]!)] });
    const a = computeAudit({ catalog: s.catalog, attempts: s.record.courseAttempts, placements: s.plan.activePlacements, targetSort: s.plan.targetTerm.sortIndex });
    expect(a.outcomes.get('req')).toMatchObject({ status: 'satisfied', conditional: false });
    expect(a.units.get('unit:TEST-101')!.reasons).toEqual(['repeat_pending_attempt', 'repeat_policy_applied']);
    expect(validatePlacements(s, s.plan.activePlacements, a).map(f => f.code)).toContain('course_already_completed');
  });
  it('with unknown catalog credit a pending retake could change the counted amount: unresolved', () => {
    const cat = catalog([course('TEST-101', 'unknown')], [reqCourse('req', 'TEST-101')], { gradeScale: SYN_GRADES, repeatCreditPolicy: synRepeatPolicy(['TEST-101']) });
    const r = auditOf(cat, [PASS()], [retake]);
    expect(req(r).status).toBe('unresolved');
    expect(r.units.get('unit:TEST-101')!.reasons).toEqual(expect.arrayContaining(['repeat_policy_unresolved', 'repeat_pending_credit_unresolved']));
  });
  it('a retake planned after the audit target is outside the projection (fail-only stays unmet)', () => {
    expect(computeAudit({ catalog: scoped(), attempts: [F()], placements: [retake], targetSort: T(2025, 'fall').sortIndex }).audit.requirements[0]).toMatchObject({ status: 'unmet' });
  });
  it('two definite failures and nothing pending remain unmet (no credit-bearing evidence)', () => {
    expect(req(auditOf(scoped(), [F(), F({ term: FA24 })]))).toMatchObject({ status: 'unmet' });
  });
});

describe('T-ENG-6 negatives: absent, null, out-of-scope and ambiguous evidence stay unresolved', () => {
  const unresolvedWith = (cat: CatalogModel, attempts: CourseAttempt[], reason?: string, placements: PlanPlacement[] = []) => {
    const r = auditOf(cat, attempts, placements);
    expect(req(r)).toMatchObject({ status: 'unresolved', conditional: false });
    expect(r.audit.totalStatus).toBe('unresolved');
    const reasons = r.units.get('unit:TEST-101')!.reasons;
    expect(reasons).toContain('repeat_policy_unresolved');
    expect(reasons).not.toContain('repeat_policy_applied');
    if (reason) expect(reasons).toContain(reason);
    return r;
  };
  it('omitted (legacy) and explicit null policy: unresolved, earned credit not double counted', () => {
    for (const cat of [cat101(), cat101({ repeatCreditPolicy: null })]) {
      expect(Object.hasOwn(cat, 'repeatCreditPolicy')).toBe(cat.repeatCreditPolicy === null);
      expect(unresolvedWith(cat, [PASS('B', { term: SP24 }), PASS('A')]).audit.earnedCredits).toBeNull();
    }
  });
  it('a course outside the explicit scope is never covered (no catalog-wide default)', () => {
    unresolvedWith(cat101({ repeatCreditPolicy: synRepeatPolicy(['TEST-102']) }), [F(), PASS()], 'repeat_policy_out_of_scope');
  });
  it('no qualifying attempt among credit-bearing repeats: the rule selects nothing', () => {
    expect(unresolvedWith(scoped(), [PASS('D', { term: SP24 }), PASS('D')], 'repeat_no_qualifying_attempt').audit.earnedCredits).toBeNull();
    unresolvedWith(scoped(), [PASS('D', { term: SP24 }), F({ term: FA24 })], 'repeat_no_qualifying_attempt');
  });
  it.each([
    ['unknown term cannot be ordered', [F({ term: null }), PASS()], 'repeat_attempt_order_unknown'],
    ['two attempts in one term are ambiguous (possible duplicate row)', [F({ term: FA24 }), PASS()], 'repeat_attempt_order_ambiguous'],
    ['unresolved-confidence attempt', [F(), PASS('B', { confidence: 'unresolved' })], 'repeat_attempt_unresolved'],
    ['unknown-status attempt', [attempt('TEST-101', { status: 'unknown', grade: null, earnedCredits: null, term: SP24 }), PASS()], 'repeat_attempt_unresolved'],
    ['incomplete attempt', [attempt('TEST-101', { status: 'incomplete', grade: 'I', earnedCredits: 0, term: SP24 }), PASS()], 'repeat_attempt_unresolved'],
    ['grade outside the sourced scale', [F(), PASS('P')], 'repeat_grade_unrecognized'],
    ['missing grade on a completion', [F(), PASS('B', { grade: null })], 'repeat_grade_unrecognized'],
    ['failed status with a qualifying grade', [F({ grade: 'A' }), PASS()], 'repeat_attempt_contradictory'],
    ['completed with zero earned credit on a 3-credit course', [F(), PASS('B', { earnedCredits: 0 })], 'repeat_attempt_credit_unresolved'],
  ] as const)('%s', (_, attempts, reason) => { unresolvedWith(scoped(), [...attempts], reason); });
  it('surfaces the gap with policy scope and in-scope source references for disclosure', () => {
    const gapOf = (cat: CatalogModel) => ok(evaluate(scenario(cat, { attempts: [F(), PASS('B', { term: null })] }))).evidenceGaps.find(f => f.code === 'repeat_policy_unresolved')!;
    expect(gapOf(scoped()).explanationParams).toMatchObject({ policyScope: 'in_scope', reasons: 'repeat_attempt_order_unknown' });
    expect(gapOf(scoped()).sourceRefs).toEqual([SYN]);
    expect(gapOf(cat101()).explanationParams.policyScope).toBe('none');
    expect(gapOf(cat101({ repeatCreditPolicy: synRepeatPolicy(['TEST-102']) })).explanationParams.policyScope).toBe('out_of_scope');
  });
});

describe('equivalency boundaries: the scope names catalog IDs only', () => {
  const eq = (status: 'verified' | 'unresolved') => [{ fromCourseId: 'OLD-101', toCourseId: 'TEST-101', status, sourceRefs: [SYN] }] as CatalogModel['equivalencies'];
  it('an attempt normalized through a historical code keeps the repeat unresolved', () => {
    const old = F({ rawCourseCode: 'OLD 101' });
    const r = auditOf(scoped({ equivalencies: eq('verified') }), [old, PASS()]);
    expect(req(r).status).toBe('unresolved');
    expect(r.units.get('unit:TEST-101')!.reasons).toContain('repeat_policy_equivalency_unresolved');
  });
  it('work on an equivalency-linked catalog course keeps the repeat unresolved; no activity is a control', () => {
    const link = [{ fromCourseId: 'TEST-150', toCourseId: 'TEST-101', status: 'verified', sourceRefs: [SYN] }] as CatalogModel['equivalencies'];
    const linked = auditOf(scoped({ equivalencies: link }), [F(), PASS(), attempt('TEST-150', { term: SP25 })]);
    expect(linked.units.get('unit:TEST-101')!.reasons).toContain('repeat_policy_equivalency_unresolved');
    // Raw earned credit sums distinct catalog courses; only one unit may apply to the requirement.
    expect(linked.audit.earnedCredits).toBe(6);
    expect(linked.audit.applicableCredits).toBe(3);
    expect(req(linked).attemptIds).toHaveLength(1);
    const control = auditOf(scoped({ equivalencies: link }), [F(), PASS()]);
    expect(req(control)).toMatchObject({ status: 'satisfied', conditional: false });
  });
});

describe('prerequisite eligibility is consistent with, and not established by, the credit rule', () => {
  const cat = (min: string | null) => catalog([course('TEST-101'), course('TEST-201', 3, pre('TEST-101', min))], [reqCourse('req', 'TEST-101')], { gradeScale: SYN_GRADES, repeatCreditPolicy: synRepeatPolicy(['TEST-101']) });
  const check = (c: CatalogModel, attempts: CourseAttempt[]) => evaluatePrerequisite(c.courses['TEST-201']!.prerequisite, T(2025, 'fall').sortIndex, { catalog: c, attempts, placements: [], gradeIndex: new Map(SYN_GRADES.ordered.map((g, i) => [g, i])) });
  it('fail then qualifying pass: credit definite and the dependent prerequisite definitely met', () => {
    const attempts = [F(), PASS('B')];
    expect(req(auditOf(cat('C'), attempts))).toMatchObject({ status: 'satisfied', conditional: false });
    expect(check(cat('C'), attempts)).toMatchObject({ status: 'satisfied', conditional: false });
  });
  it('the credit rule never satisfies a stricter prerequisite minimum grade', () => {
    const attempts = [F(), PASS('C')];
    expect(req(auditOf(cat('B'), attempts))).toMatchObject({ status: 'satisfied', conditional: false });
    expect(check(cat('B'), attempts)).toMatchObject({ status: 'unsatisfied' });
  });
  it('fail then in-progress retake: credit and prerequisite are both conditional', () => {
    const attempts = [F(), IP()];
    expect(req(auditOf(cat(null), attempts))).toMatchObject({ status: 'satisfied', conditional: true });
    expect(check(cat(null), attempts)).toMatchObject({ status: 'satisfied', conditional: true });
  });
});

describe('deterministic scheduling and outlook with a scoped policy', () => {
  // Chain 101 -> 201; the student failed 101 once.
  const chain = (scope: string[] | null) => catalog([course('TEST-101'), course('TEST-201', 3, pre('TEST-101')), course('TEST-102')],
    [reqAll('root', ['r101', 'r201']), reqCourse('r101', 'TEST-101'), reqCourse('r201', 'TEST-201')],
    { root: 'root', gradeScale: SYN_GRADES, repeatCreditPolicy: scope ? synRepeatPolicy(scope) : null });
  const terms = horizon(6);
  const failed = attempt('TEST-101', { status: 'failed', earnedCredits: 0, grade: 'F', term: T(2025, 'fall'), attemptId: 'syn-f' });
  const s = (scope: string[] | null): PlanningScenario => scenario(chain(scope), { terms, attempts: [failed] });

  it('in scope: outlook is a conditional path, the generated draft retakes 101 once before 201', () => {
    const r = ok(evaluate(s(['TEST-101'])));
    expect(r.outlook.kind).toBe('conditional_path_found');
    expect(r.evidenceGaps.some(f => f.code === 'repeat_policy_unresolved')).toBe(false);
    expect(validateAnalysisForScenario(s(['TEST-101']), r).ok).toBe(true);
    const d = ok(generateDraft(s(['TEST-101'])));
    if ('kind' in d) throw new Error('no draft');
    const at = (c: string) => d.placements.filter(p => p.courseId === c).map(p => p.termId.sortIndex);
    expect(at('TEST-101')).toHaveLength(1);
    expect(at('TEST-101')[0]!).toBeLessThan(at('TEST-201')[0]!);
    const proj = computeAudit({ catalog: chain(['TEST-101']), attempts: [failed], placements: d.placements, targetSort: terms[terms.length - 1]!.sortIndex });
    expect(proj.outcomes.get('root')).toMatchObject({ status: 'satisfied', conditional: true });
  });
  it('out of scope or null: same record stays insufficient_evidence with the repeat gap', () => {
    for (const scope of [['TEST-102'], null]) {
      const r = ok(evaluate(s(scope)));
      expect(r.outlook.kind).toBe('insufficient_evidence');
      expect(r.evidenceGaps.find(f => f.code === 'repeat_policy_unresolved')?.courseIds).toEqual(['TEST-101']);
    }
  });
  it('same input yields byte-identical analysis and draft; the policy participates in the fingerprint', () => {
    const a = s(['TEST-101']), b = s(['TEST-101']);
    expect(canonicalJson(ok(evaluate(a)))).toBe(canonicalJson(ok(evaluate(b))));
    expect(canonicalJson(ok(generateDraft(a)))).toBe(canonicalJson(ok(generateDraft(b))));
    expect(fingerprint(a)).not.toBe(fingerprint(s(null)));
    expect(fingerprint(s(null))).not.toBe(fingerprint(s(['TEST-102'])));
  });
});
