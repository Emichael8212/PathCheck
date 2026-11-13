import { expect, it } from 'vitest';
import { CatalogModelSchema, RequirementGroupSchema } from './academic';
import { syntheticScenario } from './synthetic.test-fixtures';
const base = { sourceRefs: ['synthetic'], uncertainty: 'documented' as const, overlap: { mode: 'forbidden' as const }, consumesCredits: true };
it('encodes choose-one sequences of subgroups and constraint-only reuse', () => {
  const c = syntheticScenario().catalog;
  c.requirementGroups = [
    { ...base, requirementId: 'required', kind: 'course', courseId: 'TEST-101' },
    { ...base, requirementId: 'pair-a', kind: 'all', requirementIds: ['required'], consumesCredits: false },
    { ...base, requirementId: 'pair-b', kind: 'all', requirementIds: ['required'], consumesCredits: false },
    { ...base, requirementId: 'sequence', kind: 'choose_n', courseIds: [], requirementIds: ['pair-a', 'pair-b'], count: 1, consumesCredits: false },
    { ...base, requirementId: 'root', kind: 'all', requirementIds: ['required', 'sequence'], consumesCredits: false },
  ];
  c.rootRequirementId = 'root';
  expect(CatalogModelSchema.safeParse(c).success).toBe(true);
  c.requirementGroups[1] = { ...base, requirementId: 'pair-a', kind: 'all', requirementIds: ['sequence'], consumesCredits: false };
  expect(CatalogModelSchema.safeParse(c).success).toBe(false);
});
it('rejects ambiguous alternative selection and unknown overlap references', () => {
  expect(RequirementGroupSchema.safeParse({ ...base, requirementId: 'choice', kind: 'choose_n', courseIds: ['TEST-101'], requirementIds: ['required'], count: 1 }).success).toBe(false);
  const c = syntheticScenario().catalog;
  c.requirementGroups[0]!.overlap = { mode: 'shared_with', requirementIds: ['missing'] };
  expect(CatalogModelSchema.safeParse(c).success).toBe(false);
});
it('preserves unresolved elective inventories with a three-course minimum', () => {
  const c = syntheticScenario().catalog;
  c.requirementGroups.push({ ...base, requirementId: 'electives', kind: 'min_credits', minimum: 9, minCourses: 3, courseIds: [], eligibility: { collegeId: 'synthetic-college', subjectPrefixes: null, minLevel: 300, maxLevel: 499, excludeRequirementIds: ['required'], sourceRefs: ['synthetic'], inventoryStatus: 'unresolved' } });
  expect(CatalogModelSchema.parse(c).requirementGroups[1]).toMatchObject({ minCourses: 3, eligibility: { inventoryStatus: 'unresolved' } });
  expect(RequirementGroupSchema.safeParse({ ...base, requirementId: 'electives', kind: 'min_credits', minimum: 9, minCourses: 3, courseIds: [], eligibility: null }).success).toBe(false);
});
it('retains historical unresolved equivalency without inventing a historical course definition', () => {
  const c = syntheticScenario().catalog;
  c.equivalencies = [{ fromCourseId: 'TEST-099', toCourseId: 'TEST-101', status: 'unresolved', sourceRefs: ['synthetic'] }];
  expect(CatalogModelSchema.parse(c).equivalencies[0]!.status).toBe('unresolved');
  c.equivalencies[0]!.toCourseId = 'TEST-999';
  expect(CatalogModelSchema.safeParse(c).success).toBe(false);
});
it('allows an unknown grade scale and rejects unsourced or duplicate ordered grades', () => {
  const c = syntheticScenario().catalog;
  expect(CatalogModelSchema.parse(c).gradeScale).toBeNull();
  c.gradeScale = { ordered: ['A', 'B', 'C'], sourceRefs: ['synthetic'] };
  expect(CatalogModelSchema.safeParse(c).success).toBe(true);
  c.gradeScale.ordered.push('C');
  expect(CatalogModelSchema.safeParse(c).success).toBe(false);
});
