// The legacy question: some courses count as electives only for a legacy student, so the
// student is asked, once, when one of those courses appears. Which courses those are is
// the curriculum's; nothing about them is written here.
import { findCourse, type Curriculum } from './curriculum';

/** The question and its two answers, word for word, for every screen that asks it. */
export const LEGACY_QUESTION = 'Are you a legacy CIS student?';
export const LEGACY_YES = 'Yes';
export const LEGACY_NO = 'No';

/** Yes, No, or not given yet. */
export type LegacyAnswer = boolean | null;

/**
 * Whether the question has to be asked: true when any of the codes, however it is typed,
 * is one of the curriculum's legacy-only courses. Pass every code that appears, typed or
 * on a transcript, whatever its grade.
 */
export function legacyQuestionNeeded(codes: readonly string[], curriculum: Curriculum): boolean {
  return codes.some(code => typeof code === 'string' && findCourse(curriculum, code).some(place => place.kind === 'legacy-elective'));
}

/** The one key the answer is kept under in the browser's storage. */
export const LEGACY_KEY = 'pathcheck.legacy';

/** The part of the browser's storage this needs. */
export type AnswerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORED_YES = 'yes';
const STORED_NO = 'no';

// Storage can be missing or switched off (private browsing). Then the answer is simply not
// remembered: nothing fails, and the student is asked again next time. A screen keeps the
// answer in memory for the visit and does not rely on reading it back.

/**
 * The browser's storage, or null when there is none. With site data blocked, some browsers
 * fail on the mere mention of `localStorage`, so screens get it here and nowhere else.
 */
export function browserStorage(): AnswerStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The remembered answer, or null when none was given or storage cannot be used. */
export function readLegacyAnswer(storage: AnswerStorage | null | undefined): LegacyAnswer {
  try {
    const stored = storage?.getItem(LEGACY_KEY);
    return stored === STORED_YES ? true : stored === STORED_NO ? false : null;
  } catch {
    return null;
  }
}

/**
 * Remembers the answer. The student can change it: writing again replaces it. Only a real
 * Yes or No is kept: anything else (a button's text, say) is ignored, never read as a Yes.
 */
export function writeLegacyAnswer(storage: AnswerStorage | null | undefined, answer: boolean): void {
  if (typeof answer !== 'boolean') return;
  try {
    storage?.setItem(LEGACY_KEY, answer ? STORED_YES : STORED_NO);
  } catch {
    // Not remembered; see above.
  }
}

/** Forgets the answer, so the question is asked again. */
export function clearLegacyAnswer(storage: AnswerStorage | null | undefined): void {
  try {
    storage?.removeItem(LEGACY_KEY);
  } catch {
    // Nothing to forget; see above.
  }
}
