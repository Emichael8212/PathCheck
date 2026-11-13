import { AcademicRecordSchema, CatalogModelSchema, ValidatedExtractedRowsSchema } from '../contracts';
import type { AcademicService, CatalogModel, Result } from '../contracts';
// No alternate mapping path: G's provisional identifiers never become attempts here.
export function normalizeExtraction(input: unknown, catalog: CatalogModel, academic: Pick<AcademicService, 'normalizeAttempts'>): Result<{ record: import('../contracts').AcademicRecord; unmatched: string[]; warnings: string[]; extractionReviewStatus: 'accepted' | 'needs_review'; requiresExplicitRecordAcceptance: true }> {
  const rows = ValidatedExtractedRowsSchema.safeParse(input);
  const checkedCatalog = CatalogModelSchema.safeParse(catalog);
  if (!rows.success || !checkedCatalog.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_normalization_input' };
  const result = academic.normalizeAttempts(rows.data, checkedCatalog.data);
  if (!result.ok) return result;
  const checked = AcademicRecordSchema.safeParse(result.value.record);
  if (!checked.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_normalization_result' };
  return { ok: true, value: { ...result.value, record: checked.data, extractionReviewStatus: rows.data.extraction.acceptanceStatus as 'accepted' | 'needs_review', requiresExplicitRecordAcceptance: true } };
}
