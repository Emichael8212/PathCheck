import { z } from 'zod';
import { AcademicRecordSchema, CatalogModelSchema, CatalogRefSchema, ConstraintStateSchema, CourseIdSchema } from './academic';
import { CreditsSchema, IdSchema, RevisionSchema, TermIdSchema, TimestampSchema, unique } from './common';
export const SEARCH_POLICY = Object.freeze({ version: 'search-v1', horizonTerms: 8, beamWidth: 24, maxExpansions: 1000, ordering: 'lexicographic-v1' });
export const SearchOptionsSchema = z.strictObject({ version: z.literal('search-v1'), horizonTerms: z.number().int().min(1).max(10), beamWidth: z.number().int().min(1).max(32), maxExpansions: z.number().int().min(1).max(1500), ordering: z.literal('lexicographic-v1') });
export const InputFingerprintSchema = z.string().regex(/^scenario-v1:sha256:[0-9a-f]{64}$/).brand<'InputFingerprint'>();
export type InputFingerprint = z.infer<typeof InputFingerprintSchema>;
export const PlanPlacementSchema = z.strictObject({
  placementId: IdSchema, courseId: CourseIdSchema, termId: TermIdSchema,
  origin: z.enum(['student_selected', 'adopted_suggestion', 'system_projection']), active: z.boolean(),
}).refine(p => p.origin !== 'system_projection' || !p.active, 'Unadopted projection cannot be active');
export type PlanPlacement = z.infer<typeof PlanPlacementSchema>;
export const AvailabilityEvidenceSchema = z.strictObject({
  courseId: CourseIdSchema, termId: TermIdSchema, report: z.enum(['listed', 'not_listed', 'unknown']),
  sourceKind: z.enum(['student_report', 'official_catalog', 'department_confirmation']), sourceRef: IdSchema,
  observedAt: TimestampSchema, notes: z.string().nullable(),
});
export type AvailabilityEvidence = z.infer<typeof AvailabilityEvidenceSchema>;
export const PlanSchema = z.strictObject({
  schemaVersion: z.literal(1), planId: IdSchema, planRevision: RevisionSchema, catalogRef: CatalogRefSchema,
  targetTerm: TermIdSchema, activePlacements: z.array(PlanPlacementSchema),
  acceptedDraft: z.strictObject({ draftId: IdSchema, adoptedAt: TimestampSchema }).nullable(),
  availabilityEvidence: z.array(AvailabilityEvidenceSchema), availabilityRevision: RevisionSchema, updatedAt: TimestampSchema,
}).superRefine((p, ctx) => {
  if (!unique(p.activePlacements.map(x => x.placementId)) || p.activePlacements.some(x => !x.active)) ctx.addIssue({ code: 'custom', message: 'Active placements must be unique and active' });
  if (!unique(p.availabilityEvidence.map(x => `${x.courseId}:${x.termId.sortIndex}`))) ctx.addIssue({ code: 'custom', message: 'Duplicate availability course/term' });
});
export type Plan = z.infer<typeof PlanSchema>;
export const PlanningScenarioSchema = z.strictObject({
  schemaVersion: z.literal(1), catalog: CatalogModelSchema, record: AcademicRecordSchema, plan: PlanSchema, engineVersion: IdSchema,
  assumptions: z.strictObject({
    terms: z.array(TermIdSchema).min(1), creditCapacity: z.array(z.strictObject({ termId: TermIdSchema, maximum: CreditsSchema, source: z.enum(['student', 'scenario_assumption', 'official']) })),
    evaluationPolicy: IdSchema, assumeFuturePass: z.boolean(), evaluatedAt: TimestampSchema,
  }), searchOptions: SearchOptionsSchema,
}).superRefine((s, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (JSON.stringify(s.plan.catalogRef) !== JSON.stringify(s.catalog.catalogRef)) issue('Plan/catalog mismatch');
  const terms = s.assumptions.terms.map(t => t.sortIndex);
  if (terms.some((t, i) => i > 0 && t <= terms[i - 1]!)) issue('Term horizon must be strictly ordered');
  const caps = s.assumptions.creditCapacity.map(c => c.termId.sortIndex);
  if (new Set(caps).size !== caps.length || caps.length !== terms.length || caps.some(t => !terms.includes(t))) issue('Explicit capacity required for every modeled term');
  if (s.plan.activePlacements.some(p => !s.catalog.courses[p.courseId] || !terms.includes(p.termId.sortIndex))) issue('Unknown active course or term');
  if (s.plan.availabilityEvidence.some(e => !s.catalog.courses[e.courseId])) issue('Unknown availability course');
  if (s.record.courseAttempts.some(a => a.normalizedCourseId !== null && !s.catalog.courses[a.normalizedCourseId])) issue('Unknown normalized course');
});
export type PlanningScenario = z.infer<typeof PlanningScenarioSchema>;
export const RuleFindingSchema = z.strictObject({
  findingId: IdSchema, code: IdSchema, severity: z.enum(['info', 'warning', 'error']), status: ConstraintStateSchema,
  courseIds: z.array(CourseIdSchema), termIds: z.array(TermIdSchema), requirementIds: z.array(IdSchema), sourceRefs: z.array(IdSchema),
  explanationParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), assumptions: z.array(IdSchema), nextAction: IdSchema.nullable(),
});
export type RuleFinding = z.infer<typeof RuleFindingSchema>;
export const DegreeAuditSchema = z.strictObject({
  requirements: z.array(z.strictObject({ requirementId: IdSchema, status: z.enum(['satisfied', 'unmet', 'unresolved']), attemptIds: z.array(IdSchema), applicableCredits: CreditsSchema.nullable(), sourceRefs: z.array(IdSchema) })),
  earnedCredits: CreditsSchema.nullable(), applicableCredits: CreditsSchema.nullable(), disputedRules: z.array(IdSchema),
  totalStatus: z.enum(['satisfied', 'unmet', 'unresolved']),
});
export type DegreeAudit = z.infer<typeof DegreeAuditSchema>;
export const OutlookSchema = z.strictObject({
  kind: z.enum(['conditional_path_found', 'target_at_risk', 'insufficient_evidence', 'known_constraints_block_current_plan', 'not_evaluated']),
  targetTerm: TermIdSchema, assumptionRefs: z.array(IdSchema), evidenceRefs: z.array(IdSchema),
});
export const AnalysisResultSchema = z.strictObject({
  inputFingerprint: InputFingerprintSchema, degreeAudit: DegreeAuditSchema, outlook: OutlookSchema,
  topFindings: z.array(RuleFindingSchema).max(3), evidenceGaps: z.array(IdSchema), bottlenecks: z.array(RuleFindingSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export const ChangeOperationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('add'), placement: PlanPlacementSchema }),
  z.strictObject({ kind: z.literal('move'), placementId: IdSchema, termId: TermIdSchema }),
  z.strictObject({ kind: z.literal('remove'), placementId: IdSchema }),
  z.strictObject({ kind: z.literal('swap'), firstPlacementId: IdSchema, secondPlacementId: IdSchema }),
]);
export const ChangeSetSchema = z.strictObject({ baseFingerprint: InputFingerprintSchema, operations: z.array(ChangeOperationSchema).min(1) });
export type ChangeSet = z.infer<typeof ChangeSetSchema>;
export const CandidatePreviewSchema = z.strictObject({
  previewId: IdSchema, baseFingerprint: InputFingerprintSchema, changeSet: ChangeSetSchema,
  proposedPlacements: z.array(PlanPlacementSchema), before: z.array(RuleFindingSchema), after: z.array(RuleFindingSchema),
  assumptions: z.array(IdSchema), benefitClass: z.enum(['improved', 'tradeoff', 'no_valid_alternative']),
  validabilityStatus: z.enum(['valid', 'conditional', 'invalid', 'unresolved']),
}).refine(p => p.baseFingerprint === p.changeSet.baseFingerprint && unique(p.proposedPlacements.map(x => x.placementId)), 'Inconsistent preview');
export type CandidatePreview = z.infer<typeof CandidatePreviewSchema>;
export const GeneratedDraftSchema = z.strictObject({
  draftId: IdSchema, baseFingerprint: InputFingerprintSchema, placements: z.array(PlanPlacementSchema),
  assumptions: z.array(IdSchema), validation: z.array(RuleFindingSchema),
}).refine(d => unique(d.placements.map(x => x.placementId)) && d.placements.every(p => p.origin === 'system_projection' && !p.active), 'Draft must be unadopted');
export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;
export const UndoCheckpointSchema = z.strictObject({
  checkpointId: IdSchema, beforeFingerprint: InputFingerprintSchema, afterFingerprint: InputFingerprintSchema, previousPlacements: z.array(PlanPlacementSchema), previousAcceptedDraft: PlanSchema.shape.acceptedDraft,
});
export type UndoCheckpoint = z.infer<typeof UndoCheckpointSchema>;
export const ExplicitUserActionSchema = z.strictObject({ actionId: IdSchema, kind: z.enum(['apply', 'adopt', 'undo']), acknowledgedAssumptions: z.array(IdSchema), occurredAt: TimestampSchema });
export type ExplicitUserAction = z.infer<typeof ExplicitUserActionSchema>;
