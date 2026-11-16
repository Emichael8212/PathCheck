// "Report a mistake" (docs/BRIEF.md §4 "On every result"; docs/sprints/F18.md): an email
// link to PathCheck's contact address, already filled in with what the page showed. The
// message opens in the student's own mail app and is theirs to read, change and send:
// PathCheck sends nothing. It holds the result's own words and nothing of the transcript
// itself: no file name, no row, no grade.
import { REPORT_ADDRESS } from './wording';

/** As long as a whole link may be: longer ones are cut short by some mail apps. */
export const REPORT_LIMIT = 1900;

const TEXT = {
  ask: 'What looks wrong?',
  shown: 'What PathCheck showed:',
  more: (count: number): string => `… and ${count} more ${count === 1 ? 'course' : 'courses'}, left out to keep this message short.`,
  left: '… left out to keep this message short.',
};

/** What a page showed, as lines of an email. */
export interface Shown {
  readonly lines: readonly string[];
  /** The list of courses: the part that is cut first, from its end, when the link would be too long. */
  readonly list?: readonly string[];
  /** What comes after the list. */
  readonly after?: readonly string[];
}

export const NOTHING_SHOWN: Shown = { lines: [] };

const hrefOf = (subject: string, body: string): string => `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/**
 * The link. The message starts with a line for the student, then says what the page
 * showed, then the closing lines that every message has (the program and the review date).
 */
export function reportHref(subject: string, shown: Shown, closing: readonly string[]): string {
  const list = shown.list ?? [];
  const after = shown.after ?? [];
  const withResult = (result: readonly string[]): string => hrefOf(subject, [TEXT.ask, '', '', ...(result.length > 0 ? [TEXT.shown, ...result, ''] : []), ...closing].join('\r\n'));
  const resultWith = (kept: number): string[] => {
    const cut = list.length - kept;
    return [...shown.lines, ...list.slice(0, kept), ...(cut > 0 ? [TEXT.more(cut)] : []), ...after];
  };
  // Courses are left out from the end of the list until the link is short enough.
  for (let kept = list.length; kept >= 0; kept--) {
    const href = withResult(resultWith(kept));
    if (href.length <= REPORT_LIMIT) return href;
  }
  // Still too long without any course (no page of today's is): the message says that what the page showed
  // is left out, rather than a part of it. Lines that belong together, a finish and its caveat, are never parted.
  return withResult([TEXT.left]);
}
