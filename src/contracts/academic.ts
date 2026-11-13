import { z } from 'zod';
import { CreditsSchema, IdSchema, RevisionSchema, SourceEvidenceSchema, TermIdSchema, unique } from './common';
export const CourseIdSchema = z.string().regex(/^[A-Z][A-Z0-9]*-[0-9]{3}[A-Z]?$/);
export const CatalogRefSchema = z.strictObject({
  institutionId: z.literal('asu'), programId: z.literal('bs-cis'), catalogYearId: IdSchema.nullable(),
  catalogVersion: IdSchema, ruleSetStatus: z.enum(['verified', 'provisional', 'disputed', 'awaiting_document', 'synthetic']),
  sources: z.array(SourceEvidenceSchema).min(1),
});
export type CatalogRef = z.infer<typeof CatalogRefSchema>;
export type PrerequisiteExpr =
  | { kind: 'all' | 'any'; children: PrerequisiteExpr[] }
  | { kind: 'course'; courseId: string; minGrade: string | null; timing: 'prior_term' }
  | { kind: 'corequisite'; courseId: string; policy: { concurrencyAllowed: boolean; priorCompletionAllowed: boolean } }
  | { kind: 'unresolved'; description: string; sourceRefs: string[] };
export const PrerequisiteExprSchema: z.ZodType<PrerequisiteExpr> = z.lazy(() => z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('all'), children: z.array(PrerequisiteExprSchema) }),
  z.strictObject({ kind: z.literal('any'), children: z.array(PrerequisiteExprSchema).min(1) }),
  z.strictObject({ kind: z.literal('course'), courseId: CourseIdSchema, minGrade: z.string().nullable(), timing: z.literal('prior_term') }),
  z.strictObject({ kind: z.literal('corequisite'), courseId: CourseIdSchema, policy: z.strictObject({ concurrencyAllowed: z.boolean(), priorCompletionAllowed: z.boolean() }).refine(p => p.concurrencyAllowed || p.priorCompletionAllowed, 'No permitted corequisite timing') }),
  z.strictObject({ kind: z.literal('unresolved'), description: z.string().min(1), sourceRefs: z.array(IdSchema) }),
]));
export const CourseDefinitionSchema = z.strictObject({
  courseId: CourseIdSchema, displayCode: z.string().min(1), title: z.string().min(1),
  credits: z.union([CreditsSchema, z.literal('unknown')]), prerequisite: PrerequisiteExprSchema,
  sourceRefs: z.array(IdSchema).min(1), status: z.enum(['supported', 'pending']),
});
export type CourseDefinition = z.infer<typeof CourseDefinitionSchema>;
const groupBase = { requirementId: IdSchema, sourceRefs: z.array(IdSchema).min(1),
  uncertainty: z.enum(['documented', 'unresolved', 'disputed']),
  overlap: z.discriminatedUnion('mode', [z.strictObject({ mode: z.literal('forbidden') }), z.strictObject({ mode: z.literal('shared_with'), requirementIds: z.array(IdSchema).min(1) }), z.strictObject({ mode: z.literal('unresolved') })]), consumesCredits: z.boolean() };
export const RequirementGroupSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...groupBase, kind: z.literal('course'), courseId: CourseIdSchema }),
  z.strictObject({ ...groupBase, kind: z.literal('all'), requirementIds: z.array(IdSchema).min(1) }),
  z.strictObject({ ...groupBase, kind: z.literal('choose_n'), courseIds: z.array(CourseIdSchema), requirementIds: z.array(IdSchema), count: z.number().int().positive() }).refine(g => (g.courseIds.length === 0) !== (g.requirementIds.length === 0) && unique(g.courseIds) && unique(g.requirementIds) && g.count <= g.courseIds.length + g.requirementIds.length, 'Invalid alternatives'),
  z.strictObject({ ...groupBase, kind: z.literal('min_credits'), courseIds: z.array(CourseIdSchema), minimum: CreditsSchema, minCourses: z.number().int().nonnegative(), eligibility: z.strictObject({ collegeId: IdSchema.nullable(), subjectPrefixes: z.array(IdSchema).nullable(), minLevel: z.number().int().nonnegative(), maxLevel: z.number().int().nonnegative(), excludeRequirementIds: z.array(IdSchema), sourceRefs: z.array(IdSchema).min(1), inventoryStatus: z.enum(['complete', 'unresolved']) }).nullable() }).refine(g => g.courseIds.length > 0 || g.eligibility !== null, 'Missing eligibility'),
  z.strictObject({ ...groupBase, kind: z.literal('total_degree_credits'), minimum: CreditsSchema }),
]);
export type RequirementGroup = z.infer<typeof RequirementGroupSchema>;
export const PolicyGapSchema = z.strictObject({ policyId: IdSchema, description: z.string().min(1), sourceRefs: z.array(IdSchema), blocksConclusions: z.boolean() });
export const CatalogModelSchema = z.strictObject({
  schemaVersion: z.literal(1), catalogRef: CatalogRefSchema,
  approval: z.enum(['reviewed', 'user_provisional', 'unreviewed', 'synthetic']),
  courses: z.record(CourseIdSchema, CourseDefinitionSchema), requirementGroups: z.array(RequirementGroupSchema),
  rootRequirementId: IdSchema,
  equivalencies: z.array(z.strictObject({ fromCourseId: CourseIdSchema, toCourseId: CourseIdSchema, status: z.enum(['verified', 'unresolved', 'disputed']), sourceRefs: z.array(IdSchema).min(1) })),
  gradeScale: z.strictObject({ ordered: z.array(z.string().min(1)).min(1), sourceRefs: z.array(IdSchema).min(1) }).nullable(),
  policyGaps: z.array(PolicyGapSchema), validationResults: z.array(z.string()),
}).superRefine((c, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const courseIds = new Set(Object.keys(c.courses));
  const sourceIds = new Set(c.catalogRef.sources.map(s => s.sourceId));
  const groups = new Map(c.requirementGroups.map(g => [g.requirementId, g]));
  if (groups.size !== c.requirementGroups.length || sourceIds.size !== c.catalogRef.sources.length) issue('Duplicate source or requirement ID');
  const sourcesExist = (refs: string[]) => refs.forEach(r => { if (!sourceIds.has(r)) issue('Unknown source reference'); });
  const checkExpr = (expr: PrerequisiteExpr): void => {
    if ('children' in expr) expr.children.forEach(checkExpr);
    else if ('courseId' in expr && !courseIds.has(expr.courseId)) issue('Unknown prerequisite course');
    else if (expr.kind === 'unresolved') sourcesExist(expr.sourceRefs);
  };
  for (const [key, course] of Object.entries(c.courses)) {
    if (key !== course.courseId) issue('Course key mismatch');
    sourcesExist(course.sourceRefs); checkExpr(course.prerequisite);
  }
  if (!groups.has(c.rootRequirementId)) issue('Unknown degree root');
  if (c.gradeScale) { sourcesExist(c.gradeScale.sourceRefs); if (!unique(c.gradeScale.ordered)) issue('Duplicate grade scale entry'); }
  c.equivalencies.forEach(e => { sourcesExist(e.sourceRefs); if (!courseIds.has(e.toCourseId)) issue('Unknown equivalency destination'); });
  c.policyGaps.forEach(g => sourcesExist(g.sourceRefs));
  for (const g of c.requirementGroups) {
    sourcesExist(g.sourceRefs);
    const ids = 'courseIds' in g ? g.courseIds : 'courseId' in g ? [g.courseId] : [];
    if (!unique(ids) || ids.some(id => !courseIds.has(id))) issue('Invalid requirement course references');
    if (g.overlap.mode === 'shared_with' && (!unique(g.overlap.requirementIds) || g.overlap.requirementIds.some(id => !groups.has(id) || id === g.requirementId))) issue('Invalid overlap references');
    if (g.kind === 'min_credits' && g.eligibility) { sourcesExist(g.eligibility.sourceRefs); if (g.eligibility.minLevel > g.eligibility.maxLevel || g.eligibility.excludeRequirementIds.some(id => !groups.has(id))) issue('Invalid eligibility'); }
    if ((g.kind === 'all' || g.kind === 'choose_n') && (!unique(g.requirementIds) || g.requirementIds.some(id => !groups.has(id)))) issue('Invalid requirement group references');
  }
  const visit = (id: string, path: Set<string>): void => {
    if (path.has(id)) { issue('Cyclic requirement groups'); return; }
    const g = groups.get(id);
    if (g?.kind === 'all' || g?.kind === 'choose_n') g.requirementIds.forEach(child => visit(child, new Set([...path, id])));
  };
  for (const id of groups.keys()) visit(id, new Set());
  if (c.approval === 'user_provisional' && c.catalogRef.ruleSetStatus !== 'provisional') issue('Provisional approval/status mismatch');
  if ((c.approval === 'synthetic') !== (c.catalogRef.ruleSetStatus === 'synthetic')) issue('Synthetic approval/status mismatch');
  if (c.approval === 'reviewed' && (c.catalogRef.ruleSetStatus !== 'verified' || c.catalogRef.catalogYearId === null)) issue('Reviewed catalog requires verified applicability');
  if (c.catalogRef.ruleSetStatus === 'provisional' && !c.policyGaps.some(g => g.blocksConclusions)) issue('Provisional catalog must retain blocking uncertainty');
});
export type CatalogModel = z.infer<typeof CatalogModelSchema>;
export const CourseAttemptSchema = z.strictObject({
  attemptId: IdSchema, rawCourseCode: z.string().min(1), normalizedCourseId: CourseIdSchema.nullable(),
  institution: z.string().nullable(), origin: z.enum(['manual', 'transcript_proposal', 'transfer']), term: TermIdSchema.nullable(),
  attemptedCredits: CreditsSchema.nullable(), earnedCredits: CreditsSchema.nullable(), grade: z.string().nullable(),
  status: z.enum(['completed', 'in_progress', 'failed', 'withdrawn', 'incomplete', 'transfer_pending', 'unknown']),
  evidence: z.array(SourceEvidenceSchema), confidence: z.enum(['reviewed', 'provisional', 'unresolved']),
}).refine(a => a.earnedCredits === null || a.attemptedCredits === null || a.earnedCredits <= a.attemptedCredits, 'Earned credits exceed attempted credits');
export type CourseAttempt = z.infer<typeof CourseAttemptSchema>;
export const AcademicRecordSchema = z.strictObject({
  schemaVersion: z.literal(1), recordRevision: RevisionSchema, courseAttempts: z.array(CourseAttemptSchema), unresolvedItems: z.array(IdSchema),
}).refine(r => unique(r.courseAttempts.map(a => a.attemptId)), 'Duplicate attempt ID');
export type AcademicRecord = z.infer<typeof AcademicRecordSchema>;
export const ConstraintStateSchema = z.strictObject({ status: z.enum(['satisfied', 'unsatisfied', 'unresolved']), conditional: z.boolean() });
