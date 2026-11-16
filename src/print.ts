// The printed summary (docs/BRIEF.md §4 Flow B step 6; docs/design/DESIGN.md "Print";
// docs/sprints/F17.md). The summary is the result page itself on paper: one source, so the
// paper never says something else than the screen. The browser does the printing; PathCheck
// makes no file and sends nothing.
//
// On paper every requirement is open and none is filtered away. No single signal from the
// browser is relied on for that: the button prepares the page itself, the browser's own
// Print is heard through its events, and the stylesheet's print rules cover the rest.
import { type Curriculum } from './curriculum';
import { esc, icons } from './html';
import { reviewedOn } from './shell';
import { APP_NAME, LAST_REVIEWED, NOT_AFFILIATED, NOT_OFFICIAL } from './wording';

const TEXT = {
  button: 'Print / save PDF for your advisor',
  summary: `${APP_NAME} summary`,
  head: (program: string, institution: string): string => `${APP_NAME} summary — ${program}, ${institution}`,
};

/** The tab's name while printing: what "Save as PDF" suggests as the file's name. */
export const PRINT_TITLE = TEXT.summary;

/**
 * The top of the paper, never shown on the screen: what this is, and the lines every
 * result carries. It names the institution, so it says at once that it is not the
 * institution's. The sentences are the footer's.
 */
export function printHeadHtml(curriculum: Curriculum): string {
  const reviewed = reviewedOn(curriculum.lastReviewed);
  const lines = [NOT_OFFICIAL, `${NOT_AFFILIATED}.`, ...(reviewed ? [`${LAST_REVIEWED} ${reviewed}`] : [])];
  return `<div class="print-only print-head" data-print-head>
    <p><strong>${esc(TEXT.head(curriculum.program, curriculum.institution))}</strong></p>
    <p>${esc(lines.join(' '))}</p>
  </div>`;
}

/** The row of actions that ends the result. (F19 adds "Clear my data" beside the button.) */
export const printActionsHtml = (): string => `<div class="actions no-print">
    <button type="button" class="btn primary" data-print>${icons.print()}${esc(TEXT.button)}</button>
  </div>`;

/**
 * Opens the result for paper: every requirement and the list of courses that do not count
 * are opened, and the cards that "Not done" hides are shown. Gives back how to put the
 * page as it was; nothing when no result is on the page.
 */
export function openForPaper(root: ParentNode): (() => void) | null {
  if (!root.querySelector('[data-print-head]')) return null;
  const closed = [...root.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
  const hidden = [...root.querySelectorAll<HTMLElement>('.req[hidden]')];
  for (const one of closed) one.open = true;
  for (const one of hidden) one.hidden = false;
  return () => {
    for (const one of closed) one.open = false;
    for (const one of hidden) one.hidden = true;
  };
}
