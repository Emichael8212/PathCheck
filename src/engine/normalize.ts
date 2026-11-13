// E-owned authoritative normalization of raw proposed rows (manual, extracted or mixed)
// into AcademicRecord attempts. Gemini/G provisional identifiers are never trusted.
import { AcademicRecordSchema, CatalogModelSchema, ProposedRowSchema, ValidatedExtractedRowsSchema, term } from '../contracts';
import type { AcademicRecord, CatalogModel, CourseAttempt, ProposedRow, Result, SourceEvidence, TermId, ValidatedExtractedRows } from '../contracts';
import { classifyInstitution } from './policy';
import { courseCredits, stableId } from './util';

export type NormalizationInput = ValidatedExtractedRows | { kind: 'manual_rows'; rows: ProposedRow[] } | { kind: 'mixed_rows'; extracted: ValidatedExtractedRows | null; manualRows: ProposedRow[] };
export interface NormalizationOutput { record: AcademicRecord; unmatched: string[]; warnings: string[] }

const SEASONS: Record<string, TermId['season']> = { fall: 'fall', fa: 'fall', fal: 'fall', autumn: 'fall', spring: 'spring', sp: 'spring', spr: 'spring', summer: 'summer', su: 'summer', sum: 'summer', sm: 'summer' };
export function parseTerm(raw: string | null): TermId | null {
  if (raw === null) return null;
  const s = raw.trim().toLowerCase().replace(/[.,]/g, ' ');
  const yearOf = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let m = /^([a-z]+)\s*'?\s*(\d{4}|\d{2})$/.exec(s);
  if (m && SEASONS[m[1]!]) return safeTerm(yearOf(m[2]!), SEASONS[m[1]!]!);
  m = /^(\d{4})\s*[-/ ]?\s*([a-z]+)$/.exec(s);
  if (m && SEASONS[m[2]!]) return safeTerm(yearOf(m[1]!), SEASONS[m[2]!]!);
  return null;
}
function safeTerm(year: number, season: TermId['season']): TermId | null {
  return year >= 1900 && year <= 2300 ? term(year, season) : null;
}
export function canonicalCourseCode(raw: string): string | null {
  const m = /^([A-Z]{2,6})\s*[- ]?\s*([0-9]{3}[A-Z]?)$/.exec(raw.trim().toUpperCase().replace(/\s+/g, ' '));
  return m ? `${m[1]}-${m[2]}` : null;
}
export function parseCredits(raw: string | null): number | null | 'invalid' {
  if (raw === null || raw.trim() === '') return null;
  const m = /^\s*(\d{1,2}(?:\.\d{1,2})?)\s*$/.exec(raw);
  return m ? Number(m[1]) : 'invalid';
}
const STATUS_WORDS: Array<[RegExp, CourseAttempt['status']]> = [
  [/^(completed?|passed|pass|earned)$/, 'completed'],
  [/^(in[\s_-]?progress|ip|current|enrolled|registered)$/, 'in_progress'],
  [/^(failed|fail)$/, 'failed'],
  [/^(withdrawn|withdrew|withdraw|w)$/, 'withdrawn'],
  [/^(incomplete|inc)$/, 'incomplete'],
  [/^(transfer[\s_-]?pending|pending[\s_-]?transfer|transfer)$/, 'transfer_pending'],
  // An explicit "unknown" answer is a valid status (still unresolved), not an unrecognized word.
  [/^(unknown|not[\s_-]?known)$/, 'unknown'],
];
function parseStatus(raw: string | null): CourseAttempt['status'] | 'unrecognized' | null {
  if (raw === null || raw.trim() === '') return null;
  const s = raw.trim().toLowerCase();
  for (const [re, status] of STATUS_WORDS) if (re.test(s)) return status;
  return 'unrecognized';
}

// Grade tokens whose own label denotes failure, withdrawal, incompletion, audit or no credit.
// Seeing one on a "completed" row is a contradiction, never a policy decision about passing.
const NON_COMPLETION_GRADES = new Set(['F', 'W', 'WF', 'WP', 'WD', 'WU', 'I', 'IN', 'INC', 'IP', 'NC', 'NG', 'AU', 'U', 'FA', 'FN', 'X']);
const GENERIC_GRADE = /^([A-D][+-]?|F|P|S|CR)$/;
function recognizedGrade(grade: string, catalog: CatalogModel): boolean {
  if (NON_COMPLETION_GRADES.has(grade)) return true;
  return catalog.gradeScale ? catalog.gradeScale.ordered.some(g => g.toUpperCase() === grade) : GENERIC_GRADE.test(grade);
}

interface Collected { attempts: CourseAttempt[]; unmatched: string[]; warnings: string[]; unresolved: string[] }

function normalizeRow(row: ProposedRow, idPrefix: 'm' | 'x', source: 'manual' | 'extracted', catalog: CatalogModel, out: Collected, reviewNeeded: boolean): void {
  const attemptId = stableId('att', [idPrefix, row.rowId]);
  const issues: string[] = [];
  const warn = (code: string) => { issues.push(code); out.warnings.push(`${code}:${row.rowId}`); };
  // Page numbers only (unique, sorted); provenance quotes never leave the extraction boundary.
  const pages = [...new Set(row.provenance.map(p => p.page))].sort((a, b) => a - b);
  const evidence: SourceEvidence[] = [{
    sourceId: stableId('row', [idPrefix, row.rowId]), kind: source === 'manual' ? 'student_report' : 'derived', urlOrRef: null, observedAt: null,
    description: source === 'manual' ? 'Manually entered course row' : `Proposed transcript row${pages.length ? ` (${pages.length === 1 ? 'page' : 'pages'} ${pages.join(', ')})` : ''}`,
    verificationStatus: 'unverified',
  }];
  const institution = classifyInstitution(row.rawInstitution, source);
  const home = institution !== 'external';
  // Candidate match is retained (so prerequisite/audit checks report "unresolved", not a false
  // definite "missing"), but the row can never be provisional/definite on this provenance.
  if (institution === 'home_unverified') warn(row.rawInstitution === null || row.rawInstitution.trim() === '' ? 'institution_unknown' : 'institution_ambiguous');
  const parsedStatus = parseStatus(row.rawStatus);
  let status: CourseAttempt['status'] | null = parsedStatus === 'unrecognized' ? 'unknown' : parsedStatus;
  const transferFlag = !home || status === 'transfer_pending';
  const canonical = canonicalCourseCode(row.rawCourseCode);
  let normalizedCourseId: string | null = null;
  if (canonical === null) warn('unparseable_course_code');
  else if (transferFlag) warn('transfer_equivalency_unverified');
  else if (catalog.courses[canonical]) normalizedCourseId = canonical;
  else {
    const eq = catalog.equivalencies.filter(e => e.fromCourseId === canonical);
    const verified = [...new Set(eq.filter(e => e.status === 'verified').map(e => e.toCourseId))];
    if (verified.length === 1) {
      normalizedCourseId = verified[0]!;
      const e = eq.find(x => x.status === 'verified' && x.toCourseId === normalizedCourseId)!;
      evidence.push({ sourceId: stableId('equivalency', [canonical, normalizedCourseId]), kind: 'derived', urlOrRef: e.sourceRefs.join(','), observedAt: null, description: `Verified catalog equivalency ${canonical} -> ${normalizedCourseId}`, verificationStatus: 'verified' });
    } else if (verified.length > 1) warn('ambiguous_equivalency');
    else if (eq.length > 0) warn('equivalency_unresolved');
    else warn('course_not_in_catalog');
  }
  if (normalizedCourseId === null) out.unmatched.push(row.rowId);
  if (row.provisionalCourseId !== null && row.provisionalCourseId !== normalizedCourseId) warn('provisional_match_ignored');

  const catalogCredits = normalizedCourseId ? courseCredits(catalog, normalizedCourseId) : null;
  const bound = catalogCredits !== null ? Math.max(catalogCredits * 2, 1) : 12;
  const credit = (raw: string | null, label: string): number | null => {
    const v = parseCredits(raw);
    if (v === 'invalid') { warn(`invalid_${label}_credits`); return null; }
    if (v !== null && v > bound) { warn(`implausible_${label}_credits`); return null; }
    return v;
  };
  const attemptedCredits = credit(row.rawAttemptedCredits, 'attempted');
  let earnedCredits = credit(row.rawEarnedCredits, 'earned');
  if (earnedCredits !== null && attemptedCredits !== null && earnedCredits > attemptedCredits) { warn('earned_exceeds_attempted'); earnedCredits = null; }
  if (catalogCredits !== null && attemptedCredits !== null && attemptedCredits !== catalogCredits) warn('credit_mismatch_with_catalog');
  const termId = parseTerm(row.rawTerm);
  if (row.rawTerm !== null && termId === null) warn('unparseable_term');
  if (row.rawTerm === null) warn('missing_term');
  const grade = row.rawGrade === null || row.rawGrade.trim() === '' ? null : row.rawGrade.trim().toUpperCase();

  if (parsedStatus === 'unrecognized') warn('unrecognized_status');
  else if (parsedStatus === 'unknown') warn('status_reported_unknown');
  if (status === null) {
    // Only explicit earned credit with a recorded grade implies completion; never infer from grade letters.
    if (grade !== null && earnedCredits !== null && earnedCredits > 0) { status = 'completed'; warn('status_inferred_from_earned_credits'); }
    else { status = 'unknown'; warn('missing_status'); }
  }
  // Grade evidence is never interpreted as passing/minimum-grade policy. Grades that are
  // unrecognized, or that contradict the reported status/credits, only withhold certainty.
  if (grade !== null && !recognizedGrade(grade, catalog)) warn('unrecognized_grade');
  if (status === 'completed' && grade !== null && NON_COMPLETION_GRADES.has(grade)) warn('status_grade_contradiction');
  if ((status === 'failed' || status === 'withdrawn' || status === 'incomplete') && earnedCredits !== null && earnedCredits > 0) warn('status_credit_contradiction');
  if (transferFlag && status !== 'in_progress' && status !== 'failed' && status !== 'withdrawn') status = 'transfer_pending';
  if (status === 'completed' && earnedCredits === null) warn('completed_without_earned_credits');
  // Completed with zero earned credit on a course the catalog lists as carrying credit is a
  // contradiction (e.g. a misread column), not a grade judgment. Zero-credit catalog courses and
  // courses with unknown catalog credit are not flagged on this basis.
  if (status === 'completed' && earnedCredits === 0 && catalogCredits !== null && catalogCredits > 0) warn('completed_zero_earned_credit_contradiction');
  if (row.uncertainty.length > 0) warn('extraction_uncertainty');
  const confidence: CourseAttempt['confidence'] = issues.some(i => i !== 'provisional_match_ignored' && i !== 'credit_mismatch_with_catalog' && i !== 'status_inferred_from_earned_credits') ? 'unresolved' : 'provisional';
  if (confidence === 'unresolved' || reviewNeeded) out.unresolved.push(stableId('attempt', [attemptId]));
  out.attempts.push({
    attemptId, rawCourseCode: row.rawCourseCode, normalizedCourseId, institution: row.rawInstitution,
    origin: transferFlag ? 'transfer' : source === 'manual' ? 'manual' : 'transcript_proposal', term: termId,
    attemptedCredits, earnedCredits, grade, status, evidence, confidence,
  });
}

export function normalizeAttempts(input: NormalizationInput, catalogInput: CatalogModel): Result<NormalizationOutput> {
  const catalogParsed = CatalogModelSchema.safeParse(catalogInput);
  if (!catalogParsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_catalog' };
  const catalog = catalogParsed.data;
  let extracted: ValidatedExtractedRows | null = null; let manual: ProposedRow[] = [];
  if (input && typeof input === 'object' && 'kind' in input && input.kind === 'manual_rows') manual = input.rows;
  else if (input && typeof input === 'object' && 'kind' in input && input.kind === 'mixed_rows') { extracted = input.extracted; manual = input.manualRows; }
  else extracted = input as ValidatedExtractedRows;
  if (extracted !== null) {
    const parsed = ValidatedExtractedRowsSchema.safeParse(extracted);
    if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_extracted_rows' };
    extracted = parsed.data;
  }
  const manualParsed = manual.map(r => ProposedRowSchema.safeParse(r));
  if (manualParsed.some(r => !r.success)) return { ok: false, code: 'validation_error', reasonCode: 'invalid_manual_rows' };
  const manualRows = manualParsed.map(r => r.data!);
  if (new Set(manualRows.map(r => r.rowId)).size !== manualRows.length) return { ok: false, code: 'validation_error', reasonCode: 'duplicate_manual_row_id' };

  const out: Collected = { attempts: [], unmatched: [], warnings: [], unresolved: [] };
  if (extracted) {
    const e = extracted.extraction, review = e.acceptanceStatus !== 'accepted';
    if (review) { out.warnings.push('extraction_needs_review'); out.unresolved.push('extraction-review-required'); }
    if (e.completeness !== 'demonstrated') { out.warnings.push('extraction_completeness_unknown'); out.unresolved.push('extraction-completeness'); }
    // G's extraction-level warnings are preserved verbatim (IDs only, never quotes).
    for (const w of e.warnings) out.warnings.push(`extraction_warning:${w}`);
    for (const id of e.unrecognizedRows) { out.warnings.push(`unrecognized_extraction_row:${id}`); out.unresolved.push(stableId('unrecognized-row', [id])); }
    for (const row of e.rows) normalizeRow(row, 'x', 'extracted', catalog, out, review);
  }
  for (const row of manualRows) normalizeRow(row, 'm', 'manual', catalog, out, false);

  // Identical rows are flagged, never silently collapsed nor assumed to be legitimate repeats.
  const seen = new Map<string, string>();
  for (const a of out.attempts) {
    const key = JSON.stringify([a.normalizedCourseId ?? a.rawCourseCode.toUpperCase().replace(/\s+/g, ''), a.term?.sortIndex ?? null, a.grade, a.attemptedCredits]);
    const first = seen.get(key);
    if (first) { out.warnings.push(`possible_duplicate_row:${a.attemptId}`); out.unresolved.push(stableId('possible-duplicate', [first, a.attemptId])); }
    else seen.set(key, a.attemptId);
  }
  const record = AcademicRecordSchema.safeParse({ schemaVersion: 1, recordRevision: 0, courseAttempts: out.attempts, unresolvedItems: [...new Set(out.unresolved)] });
  if (!record.success) return { ok: false, code: 'validation_error', reasonCode: 'normalization_produced_invalid_record' };
  return { ok: true, value: { record: record.data, unmatched: out.unmatched, warnings: out.warnings } };
}
