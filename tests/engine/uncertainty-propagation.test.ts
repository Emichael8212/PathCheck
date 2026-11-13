// G final-review regressions: an attempt that normalization marked `unresolved` because its
// status contradicts its grade/credits must reach prerequisite and audit consumers as
// "unresolved", never as a definite "missing"/"not passed". Exercised through the real chain
// normalizeAttempts -> PlanningScenario -> audit()/evaluate()/evaluatePrerequisite().
// No credit is awarded and no grade/passing policy is introduced.
// ENTIRELY SYNTHETIC catalogs; no ASU rules, no student data.
import { describe, expect, it } from 'vitest';
import type { CatalogModel, CourseAttempt, ProposedRow } from '../../src/contracts';
import { audit, evaluate, evaluatePrerequisite, normalizeAttempts } from '../../src/engine';
import { SYN_GRADES, catalog, coreq, course, horizon, place, pre, reqAll, reqCourse, scenario } from '../fixtures/engine/synthetic';

const ok = <V>(r: { ok: true; value: V } | { ok: false; reasonCode: string }): V => { if (!r.ok) throw new Error(r.reasonCode); return r.value; };
const terms = horizon(4); // spring 2026 .. fall 2027

// SYN-101 (3 cr) -> SYN-201; SYN-202 needs SYN-101 as corequisite; SYN-000 is a legitimate 0-credit course.
const cat = (): CatalogModel => catalog([
  course('SYN-101'), course('SYN-201', 3, pre('SYN-101')), course('SYN-202', 3, coreq('SYN-101')),
  course('SYN-000', 0), course('SYN-210', 3, pre('SYN-000')),
], [reqAll('degree', ['r101']), reqCourse('r101', 'SYN-101'), reqCourse('r000', 'SYN-000')], { root: 'degree' });

const row = (o: Partial<ProposedRow> = {}): ProposedRow => ({
  rowId: 'r1', rawCourseCode: 'SYN 101', rawTitle: null, rawTerm: 'Fall 2025', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed',
  rawInstitution: null, provisionalCourseId: null, provenance: [], uncertainty: [], ...o,
});
/** Real normalization of one manual row; returns the attempts exactly as consumers receive them. */
const normalized = (o: Partial<ProposedRow>, c = cat()): CourseAttempt[] => ok(normalizeAttempts({ kind: 'manual_rows', rows: [row(o)] }, c)).record.courseAttempts;
const req = (attempts: CourseAttempt[], id: string, c = cat()) => ok(audit(scenario(c, { terms, attempts }))).requirements.find(r => r.requirementId === id)!;
const prereq = (attempts: CourseAttempt[], courseId: string, c = cat()) =>
  evaluatePrerequisite(c.courses[courseId]!.prerequisite, terms[0]!.sortIndex, { catalog: c, attempts, placements: [], gradeIndex: null });
const plannedFindings = (attempts: CourseAttempt[], courseId: string, c = cat()) => {
  const r = ok(evaluate(scenario(c, { terms, attempts, placements: [place(courseId, terms[0]!)] })));
  return [...r.topFindings, ...r.evidenceGaps].map(f => f.code);
};

describe('contradictory failed/withdrawn rows stay unresolved downstream', () => {
  const contradictions: Array<[string, Partial<ProposedRow>]> = [
    ['withdrawn / W / earned 3', { rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '3' }],
    ['failed / F / earned 3', { rawStatus: 'failed', rawGrade: 'F', rawEarnedCredits: '3' }],
  ];
  for (const [label, o] of contradictions) {
    it(`${label}: normalization unresolved, prerequisite unresolved, audit unresolved (never definite missing)`, () => {
      const atts = normalized(o);
      expect(atts[0]!.confidence).toBe('unresolved');
      const p = prereq(atts, 'SYN-201');
      expect(p.status).toBe('unresolved'); expect(p.missing).toEqual([]);
      expect(prereq(atts, 'SYN-202').status).toBe('unresolved');
      const r = req(atts, 'r101');
      expect(r.status).toBe('unresolved'); expect(r.attemptIds).toEqual([atts[0]!.attemptId]);
      expect(r.applicableCredits).toBe(0); // no credit awarded
      const findings = plannedFindings(atts, 'SYN-201');
      expect(findings).not.toContain('prerequisite_unsatisfied');
      expect(findings).toContain('prerequisite_unresolved');
      expect(ok(audit(scenario(cat(), { terms, attempts: atts }))).totalStatus).toBe('unresolved');
    });
  }
  it('unmapped contradictory withdrawn row is surfaced as an unresolved gap, not dropped', () => {
    const atts = normalized({ rawCourseCode: 'ZZZ 999', rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '3' });
    expect(atts[0]!.normalizedCourseId).toBeNull(); expect(atts[0]!.confidence).toBe('unresolved');
    const gaps = ok(evaluate(scenario(cat(), { terms, attempts: atts }))).evidenceGaps.map(f => f.code);
    expect(gaps).toContain('unmapped_attempt');
  });
  it('a contradictory row in a LATER term than the planned course still cannot satisfy it', () => {
    const atts = normalized({ rawTerm: 'Fall 2026', rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '3' });
    expect(prereq(atts, 'SYN-201').status).toBe('unsatisfied');
  });
});

describe('controls: consistent failed/withdrawn rows remain definite', () => {
  const controls: Array<[string, Partial<ProposedRow>]> = [
    ['withdrawn / W / earned 0', { rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '0' }],
    ['withdrawn / W / earned blank', { rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: null }],
    ['failed / F / earned 0', { rawStatus: 'failed', rawGrade: 'F', rawEarnedCredits: '0' }],
  ];
  for (const [label, o] of controls) {
    it(`${label}: provisional, prerequisite unsatisfied, requirement unmet`, () => {
      const atts = normalized(o);
      expect(atts[0]!.confidence).toBe('provisional');
      const p = prereq(atts, 'SYN-201');
      expect(p.status).toBe('unsatisfied'); expect(p.missing).toEqual(['SYN-101']);
      expect(p.reasons).toContain('prerequisite_attempt_not_passed');
      expect(prereq(atts, 'SYN-202').status).toBe('unsatisfied');
      expect(req(atts, 'r101').status).toBe('unmet');
      expect(plannedFindings(atts, 'SYN-201')).toContain('prerequisite_unsatisfied');
    });
  }
  it('consistent unmapped / transfer failed and withdrawn rows are still set aside (no gap, no orphan credit)', () => {
    for (const o of [
      { rawCourseCode: 'ZZZ 999', rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '0' },
      { rawCourseCode: 'ZZZ 999', rawStatus: 'failed', rawGrade: 'F', rawEarnedCredits: null },
      { rawInstitution: 'Other College', rawStatus: 'failed', rawGrade: 'F', rawEarnedCredits: '0' },
    ] satisfies Array<Partial<ProposedRow>>) {
      const atts = normalized(o);
      expect(atts[0]!.normalizedCourseId).toBeNull();
      const gaps = ok(evaluate(scenario(cat(), { terms, attempts: atts }))).evidenceGaps.map(f => f.code);
      expect(gaps).not.toContain('unmapped_attempt'); expect(gaps).not.toContain('transfer_equivalency_unverified');
      expect(prereq(atts, 'SYN-201').status).toBe('unsatisfied');
      expect(req(atts, 'r101').status).toBe('unmet');
    }
  });
  it('contradictory transfer withdrawn row with matching raw code is unresolved, never a definite miss', () => {
    const atts = normalized({ rawInstitution: 'Other College', rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '3' });
    expect(atts[0]!.origin).toBe('transfer');
    expect(prereq(atts, 'SYN-201').status).toBe('unresolved');
    expect(req(atts, 'r101').status).toBe('unresolved');
  });
  it('a consistent failure plus an unresolved retake is unresolved; plus a clean pass is satisfied', () => {
    const c = cat();
    const rows = (second: Partial<ProposedRow>) => ok(normalizeAttempts({ kind: 'manual_rows', rows: [row({ rowId: 'f', rawStatus: 'failed', rawGrade: 'F', rawEarnedCredits: '0', rawTerm: 'Fall 2024' }), row({ rowId: 's', ...second })] }, c)).record.courseAttempts;
    expect(prereq(rows({ rawStatus: 'withdrawn', rawGrade: 'W', rawEarnedCredits: '3' }), 'SYN-201').status).toBe('unresolved');
    expect(prereq(rows({}), 'SYN-201').status).toBe('satisfied');
  });
});

describe('completed rows with zero earned credit', () => {
  it('completed / A / earned 0 on a positive-credit catalog course is a contradiction: unresolved downstream', () => {
    const r = ok(normalizeAttempts({ kind: 'manual_rows', rows: [row({ rawGrade: 'A', rawEarnedCredits: '0' })] }, cat()));
    const atts = r.record.courseAttempts;
    expect(atts[0]!.confidence).toBe('unresolved'); expect(r.warnings).toContain('completed_zero_earned_credit_contradiction:r1');
    expect(prereq(atts, 'SYN-201').status).toBe('unresolved');
    expect(req(atts, 'r101').status).toBe('unresolved');
    expect(req(atts, 'r101').applicableCredits).toBe(0);
    expect(plannedFindings(atts, 'SYN-201')).not.toContain('prerequisite_unsatisfied');
  });
  it('completed / no grade / earned 0 on a positive-credit course is also withheld', () => {
    const atts = normalized({ rawGrade: null, rawEarnedCredits: '0' });
    expect(atts[0]!.confidence).toBe('unresolved');
    expect(prereq(atts, 'SYN-201').status).toBe('unresolved');
  });
  it('legitimate zero-credit catalog course: completed with earned 0 is not flagged as a contradiction', () => {
    const r = ok(normalizeAttempts({ kind: 'manual_rows', rows: [row({ rawCourseCode: 'SYN 000', rawAttemptedCredits: '0', rawEarnedCredits: '0', rawGrade: 'P' })] }, cat()));
    expect(r.record.courseAttempts[0]!.confidence).toBe('provisional');
    expect(r.warnings.some(w => w.startsWith('completed_zero_earned_credit_contradiction'))).toBe(false);
  });
  it('control: completed / B / earned 3 stays provisional and satisfies', () => {
    const atts = normalized({});
    expect(atts[0]!.confidence).toBe('provisional');
    expect(prereq(atts, 'SYN-201').status).toBe('satisfied');
    expect(req(atts, 'r101').status).toBe('satisfied');
  });
  it('a later-term clean pass still wins over an earlier contradictory zero-credit row', () => {
    const c = cat();
    const atts = ok(normalizeAttempts({ kind: 'manual_rows', rows: [row({ rowId: 'z', rawEarnedCredits: '0', rawTerm: 'Fall 2024' }), row({ rowId: 'p', rawTerm: 'Fall 2025' })] }, c)).record.courseAttempts;
    expect(prereq(atts, 'SYN-201').status).toBe('satisfied');
  });
});

// E final correction: zero-credit completions and unresolved in-progress rows downstream.
describe('zero-credit catalog course completions', () => {
  const zcat = (): CatalogModel => catalog([
    course('SYN-101'), course('SYN-000', 0), course('SYN-005', 'unknown'),
    course('SYN-210', 3, pre('SYN-000')), course('SYN-211', 3, pre('SYN-000', 'C')), course('SYN-215', 3, pre('SYN-005')), course('SYN-216', 3, pre('SYN-101')),
  ], [reqAll('degree', ['r000', 'r005', 'r101']), reqCourse('r000', 'SYN-000'), reqCourse('r005', 'SYN-005'), reqCourse('r101', 'SYN-101')], { root: 'degree', gradeScale: SYN_GRADES });
  const gi = (c: CatalogModel) => new Map(c.gradeScale!.ordered.map((g, i) => [g, i]));
  const zprereq = (attempts: CourseAttempt[], courseId: string, c = zcat()) =>
    evaluatePrerequisite(c.courses[courseId]!.prerequisite, terms[0]!.sortIndex, { catalog: c, attempts, placements: [], gradeIndex: gi(c) });
  const zero = (o: Partial<ProposedRow>) => normalized({ rawCourseCode: 'SYN 000', rawAttemptedCredits: '0', rawEarnedCredits: '0', rawGrade: 'B', ...o }, zcat());

  it('trusted completed / earned 0 on a 0-credit course is a completion for prerequisite and audit (0 credits)', () => {
    const atts = zero({});
    expect(atts[0]!.confidence).toBe('provisional');
    expect(zprereq(atts, 'SYN-210')).toMatchObject({ status: 'satisfied', conditional: false });
    const r = req(atts, 'r000', zcat());
    expect(r).toMatchObject({ status: 'satisfied', conditional: false, applicableCredits: 0 });
    expect(r.attemptIds).toEqual([atts[0]!.attemptId]);
  });
  it('minimum-grade checks still apply to a 0-credit completion', () => {
    expect(zprereq(zero({ rawGrade: 'C' }), 'SYN-211').status).toBe('satisfied');
    const below = zprereq(zero({ rawGrade: 'D' }), 'SYN-211');
    expect(below.status).toBe('unsatisfied'); expect(below.reasons).toContain('grade_below_minimum');
    const c = zcat();
    expect(evaluatePrerequisite(c.courses['SYN-211']!.prerequisite, terms[0]!.sortIndex, { catalog: c, attempts: zero({}), placements: [], gradeIndex: null }).status).toBe('unresolved');
  });
  it('earned 0 on a positive-credit course stays unresolved even when the row is trusted', () => {
    const atts = normalized({}, zcat()).map(a => ({ ...a, earnedCredits: 0 }));
    expect(atts[0]!.confidence).toBe('provisional');
    const p = zprereq(atts, 'SYN-216'); expect(p.status).toBe('unresolved'); expect(p.missing).toEqual([]);
    expect(req(atts, 'r101', zcat()).status).toBe('unresolved');
  });
  it('earned 0 on an unknown-credit course is neither a completion nor a definite miss', () => {
    const atts = normalized({ rawCourseCode: 'SYN 005', rawEarnedCredits: '0' }, zcat());
    expect(atts[0]!.confidence).toBe('provisional');
    expect(zprereq(atts, 'SYN-215').status).toBe('unresolved');
    expect(req(atts, 'r005', zcat()).status).toBe('unresolved');
  });
});

describe('unresolved in-progress rows are not conditional future passes', () => {
  // Real normalization: extraction uncertainty on the row makes it unresolved.
  const ip = (o: Partial<ProposedRow> = {}) => normalized({ rawStatus: 'in_progress', rawEarnedCredits: null, rawGrade: null, ...o });
  const at = (attempts: CourseAttempt[], courseId: string, sort: number) =>
    evaluatePrerequisite(cat().courses[courseId]!.prerequisite, sort, { catalog: cat(), attempts, placements: [], gradeIndex: null });

  it('prerequisite: unresolved in-progress is unresolved (no future-pass assumption); provisional stays conditional', () => {
    const bad = ip({ uncertainty: ['ocr-low-confidence'] });
    expect([bad[0]!.status, bad[0]!.confidence]).toEqual(['in_progress', 'unresolved']);
    const p = prereq(bad, 'SYN-201');
    expect(p).toMatchObject({ status: 'unresolved', conditional: false, missing: [] });
    expect(p.assumptions).toEqual([]);
    const good = ip();
    expect(good[0]!.confidence).toBe('provisional');
    expect(prereq(good, 'SYN-201')).toMatchObject({ status: 'satisfied', conditional: true, assumptions: ['future_pass:SYN-101'] });
  });
  it('corequisite concurrent enrollment: unresolved in-progress is unresolved; provisional is conditional', () => {
    const sort = terms[0]!.sortIndex;
    expect(at(ip({ rawTerm: 'Spring 2026', uncertainty: ['ocr-low-confidence'] }), 'SYN-202', sort)).toMatchObject({ status: 'unresolved', conditional: false });
    expect(at(ip({ rawTerm: 'Spring 2026' }), 'SYN-202', sort)).toMatchObject({ status: 'satisfied', conditional: true });
  });
  it('audit: unresolved in-progress leaves the requirement unresolved (not conditional); provisional is conditional', () => {
    const bad = ip({ uncertainty: ['ocr-low-confidence'] });
    const r = req(bad, 'r101');
    expect(r).toMatchObject({ status: 'unresolved', conditional: false, applicableCredits: 0 });
    expect(r.attemptIds).toEqual([bad[0]!.attemptId]);
    expect(req(ip(), 'r101')).toMatchObject({ status: 'satisfied', conditional: true });
  });
  it('plan check: a course planned after an unresolved in-progress prerequisite reports unresolved, not unsatisfied', () => {
    const findings = plannedFindings(ip({ uncertainty: ['ocr-low-confidence'] }), 'SYN-201');
    expect(findings).toContain('prerequisite_unresolved');
    expect(findings).not.toContain('prerequisite_unsatisfied');
  });
});
