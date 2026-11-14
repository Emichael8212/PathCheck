// ENTIRELY SYNTHETIC UI TEST FIXTURE. Not ASU policy, not real courses, no student data.
import { CatalogModelSchema } from '../../../src/contracts';
import type { CatalogModel, CatalogRef } from '../../../src/contracts';

const source = { sourceId: 'syn-src', kind: 'synthetic', urlOrRef: null, observedAt: null, description: 'Synthetic UI fixture; not ASU policy', verificationStatus: 'synthetic' } as const;

export const SYNTHETIC_REF: CatalogRef = { institutionId: 'asu', programId: 'bs-cis', catalogYearId: 'synthetic-only', catalogVersion: 'syn-ui-v1', ruleSetStatus: 'synthetic', sources: [source] };

const none = { kind: 'all', children: [] } as const;
const req = (courseId: string) => ({ kind: 'course', courseId, minGrade: null, timing: 'prior_term' }) as const;
const course = (id: string, title: string, prerequisite: unknown, credits: number | 'unknown' = 3) => ({
  courseId: id, displayCode: id.replace('-', ' '), title, credits, prerequisite, sourceRefs: ['syn-src'], status: 'supported',
});
const group = (requirementId: string, courseId: string) => ({ requirementId, kind: 'course', courseId, sourceRefs: ['syn-src'], uncertainty: 'documented', overlap: { mode: 'forbidden' }, consumesCredits: true });

/** Deliberately long synthetic title to exercise wrapping at 375px. */
export const LONG_SYNTHETIC_TITLE = 'Synthetic Capstone Practicum in Integrated Information Systems Architecture, Governance, and Enterprise Data Stewardship';

export function syntheticCatalog(options: { blockingGap?: boolean; longTitles?: boolean } = {}): CatalogModel {
  const ref = options.blockingGap ? { ...SYNTHETIC_REF, catalogYearId: null } : SYNTHETIC_REF;
  const capstone = options.longTitles ? LONG_SYNTHETIC_TITLE : 'Synthetic Capstone';
  return CatalogModelSchema.parse({
    schemaVersion: 1, catalogRef: ref, approval: 'synthetic',
    courses: {
      'SYN-101': course('SYN-101', 'Synthetic Foundations', none),
      'SYN-102': course('SYN-102', 'Synthetic Methods', none),
      'SYN-201': course('SYN-201', 'Synthetic Systems', req('SYN-101')),
      'SYN-202': course('SYN-202', 'Synthetic Data', { kind: 'any', children: [req('SYN-101'), req('SYN-102')] }),
      'SYN-301': course('SYN-301', capstone,{ kind: 'all', children: [req('SYN-201'), req('SYN-202')] }),
      'SYN-310': course('SYN-310', 'Synthetic Seminar', { kind: 'unresolved', description: 'Synthetic permission rule', sourceRefs: ['syn-src'] }),
    },
    requirementGroups: [
      { requirementId: 'degree', kind: 'all', requirementIds: ['r101', 'r102', 'r201', 'r202', 'r301'], sourceRefs: ['syn-src'], uncertainty: 'documented', overlap: { mode: 'forbidden' }, consumesCredits: false },
      group('r101', 'SYN-101'), group('r102', 'SYN-102'), group('r201', 'SYN-201'), group('r202', 'SYN-202'), group('r301', 'SYN-301'),
    ],
    rootRequirementId: 'degree', equivalencies: [], gradeScale: null,
    policyGaps: options.blockingGap ? [{ policyId: 'syn-gap', description: 'Synthetic blocking policy gap', sourceRefs: ['syn-src'], blocksConclusions: true }] : [],
    validationResults: [],
  });
}

/** The exact approved catalog version identifiers; used only to exercise UI identity labels. */
export const CURRENT_VERSION = 'asu-cis-department-provisional-v1';
export const HISTORICAL_VERSION = 'asu-cis-guide-2019-2021-v1';

/**
 * PRESENTATION-ONLY pair: two catalogs that differ only in catalogVersion, mirroring how the two
 * approved configurations share institution, program, status and an unresolved year. Course
 * content stays the synthetic SYN-* set; nothing here asserts real ASU courses or rules.
 * `synthetic: true` keeps the synthetic rule-set status so the UI must not name a real curriculum.
 */
export function identityPairCatalogs(options: { synthetic?: boolean } = {}): CatalogModel[] {
  // A provisional catalog must retain blocking uncertainty (contract refinement).
  const base = syntheticCatalog({ blockingGap: !options.synthetic });
  return [CURRENT_VERSION, HISTORICAL_VERSION].map(catalogVersion => CatalogModelSchema.parse({
    ...base,
    approval: options.synthetic ? 'synthetic' : 'user_provisional',
    catalogRef: { ...SYNTHETIC_REF, catalogYearId: null, catalogVersion, ruleSetStatus: options.synthetic ? 'synthetic' : 'provisional' },
  }));
}
