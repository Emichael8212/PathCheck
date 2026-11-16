// What every page shares: the three addresses, the top bar and the footer.
import { type Curriculum } from './curriculum';
import { esc } from './html';
import { APP_NAME, LAST_REVIEWED, NOT_AFFILIATED, NOT_OFFICIAL, REPORT_ADDRESS, REPORT_A_MISTAKE } from './wording';

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

export const foot = (curriculum: Curriculum, subject = `${APP_NAME}: report a mistake`): string => {
  const reviewed = reviewedOn(curriculum.lastReviewed);
  return `
<footer class="foot">
  <div>
    <strong>${esc(NOT_OFFICIAL)}</strong>${reviewed ? `
    <span>${esc(`${LAST_REVIEWED} ${reviewed}`)}</span>` : ''}
    <a class="text-link" href="mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(subject)}">${esc(REPORT_A_MISTAKE)}</a>
  </div>
  <p>${esc(NOT_AFFILIATED)}</p>
</footer>`;
};

/** A flow's page before the flow is built: its name, and nothing that is not there yet. */
export const flowPage = (route: Exclude<Route, 'start'>, curriculum: Curriculum): string => `${top(route)}
<main class="${route} wrap">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">${esc(FLOW_NAME[route])}</h1>
    </div>
  </div>
</main>
${foot(curriculum)}`;
