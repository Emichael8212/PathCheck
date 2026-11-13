import { CatalogModelSchema, TranscriptExtractionSchema, ValidatedExtractedRowsSchema } from '../contracts';
import type { CatalogModel, Result, TranscriptExtraction, ValidatedExtractedRows } from '../contracts';

/** G suggests exact catalog codes only. E alone interprets grades, credits and equivalency. */
export function validateExtraction(input: TranscriptExtraction, catalog: CatalogModel): Result<ValidatedExtractedRows> {
  const parsed = TranscriptExtractionSchema.safeParse(input);
  const model = CatalogModelSchema.safeParse(catalog);
  if (!parsed.success || !model.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_extraction' };
  if (parsed.data.acceptanceStatus === 'rejected') return { ok: false, code: 'unresolved', reasonCode: 'extraction_rejected_manual_entry' };
  // A model's assertion of completeness is not independent evidence. Until a supported
  // document coverage verifier exists, every proposal remains explicitly review-required.
  const rows = parsed.data.rows.map(row => {
    const code = row.rawCourseCode.trim().toUpperCase().replace(/^([A-Z][A-Z0-9]*)[ -]+([0-9]{3}[A-Z]?)$/, '$1-$2');
    const match = Object.hasOwn(model.data.courses, code) ? code : null;
    return { ...row, provisionalCourseId: match, uncertainty: [...new Set([...row.uncertainty, 'unverified_extraction', ...(match ? [] : ['unmapped_course'])])] };
  });
  const validated = ValidatedExtractedRowsSchema.safeParse({ kind: 'validated_proposed_rows', extraction: {
    ...parsed.data, rows, completeness: 'unknown', acceptanceStatus: 'needs_review',
    warnings: [...new Set([...parsed.data.warnings, 'independent_coverage_unverified', 'explicit_record_acceptance_required'])],
  } });
  return validated.success ? { ok: true, value: validated.data } : { ok: false, code: 'validation_error', reasonCode: 'invalid_extraction' };
}
