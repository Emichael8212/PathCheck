// Entirely synthetic. No student or actual ASU academic rules.
import { PlanningScenarioSchema, SEARCH_POLICY } from './planning';
import type { PlanningScenario } from './planning';
import { term } from './common';
export function syntheticScenario(): PlanningScenario {
  const source = { sourceId: 'synthetic', kind: 'synthetic', urlOrRef: null, observedAt: null, description: 'Synthetic contract fixture; not ASU policy', verificationStatus: 'synthetic' };
  const ref = { institutionId: 'asu', programId: 'bs-cis', catalogYearId: 'synthetic-only', catalogVersion: 'synthetic-v1', ruleSetStatus: 'synthetic', sources: [source] };
  return PlanningScenarioSchema.parse({
    schemaVersion: 1,
    catalog: { schemaVersion: 1, catalogRef: ref, approval: 'synthetic', courses: {
      'TEST-101': { courseId: 'TEST-101', displayCode: 'TEST 101', title: 'Synthetic course', credits: 3, prerequisite: { kind: 'unresolved', description: 'Synthetic unknown rule', sourceRefs: ['synthetic'] }, sourceRefs: ['synthetic'], status: 'pending' },
    }, requirementGroups: [{ requirementId: 'required', kind: 'course', courseId: 'TEST-101', sourceRefs: ['synthetic'], uncertainty: 'unresolved', overlap: 'forbidden' }], policyGaps: [{ policyId: 'unknown-rule', description: 'Unresolved synthetic policy', sourceRefs: ['synthetic'], blocksConclusions: true }], validationResults: [] },
    record: { schemaVersion: 1, recordRevision: 0, courseAttempts: [], unresolvedItems: [] },
    plan: { schemaVersion: 1, planId: 'synthetic-plan', planRevision: 0, catalogRef: ref, targetTerm: term(2030, 'fall'),
      activePlacements: [{ placementId: 'p1', courseId: 'TEST-101', termId: term(2030, 'fall'), origin: 'student_selected', active: true }],
      acceptedDraft: null, availabilityEvidence: [{ courseId: 'TEST-101', termId: term(2030, 'fall'), report: 'unknown', sourceKind: 'student_report', sourceRef: 'synthetic-report', observedAt: '2030-01-01T00:00:00Z', notes: null }], availabilityRevision: 0, updatedAt: '2030-01-01T00:00:00Z' },
    engineVersion: 'synthetic-engine-v1', assumptions: { terms: [term(2030, 'spring'), term(2030, 'fall')], creditCapacity: [{ termId: term(2030, 'spring'), maximum: 12, source: 'scenario_assumption' }, { termId: term(2030, 'fall'), maximum: 12, source: 'scenario_assumption' }], evaluationPolicy: 'synthetic-policy', assumeFuturePass: false, evaluatedAt: '2030-01-01T00:00:00Z' }, searchOptions: SEARCH_POLICY,
  });
}
export const rawRows = { kind: 'validated_proposed_rows', extraction: {
 schemaVersion: 1, documentPageCount: 1, detectedRowCount: null, coveredPages: [1], unrecognizedRows: [], completeness: 'unknown', acceptanceStatus: 'needs_review', modelId: 'synthetic', extractionSchemaVersion: 1,
 rows: [{ rowId: 'r1', rawCourseCode: 'UNKNOWN 999', rawTitle: null, rawTerm: null, rawAttemptedCredits: 'three?', rawEarnedCredits: '999', rawGrade: 'unknown', rawStatus: null, rawInstitution: null, provisionalCourseId: 'TEST-101', provenance: [], uncertainty: ['ambiguous'] }], warnings: ['ambiguous'] } };
