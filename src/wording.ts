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
