// Credits of the courses a student types in "Check my courses".

/**
 * A course PathCheck doesn't know has no credits in the curriculum. It starts at this many
 * and the student can change it (owner, 2026-11-16). Its credits add to the semester total
 * only, never to what counts toward the degree.
 */
export const UNKNOWN_COURSE_CREDITS = 3;

/** The most the student can give a course PathCheck doesn't know: room for a large block such as an internship. */
export const MOST_UNKNOWN_CREDITS = 12;

/** The brief's two marks: a full-time load, and the usual most. PathCheck sets no limit; the portal does. */
export const FULL_TIME = 12;
export const USUAL_MOST = 18;

export interface Totals {
  /** Every course in the list. */
  readonly total: number;
  /** Courses whose answer is a "Counts". */
  readonly counts: number;
  /** Courses whose answer is a "Doesn't count". */
  readonly doesNotCount: number;
  /** Courses that show the legacy question or wait for it: in neither count yet. */
  readonly waiting: number;
  /** Whether any course is still waiting, whatever its credits. */
  readonly pending: boolean;
}

/** The credits of every course in a list. */
export const creditsOf = (entries: readonly { readonly credits: number }[]): number => entries.reduce((credits, entry) => credits + entry.credits, 0);

/** The credits of a list, split by the answers its courses got. `answers` are in the list's order. */
export function totalsOf(entries: readonly { readonly credits: number }[], answers: readonly { readonly kind: 'counts' | 'no' | 'ask' | 'waiting' }[]): Totals {
  if (entries.length !== answers.length) throw new Error('Every course needs its answer to be counted.');
  const sum = (kinds: readonly string[]): number => entries.reduce((credits, entry, i) => (kinds.includes(answers[i]?.kind ?? '') ? credits + entry.credits : credits), 0);
  const pending = answers.some(answer => answer.kind === 'ask' || answer.kind === 'waiting');
  return { total: creditsOf(entries), counts: sum(['counts']), doesNotCount: sum(['no']), waiting: sum(['ask', 'waiting']), pending };
}

/** Which neutral note goes with a total: under a full-time load, over the usual most, or none. */
export const noteFor = (total: number): 'under' | 'over' | null => (total < FULL_TIME ? 'under' : total > USUAL_MOST ? 'over' : null);
