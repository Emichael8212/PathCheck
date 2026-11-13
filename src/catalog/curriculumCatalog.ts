// Executable CatalogModel built mechanically from a user-approved curriculum-only handoff
// (docs/curriculum, DECISIONS.md CAT-001..003). Nothing here is researched or inferred:
//  - structure and credits come only from the transcribed departmental guide / user attestation;
//  - prerequisites/corequisites are NOT sourced yet, so every course rule is `unresolved`;
//  - the formal catalog year stays null; every listed unresolved policy blocks conclusions;
//  - replacement slots (CIS 304->300, CIS 415->351) are directed `unresolved` equivalencies,
//    never automatic historical credit; no grade scale is introduced.
import { CatalogModelSchema, CurriculumBaselineSchema } from '../contracts';
import type { CatalogModel, CourseDefinition, CurriculumBaseline, RequirementGroup, SourceEvidence } from '../contracts';

const GUIDE = 'departmental-guide';
const PREREQ_NOTE = 'Prerequisite/corequisite rules are not sourced in this approved curriculum configuration';

const POLICY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'formal-catalog-applicability': 'Governing formal catalog year/cohort applicability is unverified',
  'historical-course-equivalency': 'Equivalency of replaced historical courses is unresolved',
  'substitution-authority': 'Course substitution authority and process are unresolved',
  'legacy-elective-eligibility': 'Eligibility of legacy-only elective courses is unresolved',
  'requirement-overlap-permissions': 'Whether one course may count toward multiple requirements is unresolved',
  'minimum-grade-current-applicability': 'Current minimum-grade requirements are unverified',
  'suspended-requirements-current-applicability': 'Current applicability of printed suspended requirements is unverified',
  'repeat-credit-policy': 'Repeat and credit-counting policy is unverified',
  'transfer-policy': 'Transfer credit and equivalency policy is unverified',
  'residency-and-gpa': 'Residency and GPA requirements are not modeled or verified',
  'prerequisite-corequisite-coverage': 'Prerequisite/corequisite rules have not been sourced for these courses',
  'term-specific-offerings': 'Term-specific course offerings are unknown',
};

export const requirementIds = Object.freeze({
  root: 'degree', electives: 'electives', sequence: 'sequence', total: 'total-degree-credits',
  block: (id: string) => `block:${id}`, course: (courseId: string) => `course:${courseId}`,
  choice: (blockId: string, i: number) => `choice:${blockId}:${i + 1}`,
  sequenceOption: (i: number) => `sequence:${i + 1}`, sequenceCourse: (i: number, courseId: string) => `sequence:${i + 1}:${courseId}`,
});

export function curriculumToCatalog(input: unknown): CatalogModel {
  const c: CurriculumBaseline = CurriculumBaselineSchema.parse(input);
  const sources: SourceEvidence[] = c.sources.map(s => ({ sourceId: s.id, kind: s.kind, urlOrRef: null, observedAt: null, description: s.description, verificationStatus: s.status }));
  const replacedBy = new Map(c.replacements.map(r => [r.newCourseId, r]));
  const refsFor = (courseId: string) => {
    const r = replacedBy.get(courseId);
    return r ? [GUIDE, r.sourceRef] : [GUIDE];
  };

  const courses: Record<string, CourseDefinition> = {};
  const addCourse = (courseId: string, title: string | null, credits: number | 'unknown') => {
    if (courses[courseId]) return;
    courses[courseId] = {
      courseId, displayCode: courseId.replace('-', ' '), title: title ?? `${courseId.replace('-', ' ')} (title not in source)`, credits,
      prerequisite: { kind: 'unresolved', description: PREREQ_NOTE, sourceRefs: [] }, sourceRefs: refsFor(courseId), status: 'pending',
    };
  };
  for (const b of c.blocks) {
    b.required.forEach(r => addCourse(r.courseId, r.title, r.credits));
    b.choices.forEach(ch => ch.courses.forEach(r => addCourse(r.courseId, r.title, r.credits)));
  }
  // Named elective(s) carry no credit value in the source: credits stay unknown.
  c.electives.eligibleNamedCourses.forEach(id => addCourse(id, null, 'unknown'));

  const overlapUnresolved = { mode: 'unresolved' as const };
  const groups: RequirementGroup[] = [];
  const blockIds: string[] = [];
  for (const b of c.blocks) {
    const children: string[] = [];
    for (const r of b.required) {
      const id = requirementIds.course(r.courseId); children.push(id);
      groups.push({ requirementId: id, kind: 'course', courseId: r.courseId, sourceRefs: refsFor(r.courseId), uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: true });
    }
    b.choices.forEach((ch, i) => {
      const id = requirementIds.choice(b.id, i); children.push(id);
      groups.push({ requirementId: id, kind: 'choose_n', courseIds: ch.courses.map(x => x.courseId), requirementIds: [], count: ch.choose, sourceRefs: [GUIDE], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: true });
    });
    const blockId = requirementIds.block(b.id); blockIds.push(blockId);
    groups.push({ requirementId: blockId, kind: 'all', requirementIds: children, sourceRefs: [GUIDE], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: true });
  }
  // Electives: 9 credits / 3 courses from named courses or 300/400-level COBA courses, excluding
  // required courses (CAT-003: CIS 300/351 cannot double count). The COBA prefix inventory and
  // legacy-only courses are not sourced, so eligibility outside named courses stays unresolved.
  groups.push({
    requirementId: requirementIds.electives, kind: 'min_credits', courseIds: [...c.electives.eligibleNamedCourses], minimum: c.electives.credits, minCourses: c.electives.courseCount,
    eligibility: { collegeId: 'coba', subjectPrefixes: null, minLevel: 300, maxLevel: 400, excludeRequirementIds: c.electives.excludeRequiredCourses ? [...blockIds] : [], sourceRefs: [GUIDE], inventoryStatus: 'unresolved' },
    sourceRefs: [GUIDE], uncertainty: c.electives.legacyEligibility === 'unresolved' ? 'unresolved' : 'documented', overlap: { mode: 'forbidden' }, consumesCredits: true,
  });
  // Sequence: constraint-only choice between two-course sequences; adds no credits.
  const seqOptions = c.sequence.alternatives.map((pair, i) => {
    const kids = pair.map(courseId => {
      const id = requirementIds.sequenceCourse(i, courseId);
      groups.push({ requirementId: id, kind: 'course', courseId, sourceRefs: [c.sequence.sourceRef], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: false });
      return id;
    });
    const id = requirementIds.sequenceOption(i);
    groups.push({ requirementId: id, kind: 'all', requirementIds: kids, sourceRefs: [c.sequence.sourceRef], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: false });
    return id;
  });
  groups.push({ requirementId: requirementIds.sequence, kind: 'choose_n', courseIds: [], requirementIds: seqOptions, count: c.sequence.choose, sourceRefs: [c.sequence.sourceRef], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: false });
  groups.push({ requirementId: requirementIds.total, kind: 'total_degree_credits', minimum: c.degreeCredits, sourceRefs: [GUIDE], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: true });
  groups.unshift({ requirementId: requirementIds.root, kind: 'all', requirementIds: [...blockIds, requirementIds.electives, requirementIds.sequence, requirementIds.total], sourceRefs: [...c.sourceRefs], uncertainty: 'documented', overlap: overlapUnresolved, consumesCredits: true });

  const policyGaps: CatalogModel['policyGaps'] = [
    ...c.unresolvedPolicies.map(policyId => ({ policyId, description: POLICY_DESCRIPTIONS[policyId] ?? `Unresolved policy: ${policyId}`, sourceRefs: [], blocksConclusions: true })),
    ...c.reportedPolicies.map(p => ({ policyId: `reported:${p.id}`, description: `${p.statement} (printed ${p.printedStatus}; current applicability unverified)`, sourceRefs: [GUIDE], blocksConclusions: true })),
    ...c.nonOfferingReports.map(r => ({ policyId: `non-offering:${r.courseId}`, description: `User-attested: ${r.courseId} not offered to ${r.scope.replaceAll('_', ' ')} since ${r.sinceYear}; not a university-wide assertion`, sourceRefs: [r.sourceRef], blocksConclusions: false })),
  ];
  return CatalogModelSchema.parse({
    schemaVersion: 1,
    catalogRef: { institutionId: 'asu', programId: 'bs-cis', catalogYearId: null, catalogVersion: c.version, ruleSetStatus: 'provisional', sources },
    approval: 'user_provisional', courses, requirementGroups: groups, rootRequirementId: requirementIds.root,
    equivalencies: c.replacements.map(r => ({ fromCourseId: r.oldCourseId, toCourseId: r.newCourseId, status: 'unresolved', sourceRefs: [r.sourceRef] })),
    gradeScale: null, policyGaps,
    validationResults: [`curriculum-variant:${c.variant}`, `printed-guide-label:${c.printedGuideLabel}`, 'formal-catalog-year:unresolved', 'authoritative-graduation-conclusions:disabled'],
  });
}
