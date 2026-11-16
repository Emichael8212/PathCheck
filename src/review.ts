// The review step: what was read from a transcript, for the student to check and correct
// before anything is done with it.
//
// The reader's answer is kept as it came; every look at it goes through `readRows`, so a
// corrected row is checked again like any other. A row the student says is not on their
// transcript is left out. Nothing here says what counts toward the degree: only how each
// row stands by its grade.
import { type Curriculum, type Grades } from './curriculum';
import { readRows, type Problem, type ReadRow, type Reading, type RowToFix } from './reader';
import { courseStandings, rowStanding, type CourseStanding } from './transcript';

/** A transcript under review. */
export interface Transcript {
  /** The file's name, to be shown. */
  readonly name: string;
  /** The reader's rows, with the student's corrections put in their place. */
  readonly raw: readonly unknown[];
  /** The lines the student said are not on their transcript. */
  readonly leftOut: ReadonlySet<number>;
  readonly reading: Reading;
}

/** Starts a review from a reader's answer. Throws `ReaderError` when it is no answer. */
export function openTranscript(name: string, answer: unknown, curriculum: Curriculum): Transcript {
  const reading = readRows(answer, curriculum);
  const rows = (answer as { rows: unknown[] }).rows;
  return { name, raw: [...rows], leftOut: new Set(), reading };
}

/** What the student can correct in a row. Everything is text, as typed. */
export interface Correction {
  readonly term: string;
  readonly prefix: string;
  readonly number: string;
  readonly attempted: string;
  /** A letter or mark of the scale, or "" for no grade yet. */
  readonly grade: string;
  readonly transfer: boolean;
}

/** Puts a correction in the place of a row and checks everything again. */
export function correctRow(transcript: Transcript, line: number, correction: Correction, curriculum: Curriculum): Transcript {
  if (!Number.isInteger(line) || line < 0 || line >= transcript.raw.length) return transcript;
  // A line that is not a row stays what it is: correcting it would be typing a course in.
  if (transcript.reading.toFix.some(row => row.line === line && row.problems.includes('not-a-row'))) return transcript;
  const before = transcript.raw[line];
  // The printed description stays with the row when it is text; nothing else of the old row
  // is carried over. A description that is not text cannot be corrected, so it is dropped.
  const printed = typeof before === 'object' && before !== null && Object.hasOwn(before, 'description') ? (before as { description: unknown }).description : undefined;
  const description = typeof printed === 'string' ? printed : '';
  const { term, prefix, number, attempted, grade, transfer } = correction;
  const raw = transcript.raw.map((row, i) => (i === line ? { term, transfer, prefix, number, description, attempted, grade } : row));
  return { ...transcript, raw, reading: readRows({ rows: raw }, curriculum) };
}

export const leaveOut = (transcript: Transcript, line: number): Transcript => ({ ...transcript, leftOut: new Set([...transcript.leftOut, line]) });
export const putBack = (transcript: Transcript, line: number): Transcript => ({ ...transcript, leftOut: new Set([...transcript.leftOut].filter(one => one !== line)) });

/** The rows that go on: those that passed the check and were not left out. */
export const takenOn = (transcript: Transcript): ReadRow[] => transcript.reading.rows.filter(row => !transcript.leftOut.has(row.line));
/** The rows that still need fixing: failed the check and not left out. */
export const stillToFix = (transcript: Transcript): RowToFix[] => transcript.reading.toFix.filter(row => !transcript.leftOut.has(row.line));
/** The course standings of the reviewed transcript: what "Continue" hands on. */
export const reviewedStandings = (transcript: Transcript, grades: Grades): CourseStanding[] => courseStandings(takenOn(transcript).map(read => read.row), grades);

/** How a row stands by its grade. Not whether it counts toward the degree. */
export type RowState = 'passed' | 'in-progress' | 'below' | 'never' | 'to-fix' | 'unreadable';

/** A row as the review step shows it. */
export interface ReviewRow {
  readonly line: number;
  readonly term: string;
  readonly code: string;
  readonly description: string;
  readonly credits: string;
  /** The grade column, trimmed and in capitals; "" when there is none. */
  readonly grade: string;
  readonly transfer: boolean;
  readonly state: RowState;
  /** What needs fixing, when the row failed the check. */
  readonly problems: readonly Problem[];
  /** Its code can fill nothing: "none", or "never" for a course the curriculum names as never counting. */
  readonly outside: 'no' | 'none' | 'never';
  readonly leftOut: boolean;
  /** What the edit fields start with. Nothing for a line that is not a row. */
  readonly editable: Correction | null;
}

/** The transcript's rows in the order read, each as it is to be shown. */
export function reviewRows(transcript: Transcript, curriculum: Curriculum): ReviewRow[] {
  const { grades, electives } = curriculum;
  const passed: ReviewRow[] = transcript.reading.rows.map(({ line, row, description, attempted, match }) => {
    const standing = rowStanding(row, grades);
    const grade = (row.grade ?? '').toUpperCase();
    // The credits as printed: a number when one was read, nothing when the column was empty.
    const credits = attempted === '' ? '' : String(row.credits);
    return {
      line, term: row.term, code: row.code, description, credits, grade, transfer: row.transfer,
      state: standing === 'passed' ? 'passed' : standing === 'in-progress' ? 'in-progress' : standing === 'must-repeat' ? 'below' : 'never',
      problems: [],
      outside: match !== 'none' ? 'no' : electives.except.includes(row.code) ? 'never' : 'none',
      leftOut: transcript.leftOut.has(line),
      editable: { term: row.term, prefix: row.code.split(' ')[0] ?? '', number: row.code.split(' ')[1] ?? '', attempted: credits, grade, transfer: row.transfer },
    };
  });
  const toFix: ReviewRow[] = transcript.reading.toFix.map(({ line, problems, seen }) => {
    const unreadable = problems.includes('not-a-row');
    return {
      line, term: seen.term.trim(), code: `${seen.prefix} ${seen.number}`.trim(), description: seen.description, credits: seen.attempted, grade: seen.grade.trim().toUpperCase(),
      transfer: seen.transfer === true, state: unreadable ? 'unreadable' : 'to-fix', problems, outside: 'no', leftOut: transcript.leftOut.has(line),
      editable: unreadable ? null : { term: seen.term, prefix: seen.prefix, number: seen.number, attempted: seen.attempted, grade: seen.grade.trim().toUpperCase(), transfer: seen.transfer === true },
    };
  });
  return [...passed, ...toFix].sort((a, b) => a.line - b.line);
}

/** The rows under their term headings, terms in the order they first appear. A row with no term read comes under "". */
export function byTerm(rows: readonly ReviewRow[]): { term: string; rows: ReviewRow[] }[] {
  const terms: { term: string; rows: ReviewRow[] }[] = [];
  for (const row of rows) {
    const group = terms.find(one => one.term === row.term);
    if (group) group.rows.push(row);
    else terms.push({ term: row.term, rows: [row] });
  }
  return terms;
}

/** The grades a row can be given: the curriculum's scale, then its never-counting marks. */
export const gradeChoices = (grades: Grades): string[] => [...grades.letters, ...grades.neverCounting];
