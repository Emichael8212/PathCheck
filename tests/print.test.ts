// @vitest-environment happy-dom
// F17: the printed summary (docs/sprints/F17.md; docs/BRIEF.md §4 Flow B step 6). The button,
// what is prepared for paper and put back, the paper-only lines, and the stylesheet's print
// rules as text. The paper itself (a PDF from a real browser) is checked by the evaluator.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import madeUpProgram from './fixtures/made-up-program.json';
import sampleA from '../synthetic/transcripts/sample-a.json';
import { startApp, type App, type AppWindow } from '../src/app';
import { curriculum, loadCurriculum } from '../src/curriculum';
import { emptyLeft, leftPage } from '../src/left';
import { defaultSettings, paceControlsHtml, paceOf, readTerm } from '../src/pace';
import { PRINT_TITLE, openForPaper, printHeadHtml } from '../src/print';
import { openTranscript } from '../src/review';
import { foot } from '../src/shell';

const folder = join(import.meta.dirname, '..', 'synthetic', 'transcripts');
const fileOf = (bytes: Uint8Array, name: string) => ({ name, size: bytes.length, arrayBuffer: async (): Promise<ArrayBuffer> => bytes.slice().buffer as ArrayBuffer });
const madeUp = (name: string) => fileOf(new Uint8Array(readFileSync(join(folder, `${name}.pdf`))), `${name}.pdf`);
const tidy = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const go = (hash: string): void => {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};
const decode = (html: string): string => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/ ([,.;:)])/g, '$1').trim();
const row = (prefix: string, number: string, grade = 'B') => ({ term: 'Fall 2026', transfer: false, prefix, number, description: 'A course', attempted: 3, earned: 3, grade, points: 0 });

const TITLE = 'See what I have left — PathCheck';
const BUTTON = 'Print / save PDF for your advisor';
/** How the page stands: which requirement is open, which is hidden, what the filter and the tab say. */
const standing = () => ({
  open: [...document.querySelectorAll<HTMLDetailsElement>('details')].map(one => one.open),
  hidden: [...document.querySelectorAll<HTMLElement>('.req')].map(one => one.hidden),
  filter: [...document.querySelectorAll('[data-reqs]')].map(one => one.getAttribute('aria-pressed')),
  title: document.title,
});
const forPaper = (now = standing()): boolean => now.open.every(Boolean) && !now.hidden.some(Boolean) && now.title === PRINT_TITLE;

let app: App;
// The browser's print window, and the print media query: the simulated browser has neither.
let printed: ReturnType<typeof standing>[];
let mediaListeners: ((change: { matches: boolean }) => void)[];
const browser = (withPrint = true): AppWindow => {
  printed = [];
  mediaListeners = [];
  const win = window as unknown as AppWindow & { print?: () => void; matchMedia: unknown };
  if (withPrint) win.print = () => { printed.push(standing()); };
  else delete win.print;
  win.matchMedia = (query: string) => ({
    matches: false,
    addEventListener: (_type: string, listener: (change: { matches: boolean }) => void) => { if (query === 'print') mediaListeners.push(listener); },
    removeEventListener: (_type: string, listener: (change: { matches: boolean }) => void) => { mediaListeners = mediaListeners.filter(one => one !== listener); },
  });
  return win;
};
const start = (withPrint = true): void => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#/left');
  app = startApp(browser(withPrint));
};
const result = async (name = 'sample-a'): Promise<void> => {
  await app.takeFile(madeUp(name));
  $('[data-continue]').click();
};
beforeEach(() => { start(); });
afterEach(() => { app.stop(); });

describe('the print button', () => {
  it('offers print with the result', async () => {
    // Not before there is a result.
    expect(document.querySelector('[data-print], .actions')).toBeNull();
    await app.takeFile(madeUp('sample-a'));
    expect(document.querySelector('[data-print], .actions')).toBeNull();
    $('[data-continue]').click();
    // One button, the design's: primary, with its icon, in the row of actions after the draft plan.
    const buttons = document.querySelectorAll<HTMLElement>('[data-print]');
    expect(buttons).toHaveLength(1);
    const button = buttons[0]!;
    expect([button.tagName, button.getAttribute('type'), button.className, tidy(button.textContent)]).toEqual(['BUTTON', 'button', 'btn primary', BUTTON]);
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(button.parentElement?.className).toBe('actions no-print');
    expect($('.plan').compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The only mention of an advisor is the button's own words: nothing sends the student to one.
    expect(tidy($('#app').textContent).match(/advisor/gi)).toEqual(['advisor']);
    expect(tidy($('#app').textContent)).not.toMatch(/ask (your|an) advisor|see (your|an) advisor/i);
    // Not on the other pages.
    for (const hash of ['#/', '#/check']) {
      go(hash);
      expect(document.querySelector('[data-print], .actions'), hash).toBeNull();
    }
    go('#/left');
    expect(document.querySelectorAll('[data-print]')).toHaveLength(1);
    // Not before the legacy answer; there once it is given.
    $('[data-another]').click();
    await result('sample-b');
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    expect(document.querySelector('[data-print], .actions')).toBeNull();
    $('[data-legacy="yes"]').click();
    expect(tidy($('[data-print]').textContent)).toBe(BUTTON);
    // Not with no row taken on.
    $('.review-foot [data-review-again]').click();
    for (let left = document.querySelectorAll('[data-out]').length; left > 0; left = document.querySelectorAll('[data-out]').length) $('[data-out]').click();
    $('[data-continue]').click();
    expect(document.querySelector('[data-no-rows]')).not.toBeNull();
    expect(document.querySelector('[data-print], .actions')).toBeNull();
  });

  it('offers no print where the browser has none', async () => {
    app.stop();
    start(false);
    await result();
    expect(document.querySelector('.plan')).not.toBeNull();
    expect(document.querySelector('[data-print], .actions')).toBeNull();
    expect(tidy($('main').textContent)).not.toContain('Print');
    // After a part of the page is drawn again, and the whole page, there is still none.
    $('[data-stepper="most"] [data-delta="1"]').click();
    go('#/check');
    go('#/left');
    expect(document.querySelector('[data-print], .actions')).toBeNull();
  });

  it("opens the browser's print window", async () => {
    await result();
    const requests = vi.spyOn(window, 'fetch');
    expect(document.title).toBe(TITLE);
    $('[data-print]').click();
    // Once; the tab is named for the file while the window is open, and has its own name again after.
    expect(printed).toHaveLength(1);
    expect(printed[0]!.title).toBe('PathCheck summary');
    expect(document.title).toBe(TITLE);
    expect(document.activeElement).toBe($('[data-print]'));
    // The browser prints: PathCheck makes no file and asks no server for anything.
    expect(requests).not.toHaveBeenCalled();
    requests.mockRestore();
    $('[data-print]').click();
    expect(printed).toHaveLength(2);
  });
});

describe('what is prepared for paper', () => {
  it('opens every requirement before it prints and puts the page back once', async () => {
    await result();
    // As a student leaves it: "Not done" chosen, one card opened, one closed.
    $('[data-reqs="not-done"]').click();
    const cards = [...document.querySelectorAll<HTMLDetailsElement>('.req details')];
    cards[2]!.open = false;
    cards[6]!.open = true;
    const before = standing();
    expect(before.hidden.filter(Boolean).length).toBeGreaterThan(0);
    expect(before.open.filter(one => !one).length).toBeGreaterThan(0);
    expect(before.filter).toEqual(['false', 'true']);

    $('[data-print]').click();
    // At the moment the browser's print is called: everything open, nothing hidden, the list of courses that do not count too.
    expect(printed).toHaveLength(1);
    expect(forPaper(printed[0])).toBe(true);
    expect(printed[0]!.open).toHaveLength(document.querySelectorAll('details').length);
    expect(printed[0]!.filter).toEqual(['false', 'true']);
    // After the call returns the page is as it was.
    expect(standing()).toEqual(before);
    // A later "printing ended" from the browser changes nothing more, also after the student went on.
    cards[6]!.open = false;
    const later = standing();
    window.dispatchEvent(new Event('afterprint'));
    for (const listener of mediaListeners) listener({ matches: false });
    expect(standing()).toEqual(later);
    // The filter still works on the page that was put back.
    $('[data-reqs="all"]').click();
    expect(standing().hidden.some(Boolean)).toBe(false);
  });

  it("does the same for the browser's own Print", async () => {
    await result();
    $('[data-reqs="not-done"]').click();
    const before = standing();
    expect(mediaListeners).toHaveLength(1);
    // The browser says printing starts: by its event, by the print media query, or by both for one print.
    window.dispatchEvent(new Event('beforeprint'));
    expect(forPaper()).toBe(true);
    mediaListeners[0]!({ matches: true });
    window.dispatchEvent(new Event('beforeprint'));
    expect(forPaper()).toBe(true);
    // It ends: the page is put back, once.
    window.dispatchEvent(new Event('afterprint'));
    expect(standing()).toEqual(before);
    const opened = document.querySelector<HTMLDetailsElement>('.req details:not([open])')!;
    opened.open = true;
    const later = standing();
    mediaListeners[0]!({ matches: false });
    window.dispatchEvent(new Event('afterprint'));
    expect(standing()).toEqual(later);
    // By the media query alone.
    mediaListeners[0]!({ matches: true });
    expect(forPaper()).toBe(true);
    mediaListeners[0]!({ matches: false });
    expect(standing()).toEqual(later);
    // The button's own print inside a print the browser already announced puts back once, at the end.
    window.dispatchEvent(new Event('beforeprint'));
    expect(forPaper()).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(standing()).toEqual(later);

    // Where there is no result there is nothing to prepare: the tab keeps its name.
    for (const hash of ['#/', '#/check']) {
      go(hash);
      const title = document.title;
      window.dispatchEvent(new Event('beforeprint'));
      expect(document.title, hash).toBe(title);
      window.dispatchEvent(new Event('afterprint'));
    }
    // A page drawn again during a print is not changed by the print's end.
    go('#/left');
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe(PRINT_TITLE);
    go('#/check');
    expect(document.title).toBe('Check my courses — PathCheck');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Check my courses — PathCheck');
    // Once the app has stopped it listens to nothing.
    go('#/left');
    app.stop();
    expect(mediaListeners).toHaveLength(0);
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe(TITLE);
  });

  it('prepares nothing without a result', () => {
    document.body.innerHTML = '<div id="app"><main class="left"><details class="closed"></details></main></div>';
    expect(openForPaper(document)).toBeNull();
    expect(document.querySelector('details')!.open).toBe(false);
  });
});

describe('the lines on paper only', () => {
  const transcript = openTranscript('sample-a.pdf', sampleA, curriculum);
  const page = leftPage(curriculum, { ...emptyLeft(), transcript, continued: true });

  it('says what the paper is, at its top', () => {
    // The first thing in the page's body, before its heading; shown on paper only.
    expect(page).toMatch(/<main class="left wrap">\s*<div class="print-only print-head" data-print-head>\s*<p><strong>PathCheck summary — B\.S\. Computer Information Systems, Alabama State University<\/strong><\/p>\s*<p>Not an official degree audit\. Not affiliated with Alabama State University\. Curriculum last reviewed: Nov 2026<\/p>\s*<\/div>\s*<div class="page-head">/);
    expect(page.match(/data-print-head/g)).toHaveLength(1);
    // The same sentences as the footer, which ends the paper.
    const end = decode(foot(curriculum));
    for (const sentence of ['Not an official degree audit.', 'Not affiliated with Alabama State University', 'Curriculum last reviewed: Nov 2026']) {
      expect(end, sentence).toContain(sentence);
      expect(decode(printHeadHtml(curriculum)), sentence).toContain(sentence);
    }
    // Without a review date none is made up.
    expect(decode(printHeadHtml({ ...curriculum, lastReviewed: null }))).toBe('PathCheck summary — B.S. Computer Information Systems, Alabama State University Not an official degree audit. Not affiliated with Alabama State University.');
    // The program and the institution are the curriculum file's: another program prints its own.
    const other = loadCurriculum(madeUpProgram);
    expect(decode(printHeadHtml(other))).toContain(`PathCheck summary — ${other.program}, ${other.institution}`);
    expect(other.program).not.toBe(curriculum.program);
    // Only with a result: not on the upload page, not in the review step.
    expect(leftPage(curriculum)).not.toContain('print-head');
    expect(leftPage(curriculum, { ...emptyLeft(), transcript, continued: false })).not.toContain('print-head');
  });

  it('prints the pace settings as a line', async () => {
    // In the place of the controls, right after them, on paper only.
    expect(page).toMatch(/<\/fieldset>\s*<\/div>\s*<p class="print-only pace-settings" data-pace-settings>Target semester: Spring 2029\. Fewest credits per term: 12 credits\. Most credits per term: 18 credits\. Summers: Off\.<\/p>/);
    // It follows the controls.
    await result();
    const line = (): string => tidy($('[data-pace-settings]').textContent);
    expect(line()).toBe('Target semester: Spring 2029. Fewest credits per term: 12 credits. Most credits per term: 18 credits. Summers: Off.');
    $('[data-stepper="most"] [data-delta="1"]').click();
    $('[data-stepper="fewest"] [data-delta="-1"]').click();
    expect(line()).toMatch(/^Target semester: Spring 2029\. Fewest credits per term: 11 credits\. .*Most credits per term: 19 credits\. .*Summers: Off\.$/);
    const list = $<HTMLSelectElement>('[data-pace-target]');
    list.value = 'Fall 2029';
    list.dispatchEvent(new Event('change', { bubbles: true }));
    $('[data-pace-summers]').click();
    expect(line()).toMatch(/^Target semester: Fall 2029\. .*Summers: On\.$/);
    expect($('[data-pace-settings]').className).toBe('print-only pace-settings');
    expect(document.querySelectorAll('[data-pace-settings]')).toHaveLength(1);
    // Without an estimate there are no controls and no line.
    const latest = readTerm('Fall 2026');
    expect(paceControlsHtml(paceOf(0, latest, defaultSettings()), defaultSettings())).toBe('');
    expect(paceControlsHtml(paceOf(81, null, defaultSettings()), defaultSettings())).toBe('');
  });
});

describe("the stylesheet's print rules", () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'src', 'style.css'), 'utf8');
  /** The inside of every block that starts with this line. */
  const blocks = (opening: string): string[] => {
    const found: string[] = [];
    for (let at = css.indexOf(opening); at >= 0; at = css.indexOf(opening, at + 1)) {
      let depth = 0;
      let end = at + opening.length - 1;
      for (; end < css.length; end++) {
        if (css[end] === '{') depth++;
        if (css[end] === '}' && --depth === 0) break;
      }
      found.push(css.slice(at + opening.length, end));
    }
    return found;
  };
  const print = blocks('@media print {');
  const rules = print.join('\n');
  // What print media never shows: the selectors of the rule that hides.
  const hiddenOnPaper = /^\s*([^{}]+)\{ display: none !important; \}/m.exec((print[print.length - 1] ?? '').replace(/\/\*[\s\S]*?\*\//g, ''))?.[1]?.trim() ?? '';

  it('prints filtered cards whatever happens', () => {
    expect(print).toHaveLength(2);
    // A card that "Not done" hides, and the inside of a closed requirement, without any signal from the browser.
    expect(rules).toContain('.req[hidden] { display: block !important; }');
    expect(rules).toContain('details:not([open])::details-content { content-visibility: visible; }');
    // The paper-only lines: never on the screen, always on paper.
    expect(css.indexOf('.print-only { display: none; }')).toBeGreaterThan(0);
    expect(css.indexOf('.print-only { display: none; }')).toBeLessThan(css.lastIndexOf('@media print {'));
    expect(rules).toContain('.print-only { display: block; }');
    // Nothing is cut where it can be kept together, and no heading is left alone.
    expect(rules).toMatch(/\.plan-entry, \.req, \.semester, [^{]*\{ break-inside: avoid; \}/);
    expect(rules).toMatch(/h1, h2, h3, [^{]*\{ break-after: avoid; \}/);
    expect(rules).toContain('print-color-adjust: exact;');
  });

  it('marks every control as not printed', async () => {
    expect(hiddenOnPaper).toBe('.top, .no-print, .pace, .review-foot, .foot a, [data-review-again], [data-legacy-change]');
    const controls = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#app button, #app select, #app input, #app textarea, #app a, #app [role="switch"], #app [tabindex="0"]')];
    const printedControls = (): string[] => controls().filter(one => !one.closest(hiddenOnPaper)).map(one => tidy(one.textContent) || one.tagName);
    // The design's student; a legacy student with the legacy line; a transcript with a row still to fix.
    await result();
    expect(controls().length).toBeGreaterThan(40);
    expect(printedControls()).toEqual([]);
    $('[data-another]').click();
    await result('sample-b');
    $('[data-legacy="yes"]').click();
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    expect(printedControls()).toEqual([]);
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: [row('ENG', '131'), row('MGT', '321', 'B+')] }, curriculum), continued: true });
    go('#/check');
    go('#/left');
    expect(document.querySelector('[data-to-fix] [data-review-again]')).not.toBeNull();
    expect(printedControls()).toEqual([]);
    // What a requirement's heading row says is text on paper; only its "Show courses" cue is a control.
    for (const cue of document.querySelectorAll('.req summary .req-show')) expect(cue.closest(hiddenOnPaper)).not.toBeNull();
  });

  it('keeps paper white on a dark device', () => {
    // The dark colours and the print colours are both set on the page's root: the print ones come later and so win.
    const dark = blocks('@media (prefers-color-scheme: dark) {');
    expect(dark).toHaveLength(1);
    expect(css.indexOf('@media (prefers-color-scheme: dark) {')).toBeLessThan(css.indexOf('@media print {'));
    const selectorOf = (block: string): string => /^\s*([^{]+?)\s*\{/.exec(block)?.[1] ?? '';
    expect([selectorOf(dark[0]!), selectorOf(print[0]!)]).toEqual([':root', ':root']);
    // Every colour the dark device changes is set again for paper, so that none of the dark ones is printed.
    const tokens = (block: string): string[] => [...block.matchAll(/(--[a-z0-9-]+):/g)].map(found => found[1]!).sort();
    expect(tokens(dark[0]!).filter(token => !tokens(print[0]!).includes(token))).toEqual([]);
    expect(print[0]).toMatch(/color-scheme: light;/);
    expect(print[0]).toMatch(/--bg: #ffffff;/);
    expect(print[0]).toMatch(/--surface: #ffffff;/);
  });
});
