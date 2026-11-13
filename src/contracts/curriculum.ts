import { z } from 'zod';
import { CourseIdSchema } from './academic';
import { CreditsSchema, IdSchema, unique } from './common';
const course = z.strictObject({ courseId: CourseIdSchema, title: z.string().min(1), credits: CreditsSchema });
// Curriculum-only source handoff; not a CatalogModel or executable academic evaluator.
export const CurriculumBaselineSchema = z.strictObject({
  schemaVersion: z.literal(1), version: IdSchema, variant: z.enum(['historical_reference', 'user_approved_provisional']),
  printedGuideLabel: z.literal('2019-2021'), formalCatalogYear: z.null(), degreeCredits: z.literal(121), sourceRefs: z.array(IdSchema),
  sources: z.array(z.strictObject({ id: IdSchema, kind: z.enum(['departmental_guide', 'user_attestation']), status: z.enum(['documented', 'user_attested']), description: z.string() })),
  blocks: z.array(z.strictObject({ id: IdSchema, credits: CreditsSchema, required: z.array(course), choices: z.array(z.strictObject({ choose: z.literal(1), courses: z.array(course).min(1) })) })),
  sequence: z.strictObject({ choose: z.literal(1), alternatives: z.array(z.array(CourseIdSchema).length(2)).length(2), additionalCredits: z.literal(0), sourceRef: IdSchema }),
  electives: z.strictObject({ credits: z.literal(9), courseCount: z.literal(3), eligibleNamedCourses: z.array(CourseIdSchema), eligibleCourseRule: z.string(), legacyOnlyCourses: z.array(CourseIdSchema), legacyEligibility: z.literal('unresolved'), excludeRequiredCourses: z.literal(true) }),
  reportedPolicies: z.array(z.strictObject({ id: IdSchema, statement: z.string(), printedStatus: z.enum(['required', 'suspended']), currentApplicability: z.literal('unverified') })),
  replacements: z.array(z.strictObject({ oldCourseId: CourseIdSchema, newCourseId: CourseIdSchema, credits: z.literal(3), sourceRef: IdSchema, formalEffectiveDate: z.null(), historicalEquivalency: z.literal('unresolved') })),
  nonOfferingReports: z.array(z.strictObject({ courseId: CourseIdSchema, sinceYear: z.literal(2023), scope: z.literal('undergraduate_cis_students'), sourceRef: IdSchema })),
  unresolvedPolicies: z.array(IdSchema).min(1), authoritativeGraduationConclusionsEnabled: z.literal(false),
}).superRefine((c, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const sources = new Set(c.sources.map(s => s.id));
  if (sources.size !== c.sources.length || [...c.sourceRefs, c.sequence.sourceRef, ...c.replacements.map(r => r.sourceRef), ...c.nonOfferingReports.map(r => r.sourceRef)].some(s => !sources.has(s))) issue('Unknown/duplicate source');
  if (!unique(c.blocks.map(b => b.id))) issue('Duplicate category');
  for (const b of c.blocks) {
    const required = b.required.reduce((sum, row) => sum + row.credits, 0);
    if (b.choices.some(ch => new Set(ch.courses.map(r => r.credits)).size !== 1 || !unique(ch.courses.map(r => r.courseId)))) issue('Ambiguous choice credits');
    const choiceCredits = b.choices.reduce((sum, ch) => sum + ch.courses[0]!.credits, 0);
    if (required + choiceCredits !== b.credits) issue('Category credits do not reconcile');
  }
  if (c.blocks.reduce<number>((sum, b) => sum + b.credits, c.electives.credits) !== c.degreeCredits) issue('Degree credits do not reconcile');
});
export type CurriculumBaseline = z.infer<typeof CurriculumBaselineSchema>;
