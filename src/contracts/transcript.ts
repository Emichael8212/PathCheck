import { z } from 'zod';
import { CourseIdSchema } from './academic';
import { IdSchema, TimestampSchema, unique } from './common';
// Raw fields stay strings: only E interprets grades, credits, terms and equivalency.
export const ProposedRowSchema = z.strictObject({
  rowId: IdSchema, rawCourseCode: z.string(), rawTitle: z.string().nullable(), rawTerm: z.string().nullable(),
  rawAttemptedCredits: z.string().nullable(), rawEarnedCredits: z.string().nullable(), rawGrade: z.string().nullable(), rawStatus: z.string().nullable(),
  rawInstitution: z.string().nullable(), provisionalCourseId: CourseIdSchema.nullable(),
  provenance: z.array(z.strictObject({ field: z.enum(['code', 'title', 'term', 'attemptedCredits', 'earnedCredits', 'grade', 'status', 'institution']), page: z.number().int().positive(), row: z.number().int().positive().nullable(), quote: z.string().nullable() })),
  uncertainty: z.array(IdSchema),
});
export type ProposedRow = z.infer<typeof ProposedRowSchema>;
export const TranscriptExtractionSchema = z.strictObject({
  schemaVersion: z.literal(1), documentPageCount: z.number().int().positive(), detectedRowCount: z.number().int().nonnegative().nullable(),
  rows: z.array(ProposedRowSchema), coveredPages: z.array(z.number().int().positive()), unrecognizedRows: z.array(IdSchema), warnings: z.array(IdSchema),
  completeness: z.enum(['demonstrated', 'unknown']), acceptanceStatus: z.enum(['accepted', 'needs_review', 'rejected']),
  modelId: IdSchema, extractionSchemaVersion: z.literal(1),
}).superRefine((e, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!unique(e.rows.map(r => r.rowId))) issue('Duplicate row IDs');
  if (new Set(e.coveredPages).size !== e.coveredPages.length || e.coveredPages.some(p => p > e.documentPageCount) || e.rows.some(r => r.provenance.some(p => p.page > e.documentPageCount))) issue('Invalid page coverage');
  if (e.acceptanceStatus === 'accepted' && (e.completeness !== 'demonstrated' || e.coveredPages.length !== e.documentPageCount || e.detectedRowCount !== e.rows.length || e.unrecognizedRows.length > 0)) issue('Accepted extraction requires complete accounted coverage');
});
export type TranscriptExtraction = z.infer<typeof TranscriptExtractionSchema>;
// This brand means G validated row shape/coverage, not academic truth.
export const ValidatedExtractedRowsSchema = z.strictObject({
  kind: z.literal('validated_proposed_rows'), extraction: TranscriptExtractionSchema,
}).refine(r => r.extraction.acceptanceStatus !== 'rejected', 'Rejected extraction cannot enter normalization').brand<'ValidatedExtractedRows'>();
export type ValidatedExtractedRows = z.infer<typeof ValidatedExtractedRowsSchema>;
export const ConsentReceiptSchema = z.strictObject({
  receiptId: IdSchema, sessionId: IdSchema, disclosureVersion: IdSchema, processor: z.literal('gemini'), purpose: z.literal('course_extraction'),
  grantedAt: TimestampSchema, revokedAt: TimestampSchema.nullable(),
});
export const TicketClaimsSchema = z.strictObject({
  schemaVersion: z.literal(1), ticketId: IdSchema, sessionId: IdSchema, consentReceiptId: IdSchema,
  audience: z.literal('extract-transcript'), documentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: TimestampSchema, expiresAt: TimestampSchema,
}).refine(t => Date.parse(t.expiresAt) > Date.parse(t.issuedAt) && Date.parse(t.expiresAt) - Date.parse(t.issuedAt) <= 5 * 60_000, 'Ticket lifetime exceeds five minutes');
export const AdmissionRequestSchema = z.strictObject({
  signedTicket: z.string().min(1).max(4096), consentReceiptId: IdSchema,
});
export type AdmissionRequest = z.infer<typeof AdmissionRequestSchema>;
export type TicketClaims = z.infer<typeof TicketClaimsSchema>;
export const ADMISSION_LIMITS = Object.freeze({ ticketTtlSeconds: 300, sessionRequestsPerHour: 3, networkRequestsPerHour: 20, sessionConcurrent: 1, networkConcurrent: 3, maxPdfBytes: 10 * 1024 * 1024, maxPages: 20 });
// No default approved environment or budget. Missing server configuration denies egress.
export const ProcessingEligibilitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('disabled'), reasonCode: IdSchema }),
  z.strictObject({ status: z.literal('approved'), reviewId: IdSchema, termsVersion: IdSchema, paidProjectId: IdSchema,
    approvedUntil: TimestampSchema, dailyCostCeilingMicrousd: z.number().int().positive(), perRequestReservationMicrousd: z.number().int().positive() }),
]);
export type ProcessingEligibility = z.infer<typeof ProcessingEligibilitySchema>;
export const TicketIssueRequestSchema = z.strictObject({
  botAttestation: z.string().min(1).max(8192), disclosureVersion: IdSchema,
  explicitConsent: z.literal(true), documentDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TicketIssueRequest = z.infer<typeof TicketIssueRequestSchema>;

export const RevokeConsentRequestSchema = z.strictObject({ consentReceiptId: IdSchema });
export type RevokeConsentRequest = z.infer<typeof RevokeConsentRequestSchema>;
