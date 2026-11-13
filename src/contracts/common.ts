import { z } from 'zod';
export const SCHEMA_VERSION = 1 as const;
export const IdSchema = z.string().min(1).max(160);
export const RevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const CreditsSchema = z.number().finite().nonnegative();
export const TimestampSchema = z.iso.datetime({ offset: true });
export const SourceEvidenceSchema = z.strictObject({
  sourceId: IdSchema,
  kind: z.enum(['official_catalog', 'departmental_guide', 'department_confirmation', 'user_attestation', 'student_report', 'derived', 'synthetic']),
  urlOrRef: z.string().nullable(), observedAt: TimestampSchema.nullable(), description: z.string().min(1),
  verificationStatus: z.enum(['documented', 'verified', 'user_attested', 'disputed', 'unverified', 'synthetic']),
});
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>;
export const TermIdSchema = z.strictObject({
  academicYear: z.number().int().min(1900).max(2300), season: z.enum(['spring', 'summer', 'fall']),
  sortIndex: z.number().int(),
}).refine(t => t.sortIndex === t.academicYear * 3 + ['spring', 'summer', 'fall'].indexOf(t.season), 'Noncanonical term order');
export type TermId = z.infer<typeof TermIdSchema>;
export function term(academicYear: number, season: TermId['season']): TermId {
  return TermIdSchema.parse({ academicYear, season, sortIndex: academicYear * 3 + ['spring', 'summer', 'fall'].indexOf(season) });
}
export const FailureCodeSchema = z.enum(['unavailable', 'unresolved', 'validation_error', 'forbidden', 'conflict', 'rate_limited', 'external_failure', 'stale_preview', 'stale_undo', 'known_hard_conflict', 'search_interrupted']);
export const TypedFailureSchema = z.strictObject({ ok: z.literal(false), code: FailureCodeSchema, reasonCode: IdSchema });
export type TypedFailure = z.infer<typeof TypedFailureSchema>;
export type Result<T> = { ok: true; value: T } | TypedFailure;
export function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }
