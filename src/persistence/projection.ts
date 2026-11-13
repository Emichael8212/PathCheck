import { AcademicRecordSchema, PlanSchema } from '../contracts';
import type { AcademicRecord, Plan, Result } from '../contracts';

/** Client-side ceiling for one saved record+plan (database allows a larger 2 MiB envelope). */
export const MAX_PERSISTED_BYTES = 1024 * 1024;

const PDF_MARKERS = ['%PDF-', 'JVBERi0'] as const; // raw and base64-encoded PDF header

function containsRawDocument(value: unknown): boolean {
  if (typeof value === 'string') return PDF_MARKERS.some(m => value.includes(m));
  if (Array.isArray(value)) return value.some(containsRawDocument);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(containsRawDocument);
  return false;
}

/**
 * The only shape S writes to cloud or recovery storage: strict contract record + plan.
 * Strict schemas reject extraction-only fields (provenance, quote, rawPdf, analysis,
 * availability_json, ...). Embedded PDF payloads and oversized blobs are rejected.
 * Content is returned unchanged; S never rewrites local revisions.
 */
export function checkPersistableProjection(record: unknown, plan: unknown): Result<{ record: AcademicRecord; plan: Plan; bytes: number }> {
  const r = AcademicRecordSchema.safeParse(record), p = PlanSchema.safeParse(plan);
  if (!r.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_record' };
  if (!p.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_plan' };
  if (containsRawDocument(r.data) || containsRawDocument(p.data)) return { ok: false, code: 'validation_error', reasonCode: 'raw_document_content' };
  const bytes = new TextEncoder().encode(JSON.stringify(r.data)).length + new TextEncoder().encode(JSON.stringify(p.data)).length;
  if (bytes > MAX_PERSISTED_BYTES) return { ok: false, code: 'validation_error', reasonCode: 'payload_too_large' };
  return { ok: true, value: { record: r.data, plan: p.data, bytes } };
}

export function containsRawDocumentContent(value: unknown): boolean {
  return containsRawDocument(value);
}
