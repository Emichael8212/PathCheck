// Sentences that more than one screen shows. Each exists once, here, so that every screen
// says it in exactly the same words (docs/BRIEF.md §4; docs/design/DESIGN.md; the owner's
// answers in docs/decision-log.md).

export const APP_NAME = 'PathCheck';
export const NOT_OFFICIAL = 'Not an official degree audit.';
export const NOT_AFFILIATED = 'Not affiliated with Alabama State University';
export const REPORT_A_MISTAKE = 'Report a mistake';
// Placeholder: the owner gives the contact address before launch (brief §12).
export const REPORT_ADDRESS = 'report@pathcheck.example';
export const LAST_REVIEWED = 'Curriculum last reviewed:';

/** Without a transcript, a "Counts" answer is never shown without this. */
export const CONDITION = 'unless you’ve already passed it or filled this slot';
/** A pace answer is never shown without this. */
export const CAVEAT = 'Credits only — course order may add semesters.';
/** Shown next to every upload control, so it is read before the first upload. */
export const PRIVACY = 'Your PDF is read, then deleted. Only your result stays in this browser.';

/** The answer for a course in a curriculum list; `block` is the block's name from the curriculum. */
export const countsToward = (block: string): string => `Counts toward CIS — ${block}`;
/** The answer for a course that is in no curriculum list and is not an elective by the rule. */
export const NOT_IN_CURRICULUM = 'Doesn’t count toward CIS — not in the CIS curriculum';

// ---- The answers in "Check my courses" (brief §4; the owner's answers of 2026-11-16) ----
/** Several course codes in a sentence: "A", "A and B", "A, B and C". */
export const listOf = (codes: readonly string[]): string =>
  (codes.length <= 1 ? codes.join('') : `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`);
/** An elective by the rule; `level` and `subject` come from the curriculum's rule. */
export const countsAsElective = (level: string, subject: string): string => `Counts toward CIS: elective (${level} ${subject})`;
export const COUNTS_AS_LEGACY_ELECTIVE = 'Counts toward CIS: elective (legacy)';
export const LEGACY_STUDENTS_ONLY = 'Doesn’t count toward CIS. Legacy students only.';
/** Another course of the student's own list fills the place this one would. */
export const sameRequirement = (filledBy: readonly string[]): string => `Doesn’t count — it fills the same requirement as ${listOf(filledBy)}.`;
export const electivePlacesFilled = (places: number, filledBy: readonly string[]): string =>
  `Doesn’t count — your ${places} CIS elective places are already filled by ${listOf(filledBy)}.`;
/** A course the curriculum names as never counting. */
export const notInCurrentCurriculum = (courseCode: string): string => `Doesn’t count toward CIS — ${notCurrent(courseCode)}.`;
/** Shown on a row whose answer depends on a legacy answer not yet given. */
export const waitingFor = (question: string): string => `Answer “${question}” to see this.`;
/** `courses` are the sequence's courses that sit in a pick; `kinds` names the sequences. */
export const sequenceReminder = (courses: readonly string[], kinds: string): string => `Remember: you need ${courses.join(' or ')} for the ${kinds} sequence.`;

// ---- The numbers above the list in "Check my courses" (brief §4; docs/design/DESIGN.md) ----
export const TOTAL_CREDITS = 'Total credits';
export const COUNT_TOWARD = 'Count toward CIS';
export const DO_NOT_COUNT = 'Don’t count';
/** Without a transcript the count is conditional, like every answer under it. */
export const COUNT_CONDITION = 'unless you’ve already passed them or filled their slots';
/** Shown under the two counts while a row still waits for the legacy answer. */
export const WAITING_FOR_LEGACY = 'Waiting for your legacy answer.';
/** The two neutral notes, in the approved design's sentences; the numbers are the brief's. */
export const belowFullTime = (credits: number): string => `Below ${credits} credits: below full-time; may affect scholarships.`;
export const overUsualMost = (credits: number): string => `Over ${credits} credits: may cost extra.`;

// ---- The review step ----
/**
 * Beside a row whose course the curriculum names as never counting: the second half of the
 * owner's sentence above. The review step says how a row stands, not what counts.
 */
export function notCurrent(courseCode: string): string { return `${courseCode} isn’t in the current CIS curriculum`; }
