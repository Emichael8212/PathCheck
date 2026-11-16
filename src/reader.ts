// What a reader says it found on a transcript is not trusted. Whatever reads the PDF (a
// service at M2; a prepared answer for each made-up transcript at M1) returns a list of
// rows, and this plain code checks every one before it can count:
//
//   - a row that passes becomes a transcript row, matched to the curriculum by its code;
//   - a row that fails is set aside with what was read and why, for the student to fix;
//   - a totals line returned as if it were a course is thrown away.
//
// Only named fields are read, one by one. Nothing else in the answer is looked at or kept.
import { findCourse, type Curriculum, type Grades } from './curriculum';
import { countsByElectiveRule } from './placement';
import { courseStandings, rowStanding, type CourseStanding, type TranscriptRow } from './transcript';

/** The answer was not a list of rows at all: nothing can be read from it. */
export class ReaderError extends Error {
  constructor() {
    super('The transcript could not be read.');
    this.name = 'ReaderError';
  }
}

/** What is wrong with a row, by the field it is wrong in. */
export type Problem = 'not-a-row' | 'term' | 'transfer' | 'code' | 'credits' | 'earned' | 'points' | 'grade' | 'description';

/** How a row's course code matches the curriculum. A row that matches nothing can fill nothing. */
export type Match = 'listed' | 'elective' | 'none';

/** A row that passed the check. */
export interface ReadRow {
  /** Its position in the reader's answer, from 0. */
  readonly line: number;
  readonly row: TranscriptRow;
  /** The description as printed. It is shown, never used to match or to count. */
  readonly description: string;
  readonly match: Match;
}

/** What was read of a row, as text, so that it can be shown and fixed. */
export interface Seen {
  readonly term: string;
  /** Whether it was read as transfer credit; null when the reader did not say true or false. */
  readonly transfer: boolean | null;
  readonly prefix: string;
  readonly number: string;
  readonly description: string;
  readonly attempted: string;
  readonly grade: string;
}

/** A row that failed the check. It counts nothing. */
export interface RowToFix {
  readonly line: number;
  readonly problems: readonly Problem[];
  readonly seen: Seen;
}

export interface Reading {
  readonly rows: readonly ReadRow[];
  readonly toFix: readonly RowToFix[];
  /** Totals lines that a reader returned as rows: neither courses nor rows to fix. */
  readonly thrownAway: number;
}

/** The most credits a single row may show as attempted: a sanity mark, not a rule of the degree. */
export const MOST_ATTEMPTED = 30;

// Lines of a transcript that are not courses. A row is thrown away only when it carries
// one of these and is not a course code as well.
const NOT_COURSES = ['transfer term gpa', 'combined gpa', 'term gpa', 'academic standing', 'transfer totals'];

type Fields = { readonly [key: string]: unknown };
const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A field of the row itself, by name: nothing inherited, nothing unnamed. */
const field = (row: Fields, name: string): unknown => (Object.hasOwn(row, name) ? row[name] : undefined);
const shown = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
const empty = (value: unknown): boolean => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** A number, or text that is a plain decimal number as a transcript prints it ("3.00"); otherwise nothing. */
function plainNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value || 0 : null;
  if (typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim())) return Number(value.trim());
  return null;
}
const twoDecimalsAtMost = (value: number): boolean => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

/** The course code from its two parts, each checked on its own; or nothing. */
function codeOf(prefix: unknown, number: unknown): string | null {
  // Plain letters as printed: a letter that only becomes one in capitals (a dotless i, a long s) is not a prefix.
  const typed = typeof prefix === 'string' ? prefix.trim() : '';
  const letters = /^[A-Za-z]{2,4}$/.test(typed) ? typed.toUpperCase() : '';
  const digits = typeof number === 'string' ? number.trim() : typeof number === 'number' && Number.isInteger(number) ? String(number) : '';
  return /^[A-Z]{2,4}$/.test(letters) && /^\d{3}$/.test(digits) ? `${letters} ${digits}` : null;
}

// The prefix or the description is one of the phrases, alone, or followed by its figures or
// by a colon and words: "Term GPA 2.55", "Academic Standing: Good Standing". Anything
// longer ("Midterm GPA Review", "Academic Standing Seminar") is a row to look at.
const TOTALS_LINE = new RegExp(`^\\s*(${NOT_COURSES.join('|')})(\\s*:.*|[\\s\\d.]*)$`, 'i');
const isTotalsLine = (row: Fields): boolean => [field(row, 'prefix'), field(row, 'description')].some(text => typeof text === 'string' && TOTALS_LINE.test(text));

function matchOf(code: string, curriculum: Curriculum): Match {
  return findCourse(curriculum, code).length > 0 ? 'listed' : countsByElectiveRule(curriculum, code) ? 'elective' : 'none';
}

/**
 * Checks a reader's answer row by row. Throws `ReaderError` when the answer is not a list
 * of rows; otherwise every row ends up passed, to fix, or thrown away.
 */
export function readRows(answer: unknown, curriculum: Curriculum): Reading {
  try {
    return check(answer, curriculum);
  } catch {
    // Whatever went wrong, the caller hears one thing, and nothing of the answer is used.
    throw new ReaderError();
  }
}

function check(answer: unknown, curriculum: Curriculum): Reading {
  const list = isObject(answer) ? field(answer, 'rows') : undefined;
  if (!Array.isArray(list)) throw new ReaderError();

  const rows: ReadRow[] = [];
  const toFix: RowToFix[] = [];
  let thrownAway = 0;

  for (let line = 0; line < list.length; line++) {
    const raw: unknown = list[line];
    if (!isObject(raw)) {
      toFix.push({ line, problems: ['not-a-row'], seen: { term: '', transfer: null, prefix: '', number: '', description: '', attempted: '', grade: '' } });
      continue;
    }
    const term = field(raw, 'term');
    const transfer = field(raw, 'transfer');
    const description = field(raw, 'description');
    const attempted = field(raw, 'attempted');
    const grade = field(raw, 'grade');
    const code = codeOf(field(raw, 'prefix'), field(raw, 'number'));
    if (code === null && isTotalsLine(raw)) {
      thrownAway++;
      continue;
    }

    const problems: Problem[] = [];
    if (typeof term !== 'string' || term.trim() === '') problems.push('term');
    if (transfer !== true && transfer !== false) problems.push('transfer');
    if (code === null) problems.push('code');
    if (description !== undefined && description !== null && typeof description !== 'string') problems.push('description');

    // Credits: only ever shown, never counted. Transfer credit may come without them.
    const credits = transfer === true && empty(attempted) ? 0 : plainNumber(attempted);
    if (credits === null || credits > MOST_ATTEMPTED || !twoDecimalsAtMost(credits)) problems.push('credits');
    for (const name of ['earned', 'points'] as const) {
      const value = field(raw, name);
      if (!empty(value) && plainNumber(value) === null) problems.push(name);
    }

    // The grade: text or nothing, and then judged by the one judge of grades. The grade
    // column of transfer credit is not a grade and is not judged.
    const printed = typeof grade === 'string' && grade.trim() !== '' ? grade.trim() : null;
    if (!empty(grade) && typeof grade !== 'string') problems.push('grade');

    if (problems.length === 0 && code !== null && credits !== null && typeof term === 'string' && typeof transfer === 'boolean') {
      const row: TranscriptRow = { code, term, credits, grade: printed, transfer };
      if (rowStanding(row, curriculum.grades) !== 'unrecognised') {
        rows.push({ line, row, description: typeof description === 'string' ? description : '', match: matchOf(code, curriculum) });
        continue;
      }
      problems.push('grade');
    } else if (transfer === false && printed !== null && !problems.includes('grade')
      && rowStanding({ code: '', term: '', credits: 0, grade: printed, transfer: false }, curriculum.grades) === 'unrecognised') {
      // A row with another fault still says so when its grade is not a grade.
      problems.push('grade');
    }

    toFix.push({
      line,
      problems,
      seen: {
        term: shown(term),
        transfer: typeof transfer === 'boolean' ? transfer : null,
        prefix: shown(field(raw, 'prefix')),
        number: shown(field(raw, 'number')),
        description: shown(description),
        attempted: shown(attempted),
        grade: shown(grade),
      },
    });
  }

  return { rows, toFix, thrownAway };
}

/**
 * The course standings of a checked reading: of the rows that passed, and of those only.
 * This is the one way from a reader's answer to placing courses.
 */
export const standingsOf = (reading: Reading, grades: Grades): CourseStanding[] => courseStandings(reading.rows.map(read => read.row), grades);
