// The review date of the real curriculum file, for the tests that show it on a page or need
// a day on which the review is old (F25, docs/sprints/F25.md). The date itself is stated in
// one test only, tests/curriculum.test.ts "carries the last-reviewed date", which quotes the
// owner's review. Everything here is worked out from the file by this file's own
// arithmetic, not by the app's: so when the date is set again at the yearly review
// (docs/CURRICULUM-HANDOVER.md), no other test has to be edited.
import rawData from '../docs/curriculum/provisional-current.json';

export interface DayParts { readonly year: number; readonly month: number; readonly day: number }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const written: unknown = rawData.lastReviewed;
const parts = typeof written === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(written) : null;
if (!parts) throw new Error('tests/reviewed.ts: "lastReviewed" in docs/curriculum/provisional-current.json is not a date written YYYY-MM-DD');

const partsOf = (date: Date): DayParts => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
export const dayAfter = (one: DayParts): DayParts => partsOf(new Date(one.year, one.month - 1, one.day + 1, 12));
export const dayBefore = (one: DayParts): DayParts => partsOf(new Date(one.year, one.month - 1, one.day - 1, 12));
/** A moment of that day on the device, as the app's `today` gives it. */
export const at = (one: DayParts, hour = 12): Date => new Date(one.year, one.month - 1, one.day, hour);

/** The date as the file writes it, "2026-11-15". */
export const REVIEW_DATE = parts[0];
export const REVIEW_DAY: DayParts = { year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3]) };
/** The month and year as the pages write them, "Nov 2026". */
export const REVIEW_MONTH = `${MONTHS[REVIEW_DAY.month - 1]} ${REVIEW_DAY.year}`;
/** The footer's line. */
export const REVIEWED_LINE = `Curriculum last reviewed: ${REVIEW_MONTH}`;

const daysIn = (year: number, month: number): number => new Date(year, month, 0).getDate();
/** The last day on which the review is not yet more than twelve months old: the same day a year later, or that month's last. */
export const LAST_FRESH_DAY: DayParts = { year: REVIEW_DAY.year + 1, month: REVIEW_DAY.month, day: Math.min(REVIEW_DAY.day, daysIn(REVIEW_DAY.year + 1, REVIEW_DAY.month)) };
/** The first day on which every page says that the review is old. */
export const FIRST_OLD_DAY: DayParts = dayAfter(LAST_FRESH_DAY);
/** The day after the review: the day the tests' apps run on. */
export const DAY_AFTER_REVIEW: DayParts = dayAfter(REVIEW_DAY);
