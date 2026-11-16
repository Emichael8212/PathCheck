// What every page shares: the three addresses, the top bar and the footer.
import { type Curriculum } from './curriculum';
import { esc } from './html';
import { NOTHING_SHOWN, reportHref, type Shown } from './report';
import { APP_NAME, LAST_REVIEWED, NOT_AFFILIATED, NOT_OFFICIAL, OLD_REVIEW_NAME, REPORT_A_MISTAKE, oldReview } from './wording';

export type Route = 'start' | 'check' | 'left';

/** Each page's address. The part after # never reaches a server. */
export const HREF: Readonly<Record<Route, string>> = { start: '#/', check: '#/check', left: '#/left' };

/** The page an address shows. Anything unknown shows Start. */
export const routeOf = (hash: string): Route => (hash === HREF.check ? 'check' : hash === HREF.left ? 'left' : 'start');

/** The two flows, by name. */
export const FLOW_NAME: Readonly<Record<Exclude<Route, 'start'>, string>> = { check: 'Check my courses', left: 'See what I have left' };
const NAV: readonly { route: Exclude<Route, 'start'>; label: string }[] = [
  { route: 'check', label: 'Check my courses' },
  { route: 'left', label: 'What I have left' },
];

/** What the browser tab says. */
export const titleOf = (route: Route): string => (route === 'start' ? APP_NAME : `${FLOW_NAME[route]} — ${APP_NAME}`);

export const top = (current: Route): string => `
<header class="top">
  <a class="wordmark" href="${HREF.start}">${esc(APP_NAME)}<span class="dot">.</span></a>
  <nav aria-label="Main navigation">
    ${NAV.map(item => `<a href="${HREF[item.route]}"${item.route === current ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`).join('\n    ')}
  </nav>
  <span class="top-note">${esc(NOT_OFFICIAL)}</span>
</header>`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Jan 2026" for a review date of 2026-01-15, read from the text itself so that it is the
 * same month in every time zone. Nothing when there is no date: one is never made up.
 */
export function reviewedOn(date: string | null): string | null {
  const parts = date === null ? null : /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  const month = parts ? MONTHS[Number(parts[2]) - 1] : undefined;
  return parts && month ? `${month} ${parts[1]}` : null;
}

/** A day on the student's device. */
export interface Day { readonly year: number; readonly month: number; readonly day: number }
export const dayOf = (date: Date): Day => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });

/**
 * Whether the last review is more than twelve months old: today is after the same day of
 * the month twelve months later (or after that month's last day, when it has no such
 * day). Never without a review date, and never without a day to compare with.
 */
export function reviewIsOld(reviewed: string | null, today: Day | null): boolean {
  const parts = reviewed === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(reviewed);
  if (!parts || !today) return false;
  const year = Number(parts[1]) + 1;
  const month = Number(parts[2]);
  // (A day the later month does not have is never passed within that month: the next month's first day is the first day after it.)
  return today.year !== year ? today.year > year : today.month !== month ? today.month > month : today.day > Number(parts[3]);
}

/**
 * The banner that starts every page once the review is more than twelve months old;
 * nothing otherwise. Ordinary text, read first: a note with a name, not a live region.
 * This is the one thing in PathCheck that looks at today's date.
 */
export function oldReviewBanner(curriculum: Curriculum, today: Day | null): string {
  const reviewed = reviewedOn(curriculum.lastReviewed);
  return reviewed && reviewIsOld(curriculum.lastReviewed, today) ? `<p class="old-review" role="note" aria-label="${esc(OLD_REVIEW_NAME)}">${esc(oldReview(reviewed))}</p>` : '';
}

/** The email that "Report a mistake" opens: the page's subject, what the page showed, and the lines every message closes with. */
export function reportLink(curriculum: Curriculum, subject = `${APP_NAME}: report a mistake`, shown: Shown = NOTHING_SHOWN): string {
  const reviewed = reviewedOn(curriculum.lastReviewed);
  return reportHref(subject, shown, [`${curriculum.program}, ${curriculum.institution}`, ...(reviewed ? [`${LAST_REVIEWED} ${reviewed}`] : [])]);
}

export const foot = (curriculum: Curriculum, report = reportLink(curriculum), wide = false): string => {
  const reviewed = reviewedOn(curriculum.lastReviewed);
  return `
<footer class="foot${wide ? ' foot-wide' : ''}">
  <div>
    <strong>${esc(NOT_OFFICIAL)}</strong>${reviewed ? `
    <span>${esc(`${LAST_REVIEWED} ${reviewed}`)}</span>` : ''}
    <a class="text-link" href="${esc(report)}">${esc(REPORT_A_MISTAKE)}</a>
  </div>
  <p>${esc(NOT_AFFILIATED)}</p>
</footer>`;
};

