import { describe, expect, it } from 'vitest';
import { syntheticScenario } from '../../src/contracts/synthetic.test-fixtures';
import { validateExtraction } from '../../src/transcript';
import { extraction, labeledCases, row } from '../fixtures/transcripts/synthetic';

describe('raw-row validation, never academic normalization', () => {
  it.each(labeledCases)('retains all labeled fields and attempts: $name', fixture => {
    const result = validateExtraction(extraction({ rows: fixture.rows, detectedRowCount: fixture.rows.length, documentPageCount: 2, coveredPages: [1, 2] }), syntheticScenario().catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extraction.rows).toHaveLength(fixture.rows.length);
    result.value.extraction.rows.forEach((actual, i) => {
      const expected = fixture.rows[i]!;
      for (const field of ['rawCourseCode', 'rawTitle', 'rawTerm', 'rawAttemptedCredits', 'rawEarnedCredits', 'rawGrade', 'rawStatus', 'rawInstitution', 'provenance'] as const) expect(actual[field]).toEqual(expected[field]);
    });
    expect(result.value.extraction.acceptanceStatus).toBe('needs_review');
    expect(result.value.extraction.completeness).toBe('unknown');
  });
  it('cannot trust schema-valid model claims of complete coverage', () => {
    const result = validateExtraction(extraction({ acceptanceStatus: 'accepted', completeness: 'demonstrated' }), syntheticScenario().catalog);
    expect(result).toMatchObject({ ok: true, value: { extraction: { acceptanceStatus: 'needs_review', completeness: 'unknown' } } });
  });
  it('discards invented provisional matching, retains unknown raw rows', () => {
    const result = validateExtraction(extraction({ rows: [row({ rawCourseCode: 'ALIEN 999', provisionalCourseId: 'SYN-101' })] }), syntheticScenario().catalog);
    expect(result).toMatchObject({ ok: true, value: { extraction: { rows: [{ rawCourseCode: 'ALIEN 999', provisionalCourseId: null, uncertainty: ['unverified_extraction', 'unmapped_course'] }] } } });
  });
  it.each(['rejected', 'duplicate', 'impossible-page'] as const)('blocks invalid extraction %s', kind => {
    const value = extraction(kind === 'rejected' ? { acceptanceStatus: 'rejected' } : kind === 'duplicate' ? { rows: [row(), row()] } : { coveredPages: [2] });
    expect(validateExtraction(value, syntheticScenario().catalog).ok).toBe(false);
  });
});
