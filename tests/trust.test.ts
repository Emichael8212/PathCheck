// @vitest-environment happy-dom
// F18: what goes with every result (docs/sprints/F18.md; docs/BRIEF.md §4 "On every result"):
// the two lines, "Report a mistake" filled in with what the page showed, the banner once the
// curriculum's review is more than twelve months old, and never "ask your advisor".
// The day is set by each test: nothing here depends on the day the tests run.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleA from '../synthetic/transcripts/sample-a.json';
import { renderPage, startApp, type App, type AppWindow } from '../src/app';
import { curriculum } from '../src/curriculum';
import { REPORT_LIMIT, reportHref } from '../src/report';
import { openTranscript } from '../src/review';
import { dayOf, oldReviewBanner, reportLink, reviewIsOld } from '../src/shell';

const root = join(import.meta.dirname, '..');
const folder = join(root, 'synthetic', 'transcripts');
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
const row = (prefix: string, number: string, grade = 'B') => ({ term: 'Fall 2026', transfer: false, prefix, number, description: 'A course', attempted: 3, earned: 3, grade, points: 0 });
/** Types a course on "Check my courses" and adds it. */
const add = (text: string): void => {
  const field = $<HTMLInputElement>('#add-course');
  field.focus();
  field.value = text;
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
};
const choose = (selector: string, value: string): void => {
  const list = $<HTMLSelectElement>(selector);
  list.value = value;
  list.dispatchEvent(new Event('change', { bubbles: true }));
};

const NOT_OFFICIAL = 'Not an official degree audit.';
const REVIEWED = 'Curriculum last reviewed: Nov 2026';
const PROGRAM = 'B.S. Computer Information Systems, Alabama State University';
const BANNER = 'The curriculum PathCheck uses was last reviewed in Nov 2026, more than 12 months ago. Requirements may have changed since: check your portal before you rely on this.';

/** The email a link opens: its address, subject and the lines of its body. */
const emailOf = (href: string) => {
  const parts = /^mailto:([^?]+)\?subject=([^&]*)&body=([^&]*)$/.exec(href);
  if (!parts) throw new Error(`not an email link: ${href}`);
  return { to: parts[1]!, subject: decodeURIComponent(parts[2]!), lines: decodeURIComponent(parts[3]!).split('\r\n') };
};
/** Uses "Report a mistake" as a student does (the mail app is not opened here), and gives the email it would open. */
const report = () => {
  const link = $<HTMLAnchorElement>('.foot a');
  link.click();
  return emailOf(link.getAttribute('href') ?? '');
};
/** What the email says the page showed: between its heading and the closing lines. */
const shown = (): string[] => {
  const { lines } = report();
  const from = lines.indexOf('What PathCheck showed:');
  return from < 0 ? [] : lines.slice(from + 1, lines.indexOf('', from));
};

let app: App;
const win = window as unknown as AppWindow & { today?: () => Date; print?: () => void };
// The mail app is never opened by a test.
const keepHere = (event: Event): void => { if ((event.target as Element | null)?.closest?.('a[href^="mailto:"]')) event.preventDefault(); };
/** Starts PathCheck on a given day of the student's device. */
const start = (year = 2026, month = 11, day = 16, hash = '#/'): void => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', hash);
  win.today = () => new Date(year, month - 1, day, 12);
  // A browser that can print, so that the result has its print button.
  win.print = () => {};
  app = startApp(win);
};
/** The result of a made-up transcript on "See what I have left". */
const result = async (name = 'sample-a'): Promise<void> => {
  go('#/left');
  await app.takeFile(madeUp(name));
  $('[data-continue]').click();
};
const bannerNow = (): HTMLElement | null => document.querySelector<HTMLElement>('.old-review');
beforeEach(() => {
  window.addEventListener('click', keepHere);
  start();
});
afterEach(() => {
  app.stop();
  window.removeEventListener('click', keepHere);
  delete win.today;
  delete win.print;
});

describe('the two lines', () => {
  it('carries the two lines on every result', async () => {
    const lines = (): void => {
      expect(tidy($('.top-note').textContent)).toBe(NOT_OFFICIAL);
      const foot = tidy($('footer.foot').textContent);
      expect(foot).toContain(NOT_OFFICIAL);
      expect(foot).toContain(REVIEWED);
    };
    // Start.
    lines();
    // "Check my courses": an answer of each kind, without a transcript.
    go('#/check');
    lines();
    for (const one of ['mgt 321', 'bio 230', 'fls 161']) add(one);
    const kinds = [...document.querySelectorAll('[data-entries] .cell-answer')].map(cell => tidy(cell.textContent));
    expect(kinds[0]).toMatch(/^Counts toward CIS/);
    expect(kinds[1]).toMatch(/^Doesn.t count toward CIS/);
    expect(kinds[2]).toMatch(/^Are you a legacy CIS student\?/);
    lines();
    // With a transcript: exact answers, the pace line, and a course needed for the sequence only.
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: [row('GEO', '206'), row('HUM', '101')] }, curriculum), continued: true });
    go('#/');
    go('#/check');
    add('his 132');
    expect(tidy($('[data-entries]').textContent)).toMatch(/Needed for the history sequence \(3 extra credits\)/);
    expect(document.querySelector('.pace-line')).not.toBeNull();
    lines();
    // "See what I have left": the review step, the result (checklist, pace, plan), with rows to fix, and the legacy question.
    $('[data-forget], [data-another]').click();
    go('#/left');
    await app.takeFile(madeUp('sample-a'));
    lines();
    $('[data-continue]').click();
    expect(document.querySelector('.reqs') && document.querySelector('[data-pace]') && document.querySelector('.plan')).not.toBeNull();
    lines();
    // On paper they are at the top as well as in the footer.
    expect(tidy($('[data-print-head]').textContent)).toContain(`${NOT_OFFICIAL} Not affiliated with Alabama State University. ${REVIEWED}`);
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: [row('ENG', '131'), row('MGT', '321', 'B+')] }, curriculum), continued: true });
    go('#/check');
    go('#/left');
    expect(document.querySelector('[data-to-fix]')).not.toBeNull();
    lines();
    $('[data-another]').click();
    await result('sample-b');
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    lines();
  });
});

describe('"Report a mistake"', () => {
  it('opens an email to the contact address', async () => {
    const pages: [string, string][] = [['#/', 'PathCheck: report a mistake'], ['#/check', 'PathCheck: Check my courses'], ['#/left', 'PathCheck: See what I have left']];
    for (const [hash, subject] of pages) {
      go(hash);
      const link = $<HTMLAnchorElement>('.foot a');
      expect([link.tagName, tidy(link.textContent), document.querySelectorAll('.foot a').length], hash).toEqual(['A', 'Report a mistake', 1]);
      // The link is whole as it is drawn, and again when it is used.
      for (const email of [emailOf(link.getAttribute('href') ?? ''), report()]) {
        expect(email.to, hash).toBe('report@pathcheck.example');
        expect(email.subject, hash).toBe(subject);
        // A line for the student first; the program and the review date last.
        expect(email.lines.slice(0, 3), hash).toEqual(['What looks wrong?', '', '']);
        expect(email.lines.slice(-2), hash).toEqual([PROGRAM, REVIEWED]);
      }
    }
    // A page with nothing to show yet says nothing about a result.
    go('#/');
    expect(report().lines).toEqual(['What looks wrong?', '', '', PROGRAM, REVIEWED]);
    // Without a review date none is made up.
    expect(emailOf(reportLink({ ...curriculum, lastReviewed: null })).lines).toEqual(['What looks wrong?', '', '', PROGRAM]);
  });

  it('fills the email with the courses and their answers', async () => {
    go('#/check');
    expect(shown()).toEqual(['No transcript added', 'No course is in the list.']);
    for (const one of ['mgt 321', 'bio 230', 'fls 161']) add(one);
    // Each course with the answer its row has on the page, in the page's own words.
    const onPage = (): string[] => [...document.querySelectorAll<HTMLElement>('[data-entries] [role="row"].row')].map(one => {
      const codeText = tidy(one.querySelector('.cell-name .code')?.textContent);
      const question = one.querySelector('.legacy-ask > p');
      const condition = tidy(one.querySelector('.cell-answer .condition')?.textContent);
      const answer = tidy(one.querySelector('.cell-answer .answer')?.textContent);
      return `${codeText} — ${question ? tidy(question.textContent) : condition ? `${answer} (${condition})` : answer}`;
    });
    expect(shown()).toEqual(['No transcript added', ...onPage()]);
    expect(shown()[1]).toBe('MGT 321 — Counts toward CIS — Business core (unless you’ve already passed it or filled this slot)');
    expect(shown()[2]).toBe('BIO 230 — Doesn’t count toward CIS — not in the CIS curriculum');
    expect(shown()[3]).toBe('FLS 161 — Are you a legacy CIS student?');
    // The list changes without the page being drawn again as a whole: the link used next holds the page as it is then.
    $('[data-legacy="yes"]').click();
    expect(shown()).toEqual(['No transcript added', 'Legacy CIS student: Yes', ...onPage()]);
    expect(shown()[4]).toMatch(/^FLS 161 — Counts toward CIS/);
    $('[data-remove="BIO 230"]').click();
    add('cis 300');
    expect(shown()).toEqual(['No transcript added', 'Legacy CIS student: Yes', ...onPage()]);
    expect(shown().join('\n')).not.toContain('BIO 230');
    expect(shown().join('\n')).toContain('CIS 300 — Counts toward CIS');
    // With a transcript: the pace line as the page has it, also after its lists change.
    await result();
    go('#/check');
    add('mgt 422');
    expect(shown()[0]).toBe('Transcript added');
    const paceLine = (): string => shown().find(line => /at this pace|credits in /.test(line)) ?? '';
    expect(tidy($('.pace-line').textContent)).toContain('at this pace you finish');
    // Written out with both lists' terms in their places, as the page has them.
    const lists = (): string[] => ['[data-line-term]', '[data-line-target]'].map(one => $(`${one} option[selected]`).getAttribute('value') ?? '');
    expect(paceLine()).toContain(`credits in ${lists()[0]} — `);
    expect(paceLine()).toMatch(new RegExp(`${lists()[1]}\\.$`));
    expect(paceLine()).toMatch(/credits in Spring 2027 — at this pace you finish .* your target/);
    expect(shown().indexOf(paceLine())).toBe(shown().length - 1);
    const first = paceLine();
    choose('[data-line-term]', 'Fall 2027');
    expect(paceLine()).toMatch(/credits in Fall 2027 — at this pace you finish/);
    expect(paceLine()).not.toBe(first);
    const targets = [...$<HTMLSelectElement>('[data-line-target]').options].map(option => option.value);
    choose('[data-line-target]', targets[targets.length - 1]!);
    expect(paceLine()).toContain(targets[targets.length - 1]!);
    // An empty list again.
    for (const button of [...document.querySelectorAll<HTMLElement>('[data-remove]')]) $(`[data-remove="${button.dataset.remove}"]`).click();
    expect(shown().slice(0, 3)).toEqual(['Transcript added', 'Legacy CIS student: Yes', 'No course is in the list.']);
  });

  it('fills the email with the result', async () => {
    // Before there is a result the email has no result lines: the upload page, the review step.
    go('#/left');
    expect(shown()).toEqual([]);
    await app.takeFile(madeUp('sample-a'));
    expect(shown()).toEqual([]);
    $('[data-continue]').click();
    const cards = [...document.querySelectorAll<HTMLElement>('.req')];
    const lines = shown();
    expect(lines.slice(0, 3)).toEqual([
      '81 credits left, 27 counted, 13 in progress, 121 in total',
      'On pace for Spring 2029: about 16 credits a term',
      'Target semester: Spring 2029. Fewest credits per term: 12 credits. Most credits per term: 18 credits. Summers: Off.',
    ]);
    // Every requirement with its status and credits, as its card has them.
    expect(lines.slice(3, 3 + cards.length)).toEqual(cards.map(card => `${tidy(card.querySelector('h3, .req-name')?.textContent)} — ${card.dataset.status}, ${tidy(card.querySelector('.req-credits, .req-cr')?.textContent).replace(/ cr$/, '')} cr`));
    expect(lines[3]).toBe('Orientation — Done, 1 / 1 cr');
    expect(cards.length).toBe(9);
    // The sequence sentence the page shows; no legacy answer was asked for or given.
    expect(lines[3 + cards.length]).toBe(tidy($('.sequence').textContent));
    expect(lines).toHaveLength(4 + cards.length);
    // The pace settings change: the pace answer and the settings line in the link used next are the new ones.
    $('[data-stepper="most"] [data-delta="-1"]').click();
    $('[data-pace-summers]').click();
    expect(shown()[1]).toBe(tidy($('[data-pace] h2').textContent) + ': ' + tidy($('[data-pace] h2 + p').textContent));
    expect(shown()[2]).toMatch(/^Target semester: .*Most credits per term: 17 credits\. .*Summers: On\.$/);
    $('[data-pace-summers]').click();
    $('[data-stepper="most"] [data-delta="1"]').click();
    // A move that makes the plan end later: the line under the plan is in the email.
    expect(shown().join('\n')).not.toContain('This draft ends in');
    $('[data-move="MGT 462"]').click();
    expect(shown()[shown().length - 1]).toBe('This draft ends in Fall 2029, later than the pace estimate above: you moved courses later.');
    expect(shown()[shown().length - 1]).toBe(tidy($('.plan-late').textContent));
    // A legacy student: nothing of the result while the question is asked, and the answer once it is given.
    $('[data-another]').click();
    await result('sample-b');
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    expect(shown()).toEqual([]);
    $('[data-legacy="yes"]').click();
    expect(shown()[0]).toBe('89 credits left, 26 counted, 6 in progress, 121 in total');
    expect(shown()[shown().length - 1]).toBe('Legacy CIS student: Yes');
    // No row taken on: no result lines.
    $('.review-foot [data-review-again]').click();
    for (let left = document.querySelectorAll('[data-out]').length; left > 0; left = document.querySelectorAll('[data-out]').length) $('[data-out]').click();
    $('[data-continue]').click();
    expect(shown()).toEqual([]);
  });

  it('keeps the email short and free of transcript rows', async () => {
    const requests = vi.spyOn(window, 'fetch');
    await result();
    $('[data-move="MGT 462"]').click();
    const rowsRead = (sampleA as { rows: { term: string; description: string }[] }).rows;
    const private_ = [...new Set(['sample-a', '.pdf', ...rowsRead.map(one => one.description), ...rowsRead.map(one => one.term)])];
    const check = (where: string): void => {
      const link = $<HTMLAnchorElement>('.foot a');
      link.click();
      const href = link.getAttribute('href') ?? '';
      // Short enough for a mail app, and nothing in it that a link cannot hold.
      expect(href.length, where).toBeLessThanOrEqual(REPORT_LIMIT);
      expect(href, where).toMatch(/^mailto:[A-Za-z0-9@.%&=?:_~!*'()-]+$/);
      const body = emailOf(href).lines.join('\n');
      // Nothing of the transcript itself: no file name, no row's description or term, no grade.
      for (const one of private_) expect(body, `${where}: ${one}`).not.toContain(one);
      expect(body, where).not.toMatch(/\bgrade|GPA|points\b/i);
    };
    check('the result');
    go('#/check');
    // Thirty courses typed: the list is cut from its end and says how many were left out; what comes after it is kept.
    const codes = curriculum.blocks.flatMap(block => block.required.map(course => course.code)).slice(0, 30);
    for (const one of codes) add(one);
    expect(document.querySelectorAll('[data-entries] [role="row"].row')).toHaveLength(30);
    check('thirty courses');
    const lines = shown();
    const listed = lines.filter(line => /^[A-Z]{2,4} \d{3} — /.test(line));
    const more = lines.find(line => line.startsWith('… and '));
    expect(listed.length).toBeGreaterThan(5);
    expect(listed.length).toBeLessThan(30);
    expect(listed.map(line => line.slice(0, line.indexOf(' — ')))).toEqual(codes.slice(0, listed.length));
    expect(more).toBe(`… and ${30 - listed.length} more courses, left out to keep this message short.`);
    expect(lines[lines.length - 1]).toMatch(/at this pace you finish|credits/);
    expect(lines.indexOf(more!)).toBe(lines.length - 2);
    // One course too many is said in the singular; a list that fits is whole.
    const one = emailOf(reportHref('s', { lines: [], list: ['x'.repeat(900), 'y'.repeat(900)] }, [])).lines;
    expect(one).toContain('… and 1 more course, left out to keep this message short.');
    expect(emailOf(reportHref('s', { lines: ['a'], list: ['b', 'c'], after: ['d'] }, ['e'])).lines).toEqual(['What looks wrong?', '', '', 'What PathCheck showed:', 'a', 'b', 'c', 'd', '', 'e']);
    // Using the link asks no server for anything.
    expect(requests).not.toHaveBeenCalled();
    requests.mockRestore();
  });
});

describe('the banner of an old review', () => {
  it('shows the banner once the review is more than 12 months old', async () => {
    app.stop();
    start(2027, 11, 16);
    const css = readFileSync(join(root, 'src', 'style.css'), 'utf8');
    const hiddenOnPaper = /^\s*([^{}/]+)\{ display: none !important; \}/m.exec(css.slice(css.lastIndexOf('@media print {')).replace(/\/\*[\s\S]*?\*\//g, ''))?.[1]?.trim() ?? '';
    expect(hiddenOnPaper).toContain('.no-print');
    const banner = (where: string): void => {
      const found = document.querySelectorAll<HTMLElement>('.old-review');
      expect(found, where).toHaveLength(1);
      // The first thing on the page, with the month and year of the review; and on paper too.
      expect($('#app').firstElementChild, where).toBe(found[0]);
      expect(tidy(found[0]!.textContent), where).toBe(BANNER);
      expect(found[0]!.closest(hiddenOnPaper), where).toBeNull();
    };
    banner('Start');
    go('#/check');
    banner('Check my courses');
    add('mgt 321');
    banner('Check my courses, with a course');
    go('#/left');
    banner('See what I have left');
    await app.takeFile(madeUp('sample-b'));
    banner('the review step');
    $('[data-continue]').click();
    banner('the legacy question');
    $('[data-legacy="yes"]').click();
    banner('the result');
    // The two lines are still there: the banner adds to them.
    expect(tidy($('footer.foot').textContent)).toContain(REVIEWED);
    // Later still.
    app.stop();
    start(2031, 1, 1);
    banner('years later');
  });

  it('reads the banner first and only once', async () => {
    app.stop();
    start(2027, 11, 16);
    const banner = $('.old-review');
    // A note with a name, before the top bar; ordinary text, not a live region; nothing in it to press.
    expect([banner.tagName, banner.getAttribute('role'), banner.getAttribute('aria-label')]).toEqual(['P', 'note', 'Curriculum may be out of date']);
    expect(banner.compareDocumentPosition($('header.top')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(banner.hasAttribute('aria-live')).toBe(false);
    expect(banner.querySelector('a, button, input, select, [tabindex]')).toBeNull();
    expect(banner.children).toHaveLength(0);
    // Moving between pages puts the keyboard on the page's heading, not on the banner; nothing announces it again.
    const announced = (): string => tidy(document.querySelector('#pathcheck-status')?.textContent) + tidy(document.querySelector('[data-said]')?.textContent);
    go('#/check');
    expect(document.activeElement).toBe($('h1'));
    add('mgt 321');
    add('bio 230');
    $('[data-remove="BIO 230"]').click();
    expect(announced()).not.toMatch(/last reviewed|12 months/);
    await result();
    $('[data-stepper="most"] [data-delta="1"]').click();
    $('[data-move="MGT 321"]').click();
    expect(announced()).not.toMatch(/last reviewed|12 months/);
    expect(document.querySelectorAll('.old-review')).toHaveLength(1);
  });

  it('shows no banner otherwise', async () => {
    // The day after the review, a year less a day, the anniversary itself, and a day before the review.
    for (const [year, month, day] of [[2026, 11, 16], [2027, 11, 14], [2027, 11, 15], [2026, 1, 1], [2020, 3, 15]] as const) {
      app.stop();
      start(year, month, day);
      for (const hash of ['#/', '#/check', '#/left']) {
        go(hash);
        expect(bannerNow(), `${year}-${month}-${day} ${hash}`).toBeNull();
      }
      expect(tidy($('#app').textContent)).not.toMatch(/12 months|out of date/);
    }
    // A curriculum without a review date claims nothing, however late it is.
    const undated = { ...curriculum, lastReviewed: null };
    expect(oldReviewBanner(undated, { year: 2040, month: 1, day: 1 })).toBe('');
    expect(renderPage('check', [{ id: 'x', name: 'x', curriculum: undated }] as never, undefined, undefined, undefined, { year: 2040, month: 1, day: 1 })).not.toContain('old-review');
    // Without a day to compare with there is none either (a page drawn as text, as the tests of other features do).
    expect(oldReviewBanner(curriculum, null)).toBe('');
    expect(renderPage('start')).not.toContain('old-review');
    expect(renderPage('left', undefined, undefined, undefined, undefined, { year: 2027, month: 11, day: 16 })).toMatch(/^\s*<p class="old-review" role="note" aria-label="Curriculum may be out of date">/);
  });

  it('counts twelve months by the calendar', () => {
    const old = (reviewed: string, year: number, month: number, day: number): boolean => reviewIsOld(reviewed, { year, month, day });
    // Reviewed 2026-11-15: from 2027-11-16.
    expect([old('2026-11-15', 2027, 11, 15), old('2026-11-15', 2027, 11, 16)]).toEqual([false, true]);
    expect([old('2026-11-15', 2027, 10, 31), old('2026-11-15', 2027, 12, 1), old('2026-11-15', 2028, 1, 1), old('2026-11-15', 2026, 12, 31)]).toEqual([false, true, true, false]);
    // A day the later month does not have counts from that month's last day.
    expect([old('2024-02-29', 2025, 2, 28), old('2024-02-29', 2025, 3, 1)]).toEqual([false, true]);
    expect([old('2026-08-31', 2027, 8, 31), old('2026-08-31', 2027, 9, 1)]).toEqual([false, true]);
    expect([old('2026-03-31', 2027, 3, 31), old('2026-03-31', 2027, 4, 1)]).toEqual([false, true]);
    expect([old('2027-02-28', 2028, 2, 28), old('2027-02-28', 2028, 2, 29)]).toEqual([false, true]);
    expect([old('2026-12-31', 2027, 12, 31), old('2026-12-31', 2028, 1, 1)]).toEqual([false, true]);
    // A review date in the future, none at all, or one that is not a date: never.
    expect([old('2030-01-01', 2027, 1, 1), reviewIsOld(null, { year: 2040, month: 1, day: 1 }), old('Nov 2026', 2040, 1, 1), reviewIsOld('2026-11-15', null)]).toEqual([false, false, false, false]);
    // The day is the device's own: the last second of the anniversary is not yet late, the first of the next day is.
    expect(reviewIsOld('2026-11-15', dayOf(new Date(2027, 10, 15, 23, 59, 59)))).toBe(false);
    expect(reviewIsOld('2026-11-15', dayOf(new Date(2027, 10, 16, 0, 0, 1)))).toBe(true);
    expect(dayOf(new Date(2027, 0, 1, 0, 0, 0))).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('changes nothing else with the day', async () => {
    // The same visit on two days fifteen years apart: every page and every email is the same, apart from the banner.
    const visit = async (year: number): Promise<{ pages: string[]; emails: string[]; banners: boolean[] }> => {
      app.stop();
      start(year, 3, 15);
      const pages: string[] = [];
      const emails: string[] = [];
      const banners: boolean[] = [];
      const keep = (): void => {
        banners.push(bannerNow() !== null);
        emails.push(report().lines.join('\n'));
        const copy = $('#app').cloneNode(true) as HTMLElement;
        copy.querySelector('.old-review')?.remove();
        pages.push(copy.innerHTML);
      };
      keep();
      go('#/check');
      for (const one of ['mgt 321', 'bio 230', 'cis 300']) add(one);
      keep();
      await result();
      keep();
      $('[data-move="MGT 462"]').click();
      keep();
      go('#/check');
      add('mgt 422');
      expect(document.querySelector('.pace-line')).not.toBeNull();
      keep();
      return { pages, emails, banners };
    };
    const early = await visit(2020);
    const late = await visit(2035);
    expect(early.banners).toEqual([false, false, false, false, false]);
    expect(late.banners).toEqual([true, true, true, true, true]);
    expect(late.emails).toEqual(early.emails);
    expect(late.pages).toEqual(early.pages);
    // (The pages hold their terms and years from the transcript and the settings, never from the day.)
    expect(early.pages[2]).toContain('Spring 2029');
  });
});

describe('advisors', () => {
  it('never sends the student to an advisor', async () => {
    app.stop();
    start(2027, 11, 16);
    const texts: string[] = [];
    const keep = (): void => {
      texts.push(tidy($('#app').textContent), report().lines.join(' '), tidy(document.querySelector('#pathcheck-status')?.textContent), tidy(document.querySelector('[data-said]')?.textContent));
      for (const named of document.querySelectorAll('[aria-label], [title]')) texts.push(`${named.getAttribute('aria-label') ?? ''} ${named.getAttribute('title') ?? ''}`);
    };
    keep();
    go('#/check');
    for (const one of ['mgt 321', 'bio 230', 'fls 161', 'cis 304', 'xyz 999']) add(one);
    keep();
    $('[data-legacy="no"]').click();
    keep();
    await result('sample-b');
    keep();
    $('[data-stepper="most"] [data-delta="-1"]').click();
    $('[data-move="MGT 462"]').click();
    keep();
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: [row('ENG', '131'), row('MGT', '321', 'B+'), 'not a row'] }, curriculum), continued: false });
    go('#/check');
    go('#/left');
    keep();
    $('[data-continue]').click();
    keep();
    go('#/check');
    keep();
    const all = texts.join('\n');
    expect(all.length).toBeGreaterThan(5000);
    // Nothing sends the student to an advisor: PathCheck answers, or names the portal.
    expect(all).not.toMatch(/\b(ask|see|contact|consult|talk to|speak (to|with)|check with|email|visit|meet( with)?)\s+(your|an|the|a)\s+(academic\s+)?advis[eo]r/i);
    // The one mention of an advisor on any page is the design's button, "Print / save PDF for your advisor".
    const mentions = all.match(/advis[eo]r/gi) ?? [];
    expect(mentions.length).toBeGreaterThan(0);
    expect(all.match(/Print \/ save PDF for your advisor/g)).toHaveLength(mentions.length);
    // And in everything PathCheck can ever say: the only line of its code that names an advisor is that button's.
    const lines = readdirSync(join(root, 'src')).filter(name => /\.(ts|json|css)$/.test(name))
      .flatMap(name => readFileSync(join(root, 'src', name), 'utf8').split('\n').filter(line => /advis[eo]r/i.test(line)).map(line => `${name}: ${line.trim()}`));
    expect(lines).toEqual(["print.ts: button: 'Print / save PDF for your advisor',"]);
    expect(readFileSync(join(root, 'index.html'), 'utf8')).not.toMatch(/advis[eo]r/i);
  });
});
