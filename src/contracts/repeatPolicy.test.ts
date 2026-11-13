import { describe, expect, it } from 'vitest';
import { CatalogModelSchema } from './academic';
import { canonicalJson, fingerprint } from './fingerprint';
import { syntheticScenario } from './synthetic.test-fixtures';

const policy = () => ({ courseIds: ['TEST-101'], creditCounting: 'once_per_course', selection: 'latest_qualifying', qualifyingGrades: ['A', 'B', 'C'], sourceRefs: ['synthetic'] } as const);
function input() {
  return { ...syntheticScenario().catalog, gradeScale: { ordered: ['F', 'D', 'C', 'B', 'A'], sourceRefs: ['synthetic'] }, repeatCreditPolicy: policy() };
}
describe('evidence-backed repeat-credit contract (synthetic, not ASU policy)', () => {
  it('preserves omitted legacy fields and their canonical fingerprint input', () => {
    const s = syntheticScenario(); const before = canonicalJson(s);
    const parsed = CatalogModelSchema.parse(s.catalog);
    expect(Object.hasOwn(parsed, 'repeatCreditPolicy')).toBe(false);
    expect(canonicalJson({ ...s, catalog: parsed })).toBe(before);
    expect(fingerprint({ ...s, catalog: parsed })).toBe(fingerprint(s));
  });
  it('accepts explicit unknown but rejects undefined JSON values', () => {
    expect(CatalogModelSchema.safeParse({ ...input(), repeatCreditPolicy: null }).success).toBe(true);
    expect(CatalogModelSchema.safeParse({ ...input(), repeatCreditPolicy: undefined }).success).toBe(false);
  });
  it('validates synthetic policy and fingerprints policy contents', () => {
    const s = syntheticScenario(); s.catalog = CatalogModelSchema.parse(input());
    const first = fingerprint(s);
    s.catalog.repeatCreditPolicy!.qualifyingGrades = ['A', 'B'];
    expect(fingerprint(s)).not.toBe(first);
  });
  it.each([
    { courseIds: [] }, { courseIds: ['TEST-999'] }, { courseIds: ['TEST-101', 'TEST-101'] },
    { sourceRefs: ['missing'] }, { qualifyingGrades: [] }, { qualifyingGrades: ['A', 'a'] },
    { qualifyingGrades: ['unknown'] }, { creditCounting: 'all_attempts' },
    { selection: 'highest_grade' }, { gradeReplacement: true },
  ])('rejects unsupported or invalid policy %j', patch => {
    expect(CatalogModelSchema.safeParse({ ...input(), repeatCreditPolicy: { ...policy(), ...patch } }).success).toBe(false);
  });
  it('requires a grade scale and no contradictory policy gap', () => {
    expect(CatalogModelSchema.safeParse({ ...input(), gradeScale: null }).success).toBe(false);
    expect(CatalogModelSchema.safeParse({ ...input(), policyGaps: [{ policyId: 'repeat-credit-policy', description: 'Unknown', sourceRefs: [], blocksConclusions: true }] }).success).toBe(false);
  });
  it.each(['documented', 'user_attested', 'disputed', 'unverified'])('rejects insufficient source status %s', verificationStatus => {
    const c = input();
    expect(CatalogModelSchema.safeParse({ ...c, catalogRef: { ...c.catalogRef, sources: c.catalogRef.sources.map(s => ({ ...s, verificationStatus })) } }).success).toBe(false);
  });
  it('rejects ambiguous grade scales and preserves JSON round trips', () => {
    expect(CatalogModelSchema.safeParse({ ...input(), gradeScale: { ordered: ['A', 'a', 'B', 'C'], sourceRefs: ['synthetic'] } }).success).toBe(false);
    for (const repeatCreditPolicy of [policy(), null]) {
      const parsed = CatalogModelSchema.parse({ ...input(), repeatCreditPolicy });
      expect(CatalogModelSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    }
  });
  it('requires verified catalog applicability for real policies', () => {
    const c = input();
    const ref = { ...c.catalogRef, ruleSetStatus: 'verified', sources: c.catalogRef.sources.map(s => ({ ...s, kind: 'official_catalog', verificationStatus: 'verified' })) };
    expect(CatalogModelSchema.safeParse({ ...c, approval: 'reviewed', catalogRef: ref }).success).toBe(true);
    expect(CatalogModelSchema.safeParse({ ...c, approval: 'reviewed', catalogRef: { ...ref, catalogYearId: null } }).success).toBe(false);
    expect(CatalogModelSchema.safeParse({ ...c, approval: 'user_provisional', catalogRef: { ...ref, ruleSetStatus: 'provisional' } }).success).toBe(false);
    expect(CatalogModelSchema.safeParse({ ...c, approval: 'reviewed', catalogRef: { ...ref, sources: c.catalogRef.sources } }).success).toBe(false);
  });
});
