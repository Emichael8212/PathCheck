// ENTIRELY SYNTHETIC engine fixtures. TEST-/SYN- course codes and rules are invented for
// algorithm testing only; they are NOT Alabama State University policy or catalog data,
// and no student, transcript or personal information appears here.
import { CatalogModelSchema, PlanningScenarioSchema, SEARCH_POLICY, term } from '../../../src/contracts';
import type { CatalogModel, CourseAttempt, CourseDefinition, PlanPlacement, PlanningScenario, PrerequisiteExpr, RequirementGroup, TermId } from '../../../src/contracts';

export const SYN = 'synthetic-src';
export const syntheticSource = { sourceId: SYN, kind: 'synthetic' as const, urlOrRef: null, observedAt: null, description: 'Synthetic engine fixture; not ASU policy', verificationStatus: 'synthetic' as const };
export const syntheticRef = { institutionId: 'asu' as const, programId: 'bs-cis' as const, catalogYearId: 'synthetic-only', catalogVersion: 'synthetic-engine-v1', ruleSetStatus: 'synthetic' as const, sources: [syntheticSource] };

export const NONE: PrerequisiteExpr = { kind: 'all', children: [] };
export const pre = (courseId: string, minGrade: string | null = null): PrerequisiteExpr => ({ kind: 'course', courseId, minGrade, timing: 'prior_term' });
export const coreq = (courseId: string, concurrencyAllowed = true, priorCompletionAllowed = true): PrerequisiteExpr => ({ kind: 'corequisite', courseId, policy: { concurrencyAllowed, priorCompletionAllowed } });
export const all = (...children: PrerequisiteExpr[]): PrerequisiteExpr => ({ kind: 'all', children });
export const any = (...children: PrerequisiteExpr[]): PrerequisiteExpr => ({ kind: 'any', children });
export const unresolvedRule = (description = 'Synthetic unsourced permission'): PrerequisiteExpr => ({ kind: 'unresolved', description, sourceRefs: [SYN] });

export function course(courseId: string, credits: number | 'unknown' = 3, prerequisite: PrerequisiteExpr = NONE): CourseDefinition {
  return { courseId, displayCode: courseId.replace('-', ' '), title: `Synthetic ${courseId}`, credits, prerequisite, sourceRefs: [SYN], status: 'supported' };
}
type Base = Partial<Pick<RequirementGroup, 'overlap' | 'consumesCredits' | 'uncertainty'>>;
const base = (requirementId: string, o: Base = {}) => ({ requirementId, sourceRefs: [SYN], uncertainty: o.uncertainty ?? 'documented', overlap: o.overlap ?? { mode: 'forbidden' as const }, consumesCredits: o.consumesCredits ?? true });
export const reqCourse = (id: string, courseId: string, o?: Base): RequirementGroup => ({ ...base(id, o), kind: 'course', courseId });
export const reqAll = (id: string, requirementIds: string[], o?: Base): RequirementGroup => ({ ...base(id, o), kind: 'all', requirementIds });
export const chooseCourses = (id: string, count: number, courseIds: string[], o?: Base): RequirementGroup => ({ ...base(id, o), kind: 'choose_n', courseIds, requirementIds: [], count });
export const chooseGroups = (id: string, count: number, requirementIds: string[], o?: Base): RequirementGroup => ({ ...base(id, o), kind: 'choose_n', courseIds: [], requirementIds, count });
export const minCredits = (id: string, minimum: number, courseIds: string[], o?: Base & { minCourses?: number; eligibility?: Extract<RequirementGroup, { kind: 'min_credits' }>['eligibility'] }): RequirementGroup => ({ ...base(id, o), kind: 'min_credits', courseIds, minimum, minCourses: o?.minCourses ?? 0, eligibility: o?.eligibility ?? null });
export const totalCredits = (id: string, minimum: number, o?: Base): RequirementGroup => ({ ...base(id, o), kind: 'total_degree_credits', minimum });

export interface CatalogOptions {
  equivalencies?: CatalogModel['equivalencies']; gradeScale?: CatalogModel['gradeScale'];
  policyGaps?: CatalogModel['policyGaps']; root?: string;
  /** Omitted = legacy (no field); null = explicit unknown. Synthetic source only. */
  repeatCreditPolicy?: CatalogModel['repeatCreditPolicy'];
}
export function catalog(courses: CourseDefinition[], groups: RequirementGroup[], o: CatalogOptions = {}): CatalogModel {
  return CatalogModelSchema.parse({
    schemaVersion: 1, catalogRef: syntheticRef, approval: 'synthetic',
    courses: Object.fromEntries(courses.map(c => [c.courseId, c])), requirementGroups: groups,
    rootRequirementId: o.root ?? groups[0]!.requirementId, equivalencies: o.equivalencies ?? [], gradeScale: o.gradeScale ?? null,
    policyGaps: o.policyGaps ?? [], validationResults: [],
    ...(o.repeatCreditPolicy !== undefined ? { repeatCreditPolicy: o.repeatCreditPolicy } : {}),
  });
}
/** SYNTHETIC repeat-credit rule for algorithm tests only; not an ASU policy. */
export const synRepeatPolicy = (courseIds: string[], qualifyingGrades = ['A', 'B', 'C']): NonNullable<CatalogModel['repeatCreditPolicy']> =>
  ({ courseIds, creditCounting: 'once_per_course', selection: 'latest_qualifying', qualifyingGrades, sourceRefs: [SYN] });
export const SYN_GRADES = { ordered: ['A', 'B', 'C', 'D', 'F'], sourceRefs: [SYN] };

let seq = 0;
export function attempt(courseId: string | null, o: Partial<CourseAttempt> = {}): CourseAttempt {
  seq++;
  return {
    attemptId: o.attemptId ?? `a${seq}`, rawCourseCode: o.rawCourseCode ?? (courseId ?? 'XYZ 999').replace('-', ' '), normalizedCourseId: courseId,
    institution: o.institution ?? null, origin: o.origin ?? 'manual', term: o.term === undefined ? term(2024, 'fall') : o.term,
    attemptedCredits: o.attemptedCredits === undefined ? 3 : o.attemptedCredits, earnedCredits: o.earnedCredits === undefined ? 3 : o.earnedCredits,
    grade: o.grade === undefined ? 'B' : o.grade, status: o.status ?? 'completed', evidence: [], confidence: o.confidence ?? 'provisional',
  };
}
export const T = (year: number, season: TermId['season']) => term(year, season);
export const horizon = (n = 4, startYear = 2026): TermId[] => {
  const seasons: TermId['season'][] = ['spring', 'fall'];
  return Array.from({ length: n }, (_, i) => term(startYear + Math.floor(i / 2), seasons[i % 2]!));
};
export function place(courseId: string, t: TermId, placementId = `p-${courseId}-${t.sortIndex}`, origin: PlanPlacement['origin'] = 'student_selected'): PlanPlacement {
  return { placementId, courseId, termId: t, origin, active: origin !== 'system_projection' };
}

export interface ScenarioOptions {
  attempts?: CourseAttempt[]; placements?: PlanPlacement[]; terms?: TermId[]; target?: TermId; capacity?: number;
  availability?: PlanningScenario['plan']['availabilityEvidence']; searchOptions?: PlanningScenario['searchOptions'];
}
export function scenario(cat: CatalogModel, o: ScenarioOptions = {}): PlanningScenario {
  const terms = o.terms ?? horizon();
  return PlanningScenarioSchema.parse({
    schemaVersion: 1, catalog: cat,
    record: { schemaVersion: 1, recordRevision: 0, courseAttempts: o.attempts ?? [], unresolvedItems: [] },
    plan: { schemaVersion: 1, planId: 'syn-plan', planRevision: 0, catalogRef: cat.catalogRef, targetTerm: o.target ?? terms[terms.length - 1]!, activePlacements: o.placements ?? [], acceptedDraft: null, availabilityEvidence: o.availability ?? [], availabilityRevision: 0, updatedAt: '2026-01-01T00:00:00Z' },
    engineVersion: 'pathcheck-engine-v1',
    assumptions: { terms, creditCapacity: terms.map(t => ({ termId: t, maximum: o.capacity ?? 15, source: 'scenario_assumption' })), evaluationPolicy: 'synthetic-policy', assumeFuturePass: true, evaluatedAt: '2026-01-01T00:00:00Z' },
    searchOptions: o.searchOptions ?? SEARCH_POLICY,
  });
}
export function report(courseId: string, t: TermId, r: 'listed' | 'not_listed' | 'unknown'): PlanningScenario['plan']['availabilityEvidence'][number] {
  return { courseId, termId: t, report: r, sourceKind: 'student_report', sourceRef: `syn-report-${courseId}-${t.sortIndex}`, observedAt: '2026-01-01T00:00:00Z', notes: null };
}
