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
/** The banner once the last review is more than twelve months old (brief §4 "On every result"). */
export const OLD_REVIEW_NAME = 'Curriculum may be out of date';
export const oldReview = (reviewed: string): string =>
  `The curriculum ${APP_NAME} uses was last reviewed in ${reviewed}, more than 12 months ago. Requirements may have changed since: check your portal before you rely on this.`;

/** Without a transcript, a "Counts" answer is never shown without this. */
export const CONDITION = 'unless you’ve already passed it or filled this slot';
/** A pace answer is never shown without this. */
export const CAVEAT = 'Credits only — course order may add semesters.';
/** Shown next to every upload control, so it is read before the first upload. */
export const PRIVACY = 'Your PDF is read, then deleted. Only your result stays in this browser.';
/** Said and shown while a chosen PDF is being read (on the hosted site it takes some seconds). */
export const READING = 'Reading your transcript…';

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

// ---- The answers with a transcript (brief §4 Flow A step 3; docs/sprints/F12.md) ----
export const ALREADY_PASSED = 'You already passed this';
export const SLOT_FILLED = 'This slot is already filled';
/** A typed course that has no grade yet on the transcript (the owner's words, 2026-11-16). */
export const IN_PROGRESS_AGAIN = 'Already in progress.';
// A sequence course whose pick another course already holds (the owner's answer of 2026-11-16).
/** A sequence can still be completed through an open pick: `take` are that pick's sequence courses. */
export const sameSlotTake = (holders: readonly string[], take: readonly string[]): string =>
  `Doesn’t count — same slot as ${listOf(holders)}. Take ${take.join(' or ')} for the sequence.`;
/**
 * Every pick of a sequence is held by other courses: the course fills the sequence
 * requirement only. `sequence` is its name in the curriculum, `credits` the course's own.
 */
export const neededForSequence = (sequence: string, credits: number): string => `Needed for the ${sequence} (${credits} extra ${credits === 1 ? 'credit' : 'credits'}).`;
/** Under the legacy question when it is asked because of courses on the transcript. */
export const transcriptHasLegacy = (codes: readonly string[]): string =>
  `Your transcript has ${listOf(codes)}, which ${codes.length === 1 ? 'counts as an elective' : 'count as electives'} only for legacy students.`;

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

// ---- The checklist (brief §4 Flow B step 3; docs/design/DESIGN.md "Page 3"; docs/sprints/F13.md) ----
/** On a course in progress that was attempted before, below the lowest grade that counts (the design's sentence). */
export const repeatInProgress = (grade: string): string => `Repeat; the earlier ${grade} doesn’t count.`;
/** On a still-needed course whose best attempt was below the lowest grade that counts (brief §5: flag "must be repeated"). */
export const mustBeRepeated = (grade: string): string => `Must be repeated; the ${grade} doesn’t count.`;
/** The same for a course of a pick, or an elective: another course can fill the place. */
export const pickFailed = (courseCode: string, grade: string): string => `${courseCode}: the ${grade} doesn’t count. It must be repeated, or another course of this pick taken.`;
export const electiveFailed = (courseCode: string, grade: string): string => `${courseCode}: the ${grade} doesn’t count. It must be repeated, or another elective taken.`;
/** What the sequence still needs while a pick is open; `kinds` name the sequences ("history", "literature"). */
export const sequenceStillNeeded = (codes: readonly string[], kinds: readonly string[]): string => `Still needed: ${codes.join(' or ')} to complete a ${kinds.join(' or ')} sequence.`;
const extraCredits = (credits: number): string => `${credits} extra ${credits === 1 ? 'credit' : 'credits'}`;
/** With every pick held by other courses (the owner's answer of 2026-11-16, for Flow B). */
export const sequenceExtra = (kinds: readonly string[], credits: number, codes: readonly string[]): string =>
  `Needed for the ${kinds.join(' or ')} sequence (${extraCredits(credits)}): ${codes.join(' or ')}.`;
/**
 * A sequence course in progress while another course holds its pick: it is what completes
 * the sequence, and is never listed as not counting. `sequence` is its name in the curriculum.
 */
export const sequenceInProgress = (codes: readonly string[], sequence: string, credits: number): string =>
  `In progress: ${codes.join(' and ')} for the ${sequence} (${extraCredits(credits)}). It fills the sequence requirement only.`;
export const extraInProgress = (credits: number, sequence: string): string => `Plus ${extraCredits(credits)} in progress for the ${sequence}.`;
/** Beside the credits left, which those extra credits are not part of. */
export const extraForSequence = (credits: number, kinds: readonly string[]): string => `Plus ${extraCredits(credits)} for the ${kinds.join(' or ')} sequence.`;
// ---- The legacy answer once given (both flows) ----
/** The line that shows the legacy answer, with the way to change it. */
export const LEGACY_LINE = 'Legacy CIS student:';
export const CHANGE = 'Change';

// ---- A transcript that is there (the review step; "Check my courses") ----
export const USE_ANOTHER = 'Use another transcript';
export const ANOTHER_FORGETS = 'Choosing another transcript forgets your corrections.';

// ---- The review step ----
/**
 * Beside a row whose course the curriculum names as never counting: the second half of the
 * owner's sentence above. The review step says how a row stands, not what counts.
 */
export function notCurrent(courseCode: string): string { return `${courseCode} isn’t in the current CIS curriculum`; }
