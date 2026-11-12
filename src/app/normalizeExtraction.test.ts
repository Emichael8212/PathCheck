import { expect, it, vi } from 'vitest';
import { normalizeExtraction } from './normalizeExtraction';
import { rawRows, syntheticScenario } from '../contracts/synthetic.test-fixtures';
import type { AcademicService } from '../contracts';
it('routes raw rows to E without applying provisional mappings or invented credits', () => {
  const s = syntheticScenario();
  const normalizeAttempts = vi.fn<AcademicService['normalizeAttempts']>(() => ({ ok: true, value: { record: s.record, unmatched: ['r1'], warnings: ['unresolved'] } }));
  const result = normalizeExtraction(rawRows, s.catalog, { normalizeAttempts });
  expect(normalizeAttempts).toHaveBeenCalledOnce();
  expect(normalizeAttempts.mock.calls[0]![0]).toEqual(rawRows);
  expect(result).toMatchObject({ ok: true, value: { record: { courseAttempts: [] }, unmatched: ['r1'] } });
});
it('does not call E on invalid rows and propagates E failures', () => {
  const s = syntheticScenario();
  const normalizeAttempts = vi.fn<AcademicService['normalizeAttempts']>(() => ({ ok: false, code: 'unresolved', reasonCode: 'catalog_unavailable' }));
  expect(normalizeExtraction({ courseAttempts: [] }, s.catalog, { normalizeAttempts }).ok).toBe(false);
  expect(normalizeAttempts).not.toHaveBeenCalled();
  expect(normalizeExtraction(rawRows, s.catalog, { normalizeAttempts })).toEqual({ ok: false, code: 'unresolved', reasonCode: 'catalog_unavailable' });
});
it('blocks rejected extraction and preserves the review gate on incomplete proposals', () => {
  const s = syntheticScenario();
  const normalizeAttempts = vi.fn<AcademicService['normalizeAttempts']>(() => ({ ok: true, value: { record: s.record, unmatched: [], warnings: [] } }));
  expect(normalizeExtraction({ ...rawRows, extraction: { ...rawRows.extraction, acceptanceStatus: 'rejected' } }, s.catalog, { normalizeAttempts }).ok).toBe(false);
  expect(normalizeAttempts).not.toHaveBeenCalled();
  expect(normalizeExtraction(rawRows, s.catalog, { normalizeAttempts })).toMatchObject({ ok: true, value: { extractionReviewStatus: 'needs_review', requiresExplicitRecordAcceptance: true } });
});
