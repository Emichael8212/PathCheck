import type { CourseAttempt, ProposedRow } from '../contracts';
import { termFromIndex, termLabel } from './terms';

// Manual entry produces RAW proposed rows only. E's normalizeAttempts alone maps codes,
// credits, grades, terms and equivalencies into an academic record.

export const ATTEMPT_STATUSES = ['completed', 'in_progress', 'failed', 'withdrawn', 'incomplete', 'transfer_pending', 'unknown'] as const;
export type AttemptStatus = typeof ATTEMPT_STATUSES[number];
export const STATUS_LABEL: Record<AttemptStatus, string> = {
  completed: 'Completed', in_progress: 'In progress', failed: 'Failed', withdrawn: 'Withdrawn',
  incomplete: 'Incomplete', transfer_pending: 'Transfer (equivalency pending)', unknown: 'Unknown',
};

export interface ManualRowDraft {
  rowId: string;
  courseCode: string;
  title: string;
  /** TermId.sortIndex as string, or '' when not known. */
  termKey: string;
  attemptedCredits: string;
  earnedCredits: string;
  grade: string;
  status: AttemptStatus | '';
  /** Empty for home institution; otherwise the transfer institution name. */
  institution: string;
}

export function emptyRow(rowId: string): ManualRowDraft {
  return { rowId, courseCode: '', title: '', termKey: '', attemptedCredits: '', earnedCredits: '', grade: '', status: '', institution: '' };
}

export type RowErrors = Partial<Record<keyof ManualRowDraft, string>>;

const CREDIT = /^\d{1,2}(\.\d{1,2})?$/;

/** Input hygiene only (format/arithmetic), never academic eligibility. */
export function validateRow(row: ManualRowDraft): RowErrors {
  const errors: RowErrors = {};
  const code = row.courseCode.trim();
  if (code.length === 0) errors.courseCode = 'Enter a course code, for example CIS 206.';
  else if (code.length > 40 || !/^[A-Za-z]{2,6}\s*-?\s*\d{3}[A-Za-z]?$/.test(code)) errors.courseCode = 'Use a subject and number, for example CIS 206.';
  const attempted = row.attemptedCredits.trim(), earned = row.earnedCredits.trim();
  if (attempted && !CREDIT.test(attempted)) errors.attemptedCredits = 'Credits must be a non-negative number.';
  if (earned && !CREDIT.test(earned)) errors.earnedCredits = 'Credits must be a non-negative number.';
  if (!errors.attemptedCredits && !errors.earnedCredits && attempted && earned && Number(earned) > Number(attempted)) errors.earnedCredits = 'Earned credits cannot exceed attempted credits.';
  if (row.status === '') errors.status = 'Choose a status (Unknown is allowed).';
  if (row.grade.length > 8) errors.grade = 'Grade is too long.';
  return errors;
}

const blank = (v: string): string | null => (v.trim().length === 0 ? null : v.trim());

export function toProposedRow(row: ManualRowDraft): ProposedRow {
  return {
    rowId: row.rowId,
    rawCourseCode: row.courseCode.trim(),
    rawTitle: blank(row.title),
    rawTerm: row.termKey === '' ? null : termLabel(termFromIndex(Number(row.termKey))),
    rawAttemptedCredits: blank(row.attemptedCredits),
    rawEarnedCredits: blank(row.earnedCredits),
    rawGrade: blank(row.grade),
    rawStatus: row.status === '' ? null : row.status,
    rawInstitution: blank(row.institution),
    provisionalCourseId: null,
    provenance: [],
    uncertainty: [],
  };
}

/** Re-opens an accepted attempt for editing; values are copied, never reinterpreted. */
export function attemptToRow(a: CourseAttempt): ManualRowDraft {
  return {
    rowId: a.attemptId,
    courseCode: a.rawCourseCode,
    title: '',
    termKey: a.term ? String(a.term.sortIndex) : '',
    attemptedCredits: a.attemptedCredits === null ? '' : String(a.attemptedCredits),
    earnedCredits: a.earnedCredits === null ? '' : String(a.earnedCredits),
    grade: a.grade ?? '',
    status: a.status,
    institution: a.institution ?? '',
  };
}
