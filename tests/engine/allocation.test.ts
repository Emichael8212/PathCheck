// Credit allocation / forbidden-reuse regressions (T-ENG-24, CAT-04). Synthetic only.
import { describe, expect, it } from 'vitest';
import { computeAudit } from '../../src/engine/audit';
import { T, attempt, catalog, chooseCourses, chooseGroups, course, minCredits, place, reqAll, reqCourse, totalCredits } from '../fixtures/engine/synthetic';
import type { CatalogModel, CourseAttempt } from '../../src/contracts';

const run = (cat: CatalogModel, attempts: CourseAttempt[]) => computeAudit({ catalog: cat, attempts, placements: [], targetSort: 99999 });
const statusOf = (r: ReturnType<typeof run>, id: string) => r.audit.requirements.find(x => x.requirementId === id)!.status;

describe('forbidden credit reuse across alternatives (ledger-reported defect)', () => {
  // Exact ledger reproduction: one completed 3-credit TEST-101; root all(required-a=TEST-101,
  // alternative=choose 1 of [need-b=TEST-102, need-a=TEST-101]); every group forbids overlap.
  const cat = catalog([course('TEST-101'), course('TEST-102')], [
    reqAll('root', ['required-a', 'alternative']),
    reqCourse('required-a', 'TEST-101'),
    chooseGroups('alternative', 1, ['need-b', 'need-a']),
    reqCourse('need-b', 'TEST-102'),
    reqCourse('need-a', 'TEST-101'),
  ], { root: 'root' });
  it('one TEST-101 cannot satisfy both required-a and the alternative', () => {
    const r = run(cat, [attempt('TEST-101', { attemptId: 'only' })]);
    expect(r.audit.totalStatus).not.toBe('satisfied');
    expect(statusOf(r, 'root')).toBe('unmet');
    expect(statusOf(r, 'alternative')).toBe('unmet');
    // The single attempt is reported as allocated to exactly one credit-consuming leaf.
    const holders = r.audit.requirements.filter(x => x.attemptIds.includes('only') && ['required-a', 'need-a', 'need-b'].includes(x.requirementId));
    expect(holders.map(h => h.requirementId)).toEqual(['required-a']);
  });
  it('order of alternatives does not change the conclusion', () => {
    const swapped = catalog([course('TEST-101'), course('TEST-102')], [
      reqAll('root', ['required-a', 'alternative']), reqCourse('required-a', 'TEST-101'),
      chooseGroups('alternative', 1, ['need-a', 'need-b']), reqCourse('need-b', 'TEST-102'), reqCourse('need-a', 'TEST-101'),
    ], { root: 'root' });
    expect(run(swapped, [attempt('TEST-101')]).audit.totalStatus).toBe('unmet');
  });
  it('satisfied once the other alternative is genuinely completed', () => {
    const r = run(cat, [attempt('TEST-101'), attempt('TEST-102')]);
    expect(r.audit.totalStatus).toBe('satisfied');
    expect(r.audit.applicableCredits).toBe(6);
  });
  it('picks the alternative that coexists with the required leaf, not the first-ranked one', () => {
    // TEST-101 + TEST-102 completed: need-a (TEST-101) would collide with required-a; need-b must be chosen.
    const r = run(cat, [attempt('TEST-101'), attempt('TEST-102')]);
    expect(statusOf(r, 'need-b')).toBe('satisfied');
    expect(statusOf(r, 'alternative')).toBe('satisfied');
  });
});

describe('nested alternatives', () => {
  // root all(req=A, outer=choose1[inner-1=all(x=A, y=B), inner-2=choose1[z=A, w=C]])
  const cat = catalog(['TEST-101', 'TEST-102', 'TEST-103'].map(c => course(c)), [
    reqAll('root', ['req', 'outer']), reqCourse('req', 'TEST-101'),
    chooseGroups('outer', 1, ['inner-1', 'inner-2']),
    reqAll('inner-1', ['x', 'y']), reqCourse('x', 'TEST-101'), reqCourse('y', 'TEST-102'),
    chooseGroups('inner-2', 1, ['z', 'w']), reqCourse('z', 'TEST-101'), reqCourse('w', 'TEST-103'),
  ], { root: 'root' });
  it('a single course cannot flow through nested alternatives into a second requirement', () => {
    expect(run(cat, [attempt('TEST-101'), attempt('TEST-102')]).audit.totalStatus).toBe('unmet');
  });
  it('deep alternative with a distinct course satisfies', () => {
    const r = run(cat, [attempt('TEST-101'), attempt('TEST-103')]);
    expect(r.audit.totalStatus).toBe('satisfied');
    expect(statusOf(r, 'w')).toBe('satisfied');
  });
  it('choose-2 of course-alternatives counts distinct courses only', () => {
    const c2 = catalog(['TEST-101', 'TEST-102', 'TEST-103'].map(c => course(c)), [
      reqAll('root', ['req', 'pick']), reqCourse('req', 'TEST-101'), chooseCourses('pick', 2, ['TEST-101', 'TEST-102', 'TEST-103']),
    ], { root: 'root' });
    expect(run(c2, [attempt('TEST-101'), attempt('TEST-102')]).audit.totalStatus).toBe('unmet');
    expect(run(c2, [attempt('TEST-101'), attempt('TEST-102'), attempt('TEST-103')]).audit.totalStatus).toBe('satisfied');
  });
});

describe('authorized and unresolved overlap', () => {
  const build = (aOverlap: Parameters<typeof reqCourse>[2], bOverlap: Parameters<typeof reqCourse>[2]) => catalog([course('TEST-101'), course('TEST-102')], [
    reqAll('root', ['major', 'alternative']), reqCourse('major', 'TEST-101', aOverlap),
    chooseGroups('alternative', 1, ['need-b', 'need-a']), reqCourse('need-b', 'TEST-102'), reqCourse('need-a', 'TEST-101', bOverlap),
  ], { root: 'root' });
  it('mutually listed shared_with permits reuse without multiplying credits', () => {
    const cat = build({ overlap: { mode: 'shared_with', requirementIds: ['need-a'] } }, { overlap: { mode: 'shared_with', requirementIds: ['major'] } });
    const r = run(cat, [attempt('TEST-101')]);
    expect(r.audit.totalStatus).toBe('satisfied');
    expect(r.audit.applicableCredits).toBe(3);
  });
  it('one-sided shared_with is not permission', () => {
    const cat = build({ overlap: { mode: 'shared_with', requirementIds: ['need-a'] } }, { overlap: { mode: 'unresolved' } });
    expect(run(cat, [attempt('TEST-101')]).audit.totalStatus).toBe('unresolved');
  });
  it('a forbidden side denies sharing even when the other side lists it', () => {
    const cat = build({ overlap: { mode: 'shared_with', requirementIds: ['need-a'] } }, { overlap: { mode: 'forbidden' } });
    expect(run(cat, [attempt('TEST-101')]).audit.totalStatus).toBe('unmet');
  });
  it('unresolved permission stays unresolved, never satisfied', () => {
    const cat = build({ overlap: { mode: 'unresolved' } }, { overlap: { mode: 'unresolved' } });
    expect(run(cat, [attempt('TEST-101')]).audit.totalStatus).toBe('unresolved');
  });
});

describe('min_credits and totals use unique units', () => {
  it('a required course cannot also count toward an elective credit pool', () => {
    const cat = catalog([course('TEST-301'), course('TEST-302'), course('TEST-303')], [
      reqAll('root', ['major', 'electives', 'total']), reqCourse('major', 'TEST-301'),
      minCredits('electives', 6, ['TEST-301', 'TEST-302', 'TEST-303'], { minCourses: 2 }), totalCredits('total', 9),
    ], { root: 'root' });
    expect(run(cat, [attempt('TEST-301'), attempt('TEST-302')]).audit.totalStatus).toBe('unmet');
    const r = run(cat, [attempt('TEST-301'), attempt('TEST-302'), attempt('TEST-303')]);
    expect(r.audit.totalStatus).toBe('satisfied');
    expect(r.audit.applicableCredits).toBe(9);
  });
  it('repair frees a slot unit for a credit pool when a substitute exists', () => {
    const cat = catalog([course('TEST-101'), course('TEST-102'), course('TEST-201')], [
      reqAll('root', ['pick', 'pool']), chooseCourses('pick', 1, ['TEST-101', 'TEST-102']), minCredits('pool', 3, ['TEST-101']),
    ], { root: 'root' });
    const r = run(cat, [attempt('TEST-101'), attempt('TEST-102')]);
    expect(r.audit.totalStatus).toBe('satisfied');
  });
  it('total credits never multiply shared units', () => {
    const cat = catalog([course('TEST-101'), course('TEST-102')], [
      reqAll('root', ['a', 'b', 'total']), reqCourse('a', 'TEST-101', { overlap: { mode: 'shared_with', requirementIds: ['b'] } }),
      minCredits('b', 3, ['TEST-101'], { overlap: { mode: 'shared_with', requirementIds: ['a'] } }), totalCredits('total', 6),
    ], { root: 'root' });
    const r = run(cat, [attempt('TEST-101')]);
    expect(statusOf(r, 'total')).toBe('unmet');
    expect(r.audit.applicableCredits).toBe(3);
  });
});

describe('constraint-only groups inspect courses without consuming credit', () => {
  it('sequence check may reuse required courses', () => {
    const cat = catalog([course('TEST-101'), course('TEST-102'), course('TEST-201'), course('TEST-202')], [
      reqAll('root', ['r1', 'r2', 'seq']), reqCourse('r1', 'TEST-101'), reqCourse('r2', 'TEST-102'),
      chooseGroups('seq', 1, ['seq-a', 'seq-b'], { consumesCredits: false }),
      reqAll('seq-a', ['sa1', 'sa2'], { consumesCredits: false }), reqCourse('sa1', 'TEST-101', { consumesCredits: false }), reqCourse('sa2', 'TEST-102', { consumesCredits: false }),
      reqAll('seq-b', ['sb1', 'sb2'], { consumesCredits: false }), reqCourse('sb1', 'TEST-201', { consumesCredits: false }), reqCourse('sb2', 'TEST-202', { consumesCredits: false }),
    ], { root: 'root' });
    const r = run(cat, [attempt('TEST-101'), attempt('TEST-102')]);
    expect(r.audit.totalStatus).toBe('satisfied');
    expect(r.audit.applicableCredits).toBe(6);
  });
});

describe('conditional planned allocations and equivalency uniqueness', () => {
  const cat = catalog([course('TEST-101'), course('TEST-102')], [
    reqAll('root', ['required-a', 'alternative']), reqCourse('required-a', 'TEST-101'),
    chooseGroups('alternative', 1, ['need-b', 'need-a']), reqCourse('need-b', 'TEST-102'), reqCourse('need-a', 'TEST-101'),
  ], { root: 'root' });
  const planned = (sort: number, target: number) => computeAudit({ catalog: cat, attempts: [], placements: [place('TEST-101', T(2026, 'fall'))].map(p => ({ ...p, termId: { ...p.termId, sortIndex: sort } })), targetSort: target });
  it('a planned course is conditional, never definite, and cannot fill two forbidden leaves', () => {
    const r = planned(T(2026, 'fall').sortIndex, 99999);
    const ra = r.audit.requirements.find(x => x.requirementId === 'required-a')!;
    expect(ra).toMatchObject({ status: 'satisfied', conditional: true });
    expect(ra.placementIds).toEqual([`p-TEST-101-${T(2026, 'fall').sortIndex}`]);
    expect(r.audit.requirements.find(x => x.requirementId === 'alternative')!.status).toBe('unmet');
    expect(r.audit.totalStatus).toBe('unmet'); expect(r.audit.applicableCredits).toBe(0);
  });
  it('a placement after the target term does not count', () => {
    expect(planned(T(2026, 'fall').sortIndex, T(2026, 'spring').sortIndex).audit.requirements.find(x => x.requirementId === 'required-a')!.status).toBe('unmet');
  });
  it('one attempt cannot satisfy both its own course and an equivalency target under forbidden overlap', () => {
    const eqCat = catalog([course('TEST-101'), course('TEST-150')], [reqAll('root', ['own', 'target']), reqCourse('own', 'TEST-150'), reqCourse('target', 'TEST-101')],
      { root: 'root', equivalencies: [{ fromCourseId: 'TEST-150', toCourseId: 'TEST-101', status: 'verified', sourceRefs: ['synthetic-src'] }] });
    const r = run(eqCat, [attempt('TEST-150')]);
    expect(r.audit.totalStatus).toBe('unmet');
    expect(r.audit.requirements.filter(x => x.status === 'satisfied' && x.requirementId !== 'root')).toHaveLength(1);
  });
});

describe('deterministic allocation', () => {
  it('equal input gives identical audit and allocation', () => {
    const cat = catalog(['TEST-101', 'TEST-102', 'TEST-103'].map(c => course(c)), [
      reqAll('root', ['pick', 'pool']), chooseCourses('pick', 1, ['TEST-101', 'TEST-102']), minCredits('pool', 3, ['TEST-102', 'TEST-103']),
    ], { root: 'root' });
    const attempts = [attempt('TEST-101', { attemptId: 'x1' }), attempt('TEST-102', { attemptId: 'x2' }), attempt('TEST-103', { attemptId: 'x3' })];
    const a = run(cat, attempts), b = run(cat, [...attempts].reverse());
    expect(a.audit).toEqual(b.audit);
    expect([...a.allocation.entries()].sort()).toEqual([...b.allocation.entries()].sort());
  });
});
