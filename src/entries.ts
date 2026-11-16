// The courses a student enters in "Check my courses": what to suggest while they type, and
// what adding and removing do. Nothing here says whether a course counts.
import { UNKNOWN_COURSE_CREDITS } from './credits';
import { findCourse, normalizeCode, type Course, type Curriculum } from './curriculum';
import { countsByElectiveRule } from './placement';

/**
 * An entered course. `listed` is a course the curriculum lists; `elective` is one that is
 * only an elective by the subject-and-number rule; `unknown` is one PathCheck doesn't know.
 * Only a listed course has a title.
 */
export interface Entry {
  readonly code: string;
  readonly title: string;
  readonly credits: number;
  readonly kind: 'listed' | 'elective' | 'unknown';
}

export const MOST_SUGGESTIONS = 6;
/** Fewer characters than this suggest nothing yet. */
export const FEWEST_CHARACTERS = 2;

/** Every course the curriculum lists, once, in the curriculum's order. */
export function listedCourses(curriculum: Curriculum): Course[] {
  const all = [
    ...curriculum.blocks.flatMap(block => [...block.required, ...block.picks.flatMap(group => group.courses)]),
    ...curriculum.electives.named,
    ...curriculum.electives.legacyOnly,
  ];
  const seen = new Set<string>();
  return all.filter(course => !seen.has(course.code) && Boolean(seen.add(course.code)));
}

const compact = (text: string): string => text.normalize('NFKC').toUpperCase().replace(/[\s-]+/g, '');
const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Do the typed words, in order, each start the title's words from some word on? */
function matchesTitle(typed: readonly string[], title: string): boolean {
  const inTitle = words(title);
  return typed.length > 0 && inTitle.some((_, start) => typed.every((word, i) => inTitle[start + i]?.startsWith(word) === true));
}

/**
 * The courses to suggest for what has been typed: those whose code starts with it (spaces,
 * dashes and letter case ignored), then those whose title has it at the start of a word.
 * Only courses the curriculum lists are ever suggested.
 */
export function suggest(text: string, curriculum: Curriculum, limit = MOST_SUGGESTIONS): Course[] {
  if (text.trim().length < FEWEST_CHARACTERS) return [];
  const courses = listedCourses(curriculum);
  const start = compact(text);
  const byCode = courses.filter(course => compact(course.code).startsWith(start));
  // Typed words are split at spaces only: a comma or other mark inside one matches no title.
  const typed = text.trim().toLowerCase().split(/\s+/);
  const byTitle = courses.filter(course => !byCode.includes(course) && matchesTitle(typed, course.title));
  return [...byCode, ...byTitle].slice(0, limit);
}

/** A course as it is entered, from its code in normal form. */
export function entryFor(code: string, curriculum: Curriculum): Entry {
  const [place] = findCourse(curriculum, code);
  if (place) return { code: place.course.code, title: place.course.title, credits: place.course.credits, kind: 'listed' };
  if (countsByElectiveRule(curriculum, code)) return { code, title: '', credits: curriculum.electives.creditsPerCourse, kind: 'elective' };
  return { code, title: '', credits: UNKNOWN_COURSE_CREDITS, kind: 'unknown' };
}

export type AddResult =
  | { readonly entries: readonly Entry[]; readonly added: Entry }
  | { readonly entries: readonly Entry[]; readonly problem: 'not-a-course' }
  | { readonly entries: readonly Entry[]; readonly problem: 'already-there'; readonly code: string };

/**
 * Adds a course to the list. A complete course code typed by the student is what is added,
 * in or out of the curriculum; otherwise the highlighted suggestion; otherwise nothing.
 * The same course is never in the list twice.
 */
export function addCourse(entries: readonly Entry[], text: string, highlighted: Course | null, curriculum: Curriculum): AddResult {
  const code = normalizeCode(text) ?? highlighted?.code ?? null;
  if (code === null) return { entries, problem: 'not-a-course' };
  if (entries.some(entry => entry.code === code)) return { entries, problem: 'already-there', code };
  const added = entryFor(code, curriculum);
  return { entries: [...entries, added], added };
}

export const removeCourse = (entries: readonly Entry[], code: string): Entry[] => entries.filter(entry => entry.code !== code);
