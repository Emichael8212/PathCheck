// Remembering (docs/BRIEF.md §4 "Remembering", §7; docs/sprints/F19.md): the last result is
// kept in the student's own browser and nowhere else, and "Clear my data" removes it.
//
// What is kept is as little of the transcript as the result needs. A passing grade is kept
// as "Passed", never as its letter: the result never shows one, so keeping it would keep
// the transcript, not the result. Never kept: the PDF, the file's name, totals lines (GPA,
// standing), credits earned, quality points, the day.
//
// What is read back is not trusted: it goes through the same checks as a freshly read
// transcript and a typed course, and anything that cannot be read is thrown away.
import { type CourseList } from './check';
import { type Curriculum } from './curriculum';
import { addCourse, setCredits, type Entry } from './entries';
import { esc, icons } from './html';
import { LEGACY_KEY, type AnswerStorage } from './legacy';
import { defaultSettings, readTerm, termName, type PaceSettings, type Term } from './pace';
import { type Moves } from './plan';
import { openTranscript, type Transcript } from './review';
import { KEPT_AS_PASSED, rowStanding } from './transcript';

/** The one entry, beside the legacy answer, that PathCheck keeps in the browser's storage. */
export const VISIT_KEY = 'pathcheck.visit';
/** Everything PathCheck ever stores in the browser. "Clear my data" removes each of them. */
export const STORED_KEYS: readonly string[] = [VISIT_KEY, LEGACY_KEY];
/** What a transcript that came back is called, where the page named its file. */
export const KEPT_NAME = 'your transcript';

const VERSION = 1;
// More than any transcript or list holds: what is read back beyond these is not PathCheck's.
const MOST_TEXT = 300_000;
const MOST_ROWS = 600;
const MOST_COURSES = 200;
const MOST_MOVES = 300;
const MOST_CREDITS_A_TERM = 60;

const TEXT = {
  clear: 'Clear my data',
  cleared: 'Your data was cleared from this browser.',
  keptResult: 'This result stays in this browser until you clear it.',
  keptList: 'This list stays in this browser until you clear it.',
};
export const CLEARED = TEXT.cleared;

/** The result of "See what I have left" as it is kept and comes back. */
export interface KeptResult {
  readonly transcript: Transcript;
  readonly pace: PaceSettings;
  readonly moves: Moves;
}

/** What comes back on a return visit. */
export interface Kept {
  readonly entries: readonly Entry[];
  /** The term chosen for the pace line of "Check my courses". */
  readonly term: Term | null;
  readonly result: KeptResult | null;
}

type Fields = { readonly [key: string]: unknown };
const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (value: Fields, name: string): unknown => (Object.hasOwn(value, name) ? value[name] : undefined);

/**
 * The reviewed rows as they are kept: in the order read, without the lines that were
 * thrown away, each with only what the result needs. `leftOut` follows the new numbering.
 */
export function keptRows(transcript: Transcript, curriculum: Curriculum): { rows: unknown[]; leftOut: number[] } {
  const { reading, leftOut } = transcript;
  const lines: { line: number; row: unknown }[] = [
    ...reading.rows.map(({ line, row, description, attempted }) => {
      const standing = rowStanding(row, curriculum.grades);
      const [prefix = '', number = ''] = row.code.split(' ');
      // Of the grade, only what the result uses: that it passed (never the letter), that it is
      // still running, or the grade that does not count. Transfer credit has no grade to keep.
      const grade = row.transfer ? '' : standing === 'passed' ? KEPT_AS_PASSED : standing === 'in-progress' ? '' : row.grade ?? '';
      return { line, row: { term: row.term, transfer: row.transfer, prefix, number, description, attempted, grade } };
    }),
    ...reading.toFix.map(({ line, problems, seen }) => {
      if (problems.includes('not-a-row')) return { line, row: null };
      // A row that still needs fixing is kept as it was read: it has to be fixed. Left out, it
      // keeps no grade: put back, it is a row to fix again and its grade is chosen again.
      const out = leftOut.has(line);
      const read = seen.grade.trim() !== '';
      const faulty = problems.includes('grade');
      return {
        line,
        row: {
          term: seen.term, ...(seen.transfer === null ? {} : { transfer: seen.transfer }), prefix: seen.prefix, number: seen.number,
          // What made it a row to fix stays a fault, so that it never counts by being kept.
          description: problems.includes('description') ? false : seen.description,
          attempted: seen.attempted,
          // (A grade that was a fault, or that is not kept, stays one: it is never kept as no grade, which would read as in progress.)
          grade: out ? (read || faulty ? false : '') : faulty && !read ? false : seen.grade,
          ...(problems.includes('earned') ? { earned: '?' } : {}), ...(problems.includes('points') ? { points: '?' } : {}),
        },
      };
    }),
  ].sort((a, b) => a.line - b.line);
  return { rows: lines.map(one => one.row), leftOut: lines.flatMap((one, at) => (leftOut.has(one.line) ? [at] : [])) };
}

/** The text that is stored for a visit; null when there is nothing to keep. */
export function keptText(curriculum: Curriculum, list: Pick<CourseList, 'entries' | 'term'>, result: { transcript: Transcript; pace: PaceSettings; moves: Moves } | null): string | null {
  if (list.entries.length === 0 && !result) return null;
  return JSON.stringify({
    v: VERSION,
    list: list.entries.map(entry => (entry.kind === 'unknown' ? { code: entry.code, credits: entry.credits } : { code: entry.code })),
    term: list.term && list.entries.length > 0 ? termName(list.term) : null,
    result: result ? {
      ...keptRows(result.transcript, curriculum),
      pace: { fewest: result.pace.fewest, most: result.pace.most, summers: result.pace.summers, target: result.pace.target ? termName(result.pace.target) : null },
      moves: Object.fromEntries(Object.entries(result.moves).map(([key, term]) => [key, termName(term)])),
    } : null,
  });
}

const termOf = (value: unknown): Term | null => (typeof value === 'string' && value.length < 40 ? readTerm(value) : null);
const wholeBetween = (value: unknown, from: number, to: number): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= from && value <= to ? value : null);

function paceOf(value: unknown): PaceSettings {
  const usual = defaultSettings();
  if (!isObject(value)) return usual;
  const fewest = wholeBetween(own(value, 'fewest'), 1, MOST_CREDITS_A_TERM);
  const most = wholeBetween(own(value, 'most'), 1, MOST_CREDITS_A_TERM);
  // A range that is not a range is not the student's: the usual one.
  const range = fewest !== null && most !== null && fewest <= most ? { fewest, most } : { fewest: usual.fewest, most: usual.most };
  return { ...range, summers: own(value, 'summers') === true, target: termOf(own(value, 'target')) };
}

function movesOf(value: unknown): Moves {
  if (!isObject(value)) return {};
  const moves: Record<string, Term> = {};
  for (const key of Object.keys(value).slice(0, MOST_MOVES)) {
    const term = termOf(value[key]);
    if (term && key.length <= 80) moves[key] = term;
  }
  return moves;
}

function resultOf(value: unknown, curriculum: Curriculum): KeptResult | null {
  if (!isObject(value)) return null;
  const rows = own(value, 'rows');
  if (!Array.isArray(rows) || rows.length > MOST_ROWS) return null;
  let transcript: Transcript;
  try {
    // The same checks as a freshly read transcript; only here may a grade be the kept word for a passing one.
    transcript = openTranscript(KEPT_NAME, { rows }, curriculum, true);
  } catch {
    return null;
  }
  const out = own(value, 'leftOut');
  const leftOut = new Set(Array.isArray(out) ? out.filter((line): line is number => wholeBetween(line, 0, rows.length - 1) !== null) : []);
  return { transcript: { ...transcript, leftOut }, pace: paceOf(own(value, 'pace')), moves: movesOf(own(value, 'moves')) };
}

/**
 * What was kept, checked again; null when nothing was kept or it cannot be read (not
 * JSON, another version, not PathCheck's shape). Parts that are not valid are dropped.
 */
export function readKept(text: string | null | undefined, curriculum: Curriculum): Kept | null {
  if (typeof text !== 'string' || text.length > MOST_TEXT) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(stored) || own(stored, 'v') !== VERSION) return null;
  // The list: each code goes through the same door as a typed one.
  let entries: readonly Entry[] = [];
  const list = own(stored, 'list');
  for (const one of Array.isArray(list) ? list.slice(0, MOST_COURSES) : []) {
    const code = isObject(one) ? own(one, 'code') : undefined;
    if (typeof code !== 'string' || code.length > 20) continue;
    const added = addCourse(entries, code, null, curriculum);
    if (!('added' in added)) continue;
    entries = added.entries;
    const credits = isObject(one) ? own(one, 'credits') : undefined;
    if (typeof credits === 'number') entries = setCredits(entries, added.added.code, credits);
  }
  return { entries, term: entries.length > 0 ? termOf(own(stored, 'term')) : null, result: resultOf(own(stored, 'result'), curriculum) };
}

// Storage can be missing, switched off or full. Then nothing is remembered and nothing
// fails: every use of it is inside a try.

/** What the browser keeps for PathCheck, or null. */
export function loadKept(storage: AnswerStorage | null | undefined, curriculum: Curriculum): Kept | null {
  try {
    return readKept(storage?.getItem(VISIT_KEY), curriculum);
  } catch {
    return null;
  }
}

/** Stores the visit, or removes the entry when there is nothing to keep. True when the browser took it. */
export function storeKept(storage: AnswerStorage | null | undefined, text: string | null): boolean {
  if (!storage) return false;
  try {
    if (text === null) storage.removeItem(VISIT_KEY);
    else storage.setItem(VISIT_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** Removes everything PathCheck stored in the browser, the legacy answer included. */
export function clearStored(storage: AnswerStorage | null | undefined): void {
  for (const key of STORED_KEYS) {
    try {
      storage?.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  }
}

/** Whether the browser can keep anything: asked once, by keeping and removing nothing of the student's. */
export function canKeep(storage: AnswerStorage | null | undefined): boolean {
  if (!storage) return false;
  const probe = 'pathcheck.probe';
  try {
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// ---- The page ----
/** "Clear my data", the design's secondary button. */
export const clearButtonHtml = (): string => `<button type="button" class="btn secondary" data-clear>${icons.trash()}${esc(TEXT.clear)}</button>`;
/** Said with the button, so that a student on a shared computer knows. (Taken off the page where the browser keeps nothing.) */
export const keptNoteHtml = (what: 'result' | 'list'): string => `<p class="kept-note" data-kept-note>${esc(what === 'result' ? TEXT.keptResult : TEXT.keptList)}</p>`;
/** The row with the button alone, for a page that has no other action at its end. */
export const clearRowHtml = (what: 'result' | 'list' | null): string => `<div class="actions no-print" data-clear-row>
    ${clearButtonHtml()}${what ? `
    ${keptNoteHtml(what)}` : ''}
  </div>`;
