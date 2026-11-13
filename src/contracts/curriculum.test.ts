import { describe, expect, it } from 'vitest';
import historical from '../../docs/curriculum/historical-2019-2021.json';
import current from '../../docs/curriculum/provisional-current.json';
import { CurriculumBaselineSchema } from './curriculum';
describe('approved curriculum-only source handoff', () => {
  it.each([historical, current])('validates $variant without claiming academic approval', input => {
    const c = CurriculumBaselineSchema.parse(input);
    expect(c.blocks.reduce<number>((sum, b) => sum + b.credits, c.electives.credits)).toBe(121);
    expect(c.formalCatalogYear).toBeNull();
    expect(c.authoritativeGraduationConclusionsEnabled).toBe(false);
    expect(c.reportedPolicies.filter(p => p.printedStatus === 'suspended')).toHaveLength(4);
  });
  it('changes only the two major course slots and preserves the historical version', () => {
    const old = historical.blocks.find(b => b.id === 'major')!.required.map(c => c.courseId);
    const now = current.blocks.find(b => b.id === 'major')!.required.map(c => c.courseId);
    expect(old.filter(id => !now.includes(id))).toEqual(['CIS-304', 'CIS-415']);
    expect(now.filter(id => !old.includes(id))).toEqual(['CIS-300', 'CIS-351']);
    expect(current.blocks.filter(b => b.id !== 'major')).toEqual(historical.blocks.filter(b => b.id !== 'major'));
    expect(current.electives.excludeRequiredCourses).toBe(true);
    expect(current.nonOfferingReports.every(r => r.scope === 'undergraduate_cis_students')).toBe(true);
    expect(current.replacements.every(r => r.formalEffectiveDate === null && r.historicalEquivalency === 'unresolved')).toBe(true);
  });
  it('rejects optimistic policy promotion, extra personal fields and credit drift', () => {
    expect(CurriculumBaselineSchema.safeParse({ ...current, authoritativeGraduationConclusionsEnabled: true }).success).toBe(false);
    expect(CurriculumBaselineSchema.safeParse({ ...current, studentId: 'synthetic-private-field' }).success).toBe(false);
    const changed = structuredClone(current); changed.blocks[0]!.required[0]!.credits = 3;
    expect(CurriculumBaselineSchema.safeParse(changed).success).toBe(false);
  });
});
