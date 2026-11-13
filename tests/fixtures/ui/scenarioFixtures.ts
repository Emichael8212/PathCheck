// Synthetic scenarios for UI/export unit tests only. No real student data.
import { SEARCH_POLICY, term } from '../../../src/contracts';
import type { AcademicRecord, AnalysisResult, Plan, PlanningScenario } from '../../../src/contracts';
import { buildScenario } from '../../../src/ui/scenario';
import { fakeAcademic } from './fakeServices';
import { syntheticCatalog, SYNTHETIC_REF } from './syntheticCatalog';

export const CONFIG = Object.freeze({ engineVersion: 'fake-engine-test-only', evaluationPolicy: 'fake-policy', assumeFuturePass: true, searchOptions: SEARCH_POLICY });
export const TERMS = [term(2027, 'spring'), term(2027, 'fall'), term(2028, 'spring'), term(2028, 'fall')];

export function syntheticRecord(): AcademicRecord {
  return { schemaVersion: 1, recordRevision: 1, unresolvedItems: ['unmatched-r2'], courseAttempts: [
    { attemptId: 'r1', rawCourseCode: 'SYN 101', normalizedCourseId: 'SYN-101', institution: null, origin: 'manual', term: term(2026, 'spring'), attemptedCredits: 3, earnedCredits: 3, grade: 'SECRET-GRADE-A', status: 'completed', evidence: [], confidence: 'provisional' },
    { attemptId: 'r2', rawCourseCode: 'XFR 100', normalizedCourseId: null, institution: 'Synthetic College', origin: 'transfer', term: null, attemptedCredits: 3, earnedCredits: null, grade: null, status: 'transfer_pending', evidence: [], confidence: 'unresolved' },
  ] };
}

export function syntheticPlan(extra: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 1, planId: 'plan-1', planRevision: 3, catalogRef: SYNTHETIC_REF, targetTerm: term(2028, 'fall'),
    activePlacements: [
      { placementId: 'p201', courseId: 'SYN-201', termId: term(2027, 'spring'), origin: 'student_selected', active: true },
      { placementId: 'p301', courseId: 'SYN-301', termId: term(2027, 'spring'), origin: 'adopted_suggestion', active: true },
    ],
    acceptedDraft: { draftId: 'draft-1', adoptedAt: '2026-11-12T15:00:00.000Z' },
    availabilityEvidence: [{ courseId: 'SYN-201', termId: term(2027, 'spring'), report: 'listed', sourceKind: 'student_report', sourceRef: 'sr-1', observedAt: '2026-11-12T15:00:00.000Z', notes: null }],
    availabilityRevision: 1, updatedAt: '2026-11-12T15:00:00.000Z', ...extra,
  };
}

export function syntheticScenarioAndAnalysis(options: { blockingGap?: boolean; plan?: Plan } = {}): { scenario: PlanningScenario; analysis: AnalysisResult } {
  const catalog = syntheticCatalog({ blockingGap: options.blockingGap ?? false });
  const plan = options.plan ?? syntheticPlan({ catalogRef: catalog.catalogRef });
  const built = buildScenario({ catalog, record: syntheticRecord(), plan, terms: TERMS, capacity: { maximum: 15, source: 'scenario_assumption' }, config: CONFIG, evaluatedAt: '2026-11-12T15:00:00.000Z' });
  if (!built.ok) throw new Error('fixture scenario invalid');
  const analysis = fakeAcademic([catalog]).evaluate(built.value);
  if (!analysis.ok) throw new Error('fixture analysis failed');
  return { scenario: built.value, analysis: analysis.value };
}
