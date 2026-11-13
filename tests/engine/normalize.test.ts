// T-DATA: E-owned normalization of raw proposed rows (manual / extracted / mixed). Synthetic only.
import { describe, expect, it } from 'vitest';
import { AcademicRecordSchema, term } from '../../src/contracts';
import type { ProposedRow, ValidatedExtractedRows } from '../../src/contracts';
import { rawRows } from '../../src/contracts/synthetic.test-fixtures';
import { normalizeAttempts, parseTerm } from '../../src/engine';
import { SYN, catalog, course, reqCourse } from '../fixtures/engine/synthetic';

const cat = catalog([course('TEST-101'), course('TEST-102'), course('TEST-300')], [reqCourse('r', 'TEST-101')], {
  equivalencies: [
    { fromCourseId: 'OLD-101', toCourseId: 'TEST-101', status: 'verified', sourceRefs: [SYN] },
    { fromCourseId: 'OLD-300', toCourseId: 'TEST-300', status: 'unresolved', sourceRefs: [SYN] },
    { fromCourseId: 'AMB-100', toCourseId: 'TEST-101', status: 'verified', sourceRefs: [SYN] },
    { fromCourseId: 'AMB-100', toCourseId: 'TEST-102', status: 'verified', sourceRefs: [SYN] },
  ],
});
const row = (rowId: string, o: Partial<ProposedRow> = {}): ProposedRow => ({
  rowId, rawCourseCode: 'TEST 101', rawTitle: null, rawTerm: 'Fall 2024', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed',
  rawInstitution: null, provisionalCourseId: null, provenance: [], uncertainty: [], ...o,
});
const manual = (...rows: ProposedRow[]) => normalizeAttempts({ kind: 'manual_rows', rows }, cat);
const one = (o: Partial<ProposedRow>) => { const r = manual(row('r1', o)); if (!r.ok) throw new Error(r.reasonCode); return { ...r.value, a: r.value.record.courseAttempts[0]! }; };

describe('T-DATA normalization cases', () => {
  it('1 duplicate identical rows are flagged, never collapsed', () => {
    const r = manual(row('r1'), row('r2')); if (!r.ok) throw new Error();
    expect(r.value.record.courseAttempts).toHaveLength(2);
    expect(r.value.warnings.some(w => w.startsWith('possible_duplicate_row'))).toBe(true);
    expect(r.value.record.unresolvedItems.some(i => i.startsWith('possible-duplicate'))).toBe(true);
  });
  it('2 repeats in different terms remain distinct attempts', () => {
    const r = manual(row('r1', { rawStatus: 'failed', rawEarnedCredits: '0', rawGrade: 'F', rawTerm: 'Spring 2024' }), row('r2')); if (!r.ok) throw new Error();
    expect(r.value.record.courseAttempts.map(a => a.status)).toEqual(['failed', 'completed']);
    expect(new Set(r.value.record.courseAttempts.map(a => a.attemptId)).size).toBe(2);
  });
  it('3 completed vs in-progress statuses', () => {
    expect(one({ rawStatus: 'In Progress', rawEarnedCredits: null, rawGrade: null }).a.status).toBe('in_progress');
    expect(one({}).a.status).toBe('completed');
  });
  it('4 withdrawal', () => expect(one({ rawStatus: 'W', rawEarnedCredits: '0', rawGrade: 'W' }).a.status).toBe('withdrawn'));
  it('5 fail', () => expect(one({ rawStatus: 'failed', rawEarnedCredits: '0', rawGrade: 'F' }).a.status).toBe('failed'));
  it('6 unknown status word stays unknown and unresolved; grade letters never imply status', () => {
    const r = one({ rawStatus: 'zz-unknown' });
    expect(r.a.status).toBe('unknown'); expect(r.a.confidence).toBe('unresolved');
    expect(one({ rawStatus: null, rawEarnedCredits: null, rawGrade: 'A' }).a.status).toBe('unknown');
  });
  it('7 attempted vs earned credits kept separate; earned > attempted rejected', () => {
    const r = one({ rawAttemptedCredits: '3', rawEarnedCredits: '0', rawStatus: 'failed' });
    expect([r.a.attemptedCredits, r.a.earnedCredits]).toEqual([3, 0]);
    const bad = one({ rawAttemptedCredits: '3', rawEarnedCredits: '4' });
    expect(bad.a.earnedCredits).toBeNull(); expect(bad.warnings).toContain('earned_exceeds_attempted:r1'); expect(bad.a.confidence).toBe('unresolved');
  });
  it('8 transfer work stays transfer_pending and unmapped even with a matching code', () => {
    const r = one({ rawInstitution: 'Synthetic Community College' });
    expect(r.a.status).toBe('transfer_pending'); expect(r.a.origin).toBe('transfer'); expect(r.a.normalizedCourseId).toBeNull();
    expect(r.unmatched).toEqual(['r1']);
  });
  it('9 rejected/unmapped code retained as unresolved raw attempt', () => {
    const r = one({ rawCourseCode: 'NOPE 999' });
    expect(r.a.normalizedCourseId).toBeNull(); expect(r.a.rawCourseCode).toBe('NOPE 999'); expect(r.warnings).toContain('course_not_in_catalog:r1');
    expect(one({ rawCourseCode: '???' }).warnings).toContain('unparseable_course_code:r1');
  });
  it('10 aliases: only a unique VERIFIED equivalency maps; unresolved/ambiguous stay unmapped', () => {
    expect(one({ rawCourseCode: 'OLD 101' }).a.normalizedCourseId).toBe('TEST-101');
    expect(one({ rawCourseCode: 'OLD 300' }).a.normalizedCourseId).toBeNull();
    expect(one({ rawCourseCode: 'OLD 300' }).warnings).toContain('equivalency_unresolved:r1');
    expect(one({ rawCourseCode: 'AMB 100' }).a.normalizedCourseId).toBeNull();
    expect(one({ rawCourseCode: 'test-101' }).a.normalizedCourseId).toBe('TEST-101');
  });
  it('11 impossible / malformed credits become null with warnings', () => {
    expect(one({ rawAttemptedCredits: '-3' }).a.attemptedCredits).toBeNull();
    expect(one({ rawEarnedCredits: '999' }).a.earnedCredits).toBeNull();
    expect(one({ rawEarnedCredits: 'three' }).warnings).toContain('invalid_earned_credits:r1');
  });
  it('12 term chronology parsing uses canonical sortIndex; unparseable terms flagged', () => {
    expect(parseTerm('Fall 2024')).toEqual(term(2024, 'fall'));
    expect(parseTerm('2025 Spring')).toEqual(term(2025, 'spring'));
    expect(parseTerm('SU24')).toEqual(term(2024, 'summer'));
    expect(parseTerm('Term 7')).toBeNull();
    expect(term(2025, 'spring').sortIndex).toBeGreaterThan(term(2024, 'fall').sortIndex);
    expect(one({ rawTerm: 'whenever' }).warnings).toContain('unparseable_term:r1');
  });
  it('13 wrong schema version / invalid input rejected with typed failure', () => {
    expect(normalizeAttempts({ kind: 'manual_rows', rows: [{ ...row('r1'), extra: 1 } as ProposedRow] }, cat)).toMatchObject({ ok: false, code: 'validation_error' });
    const badExtraction = { kind: 'validated_proposed_rows', extraction: { ...rawRows.extraction, schemaVersion: 2 } } as unknown as ValidatedExtractedRows;
    expect(normalizeAttempts(badExtraction, cat)).toMatchObject({ ok: false, code: 'validation_error' });
    expect(normalizeAttempts({ kind: 'manual_rows', rows: [] }, { ...cat, schemaVersion: 2 } as unknown as typeof cat)).toMatchObject({ ok: false, reasonCode: 'invalid_catalog' });
  });
  it('14 rejected extraction cannot enter normalization', () => {
    const rejected = { kind: 'validated_proposed_rows', extraction: { ...rawRows.extraction, acceptanceStatus: 'rejected' } } as unknown as ValidatedExtractedRows;
    expect(normalizeAttempts(rejected, cat)).toMatchObject({ ok: false, code: 'validation_error' });
  });
});

describe('Gemini boundary: schema-valid malicious rows stay unresolved (T-SEC normalization)', () => {
  it('provisional Gemini course IDs are ignored and absurd fields never count', () => {
    const r = normalizeAttempts(rawRows as unknown as ValidatedExtractedRows, cat); if (!r.ok) throw new Error(r.reasonCode);
    const a = r.value.record.courseAttempts[0]!;
    expect(a.normalizedCourseId).toBeNull(); // provisional TEST-101 ignored for raw 'UNKNOWN 999'
    expect(a.earnedCredits).toBeNull(); expect(a.attemptedCredits).toBeNull(); expect(a.confidence).toBe('unresolved');
    expect(r.value.warnings).toEqual(expect.arrayContaining(['extraction_needs_review', 'extraction_completeness_unknown', 'provisional_match_ignored:r1']));
  });
  it('needs-review extraction marks every attempt for review; mixed rows keep provenance', () => {
    const ext = { kind: 'validated_proposed_rows', extraction: { ...rawRows.extraction, rows: [{ ...rawRows.extraction.rows[0]!, rowId: 'x1', rawCourseCode: 'TEST 101', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'A', rawStatus: 'completed', rawTerm: 'Fall 2024', uncertainty: [] }] } } as unknown as ValidatedExtractedRows;
    const r = normalizeAttempts({ kind: 'mixed_rows', extracted: ext, manualRows: [row('m1', { rawCourseCode: 'TEST 102' })] }, cat); if (!r.ok) throw new Error();
    const [x, m] = r.value.record.courseAttempts;
    expect(x!.origin).toBe('transcript_proposal'); expect(m!.origin).toBe('manual');
    expect(x!.attemptId).not.toBe(m!.attemptId);
    expect(r.value.record.unresolvedItems).toContain(`attempt:${x!.attemptId}`);
    expect(JSON.stringify(r.value.record)).not.toContain('quote');
  });
});

describe('round trip and determinism', () => {
  it('serialized record preserves every attempt and metadata; same input -> same output', () => {
    const input = { kind: 'manual_rows' as const, rows: [row('r1'), row('r2', { rawTerm: 'Spring 2025', rawStatus: 'in progress', rawEarnedCredits: null, rawGrade: null })] };
    const a = normalizeAttempts(input, cat), b = normalizeAttempts(structuredClone(input), cat);
    expect(a).toEqual(b); if (!a.ok) throw new Error();
    expect(AcademicRecordSchema.parse(JSON.parse(JSON.stringify(a.value.record)))).toEqual(a.value.record);
  });
});
