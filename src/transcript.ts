// What a transcript row is worth, and what a course is worth after repeats.
//
// A standing says only what the grade earned. "Passed" is not "counts toward the degree":
// whether a course is in the curriculum, and which requirement it fills, is decided when
// courses are placed. The grade scale is the curriculum's; no grade is written here.
import { normalizeCode, type Grades } from './curriculum';

/** One course line as read from a transcript. */
export interface TranscriptRow {
  readonly code: string;
  /** The term heading as printed. */
  readonly term: string;
  /** Credits attempted. */
  readonly credits: number;
  /** The grade column as printed; null when it is empty. */
  readonly grade: string | null;
  /** Listed under transfer credit (transfer, AP and CLEP are all listed that way). */
  readonly transfer: boolean;
}

export type Standing =
  /** A grade at or above the lowest that counts, or transfer credit with no grade shown. */
  | 'passed'
  /** No grade yet: assumed to pass, but not passed. */
  | 'in-progress'
  /** A grade on the scale, below the lowest that counts. */
  | 'must-repeat'
  /** A mark that never counts. */
  | 'no-credit'
  /** The grade column holds something that is not on the scale. It never passes. */
  | 'unrecognised';

export interface JudgedRow {
  readonly row: TranscriptRow;
  readonly standing: Standing;
}

export interface CourseStanding {
  /** The course code in its normal form. */
  readonly code: string;
  readonly standing: Standing;
  /** The row that gives the course its standing. */
  readonly deciding: JudgedRow;
  /** Every row of the course, each with its own standing, in transcript order. */
  readonly rows: readonly JudgedRow[];
}

// A course takes the first of these that any of its rows has. In progress comes right
// after passed: the course is assumed to pass and must not be scheduled again. "Must
// repeat" is said only when no row leaves the outcome open, and a later mark that earns no
// credit does not undo it. Every standing must have a place here; the type checks that.
const PLACE: Record<Standing, number> = { 'passed': 0, 'in-progress': 1, 'unrecognised': 2, 'must-repeat': 3, 'no-credit': 4 };

/** The grade column, without spaces and in capitals; empty when no grade is shown. */
const mark = (grade: string | null | undefined): string => (grade ?? '').trim().toUpperCase();

/** Where a mark sits on the scale, best first; -1 when it is not a grade on the scale. */
const rank = (grades: Grades, grade: string | null | undefined): number =>
  grades.letters.findIndex(letter => letter.toUpperCase() === mark(grade));

/** What one row is worth on its own. */
export function rowStanding(row: TranscriptRow, grades: Grades): Standing {
  const shown = mark(row.grade);
  // No grade shown: transfer credit is taken as it stands; anything else is still running.
  if (shown === '') return row.transfer ? 'passed' : 'in-progress';
  const position = rank(grades, shown);
  if (position >= 0) return position <= rank(grades, grades.minimumCounting) ? 'passed' : 'must-repeat';
  return grades.neverCounting.some(never => never.toUpperCase() === shown) ? 'no-credit' : 'unrecognised';
}

/**
 * One result per course, in the order the courses first appear. Of a repeated course the
 * highest grade counts. Rows must already be checked: a code that is not a course code is
 * a programming error here.
 */
export function courseStandings(rows: readonly TranscriptRow[], grades: Grades): CourseStanding[] {
  const byCode = new Map<string, JudgedRow[]>();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    if (code === null) throw new TypeError(`A transcript row has a code that is not a course code: ${JSON.stringify(row.code)}`);
    const judged: JudgedRow = { row, standing: rowStanding(row, grades) };
    const sameCourse = byCode.get(code);
    if (sameCourse) sameCourse.push(judged);
    else byCode.set(code, [judged]);
  }

  return [...byCode].map(([code, judged]) => {
    // Every group has at least one row, so there is always a first standing.
    const standing = judged.map(one => one.standing).reduce((first, next) => (PLACE[next] < PLACE[first] ? next : first));
    // Among the rows with that standing, the best grade decides; with no grade to compare,
    // or a tie, the first in transcript order.
    const position = (one: JudgedRow): number => {
      const at = rank(grades, one.row.grade);
      return at < 0 ? Number.POSITIVE_INFINITY : at;
    };
    const deciding = judged.filter(one => one.standing === standing).reduce((best, one) => (position(one) < position(best) ? one : best));
    return { code, standing, deciding, rows: judged };
  });
}
