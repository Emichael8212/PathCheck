// @vitest-environment happy-dom
// F23: when upload is unavailable, the page says so plainly, and Flow A still works
// (docs/sprints/F23.md; docs/BRIEF.md §4 and §7). The built site's app, with stand-ins for
// PathCheck's reader and for Cloudflare's widget: every cause of an outage, a limit and a
// bot check that does not pass, on every page. Nothing here reaches a network.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { onTestDay } from './day';
import type { App, AppWindow } from '../src/app';

const root = join(import.meta.dirname, '..');
const SENTENCE = 'Upload isn’t available right now — try again tomorrow';
const READING = 'Reading your transcript…';
const TICK = 'One more step: tick the box at the bottom of the window.';
const CONDITION = 'unless you’ve already passed it or filled this slot';

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
const heading = (): string => tidy($('h1').textContent);
const main = (): string => tidy($('main').textContent);
const message = (): string => tidy($('[data-refusal]').textContent);
const said = (): string => tidy($('#pathcheck-status').textContent);
const field = (): HTMLInputElement => $('#add-course');
const type = (text: string): void => {
  field().focus();
  field().value = text;
  field().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
};
const add = (text: string): void => { type(text); field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); };
const answerOf = (code: string): string => {
  const row = [...document.querySelectorAll<HTMLElement>('[data-entries] [role="row"].row')].find(one => tidy(one.querySelector('.cell-name .code')?.textContent) === code);
  if (!row) throw new Error(`no row for ${code}`);
  return tidy(row.querySelector('.cell-answer')?.textContent);
};
const pdf = (words = 'my own transcript') => {
  const bytes = new TextEncoder().encode(`%PDF-1.7 ${words}`);
  return { name: 'mine.pdf', size: bytes.length, arrayBuffer: (): Promise<ArrayBuffer> => Promise.resolve(bytes.slice().buffer as ArrayBuffer) };
};
const sampleRows = (name: string): unknown[] => (JSON.parse(readFileSync(join(root, 'synthetic', 'transcripts', `${name}.json`), 'utf8')) as { rows: unknown[] }).rows;
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type WidgetOptions = Record<string, (value?: unknown) => void>;
/** Cloudflare's widget, standing in: what it does once drawn. By default it passes. */
const widget = (drawn: (options: WidgetOptions) => void = options => { options.callback!('a-token'); }): void => {
  vi.stubGlobal('turnstile', { render: (_place: unknown, options: WidgetOptions) => { queueMicrotask(() => { drawn(options); }); return 'widget'; }, remove: () => undefined });
};
/** PathCheck's reader, standing in. */
const reader = (answer: () => Response | Promise<Response>) => {
  const posted = vi.fn(() => Promise.resolve().then(answer));
  vi.stubGlobal('fetch', posted);
  return posted;
};
const working = () => reader(() => json({ rows: sampleRows('sample-a'), model: 'gemini-3.5-flash-lite' }));

/** Every cause that is not the student's: what stands in, and whether the PDF is posted at all. */
const CAUSES: readonly { name: string; posted: boolean; arrange(): ReturnType<typeof reader> }[] = [
  // An outage.
  { name: 'the reader cannot be reached', posted: true, arrange: () => { widget(); return reader(() => Promise.reject(new TypeError('Failed to fetch'))); } },
  { name: 'the reader does not answer in time', posted: true, arrange: () => { widget(); return reader(() => Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))); } },
  ...[500, 502, 503, 404].map(status => ({ name: `the reader answers ${status}`, posted: true, arrange: () => { widget(); return reader(() => json({ error: 'unavailable' }, status)); } })),
  { name: 'the reader answers a page that is no answer', posted: true, arrange: () => { widget(); return reader(() => new Response('<!doctype html><title>Site not available</title>', { status: 200 })); } },
  { name: 'the reader answers no list of rows', posted: true, arrange: () => { widget(); return reader(() => json({ rows: 'MGT 321 A' })); } },
  // A limit.
  { name: 'the day’s three uploads are used', posted: true, arrange: () => { widget(); return reader(() => json({ error: 'limit' }, 429)); } },
  { name: 'the month’s cap is reached', posted: true, arrange: () => { widget(); return reader(() => json({ error: 'limit' }, 429)); } },
  { name: 'the browser’s number is refused', posted: true, arrange: () => { widget(); return reader(() => json({ error: 'browser' }, 400)); } },
  // The bot check.
  { name: 'the function refuses the bot check', posted: true, arrange: () => { widget(); return reader(() => json({ error: 'check' }, 403)); } },
  {
    name: 'Cloudflare’s script is blocked', posted: false,
    arrange: () => {
      vi.stubGlobal('turnstile', undefined);
      vi.spyOn(document.head, 'append').mockImplementation((...nodes: unknown[]) => { queueMicrotask(() => { (nodes[0] as { onerror?: () => void }).onerror?.(); }); });
      return working();
    },
  },
  { name: 'the widget fails', posted: false, arrange: () => { widget(options => { options['error-callback']!(); }); return working(); } },
  { name: 'nobody ticks the box in time', posted: false, arrange: () => { widget(options => { options['before-interactive-callback']!(); options['timeout-callback']!(); }); return working(); } },
];

let hosted: typeof import('../src/app');
let site: App | null = null;
/** Opens the built site on a page, as a student with nothing kept. */
const open = (hash: string): App => {
  site?.stop();
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', hash);
  site = hosted.startApp(onTestDay(window as unknown as AppWindow));
  return site;
};
/** What the page must not say about any of these causes. */
const noOtherWords = (where: string): void => {
  expect(main(), where).not.toContain(READING);
  expect(main(), where).not.toContain(TICK);
  expect(main(), where).not.toMatch(/try again later|\berror\b|failed|\b[45]\d\d\b|unavailable|Cloudflare|Gemini|limit/i);
};

beforeAll(async () => {
  vi.stubEnv('DEV', false);
  vi.resetModules();
  hosted = await import('../src/app');
});
afterEach(() => {
  site?.stop();
  site = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('when upload is unavailable', () => {
  it('says so on See what I have left, whatever the cause', async () => {
    expect(CAUSES.length).toBe(15);
    for (const cause of CAUSES) {
      const app = open('#/left');
      const posted = cause.arrange();
      $('[data-browse]').focus();
      await app.takeFile(pdf());
      // The sentence, under the upload control, read out once; the student is where they were.
      expect(app.route, cause.name).toBe('left');
      expect(heading(), cause.name).toBe('See what I have left');
      expect(message(), cause.name).toBe(SENTENCE);
      expect($('[data-refusal]').previousElementSibling?.matches('[data-drop]'), cause.name).toBe(true);
      expect(said(), cause.name).toBe(SENTENCE);
      noOtherWords(cause.name);
      // Nothing is taken on, and nothing of the file is kept (the browser's number for the day may be, when the PDF was posted).
      expect(app.left.transcript, cause.name).toBeNull();
      expect(document.querySelector('.review-row'), cause.name).toBeNull();
      expect(posted.mock.calls.length, cause.name).toBe(cause.posted ? 1 : 0);
      expect(Object.keys(window.localStorage), cause.name).toEqual(cause.posted ? ['pathcheck.browser'] : []);
      // The upload control is still there, with the keyboard on it: the student can try again.
      expect(document.activeElement, cause.name).toBe($('[data-browse]'));
      expect(document.getElementById('pathcheck-check')?.hasAttribute('data-asked'), cause.name).toBe(false);
    }
  });

  it('says so on Check my courses, whatever the cause', async () => {
    for (const cause of CAUSES) {
      const app = open('#/check');
      add('mgt 321');
      const posted = cause.arrange();
      $('[data-choose]').focus();
      await app.takeFile(pdf());
      // Under the transcript card; the student stays on the page.
      expect(app.route, cause.name).toBe('check');
      expect(heading(), cause.name).toBe('Check my courses');
      expect(message(), cause.name).toBe(SENTENCE);
      expect($('[data-refusal]').previousElementSibling?.matches('section.exact'), cause.name).toBe(true);
      expect(said(), cause.name).toBe(SENTENCE);
      noOtherWords(cause.name);
      expect(app.left.transcript, cause.name).toBeNull();
      expect(posted.mock.calls.length, cause.name).toBe(cause.posted ? 1 : 0);
      expect(document.activeElement, cause.name).toBe($('[data-choose]'));
      // The page is the one of a student without a transcript.
      expect(tidy($('[data-status]').textContent), cause.name).toBe('No transcript added');
      expect(answerOf('MGT 321'), cause.name).toBe(`Counts toward CIS — Business core ${CONDITION}`);
      expect(document.querySelector('[data-pace-line]'), cause.name).toBeNull();
    }
  });

  it('says so after a file chosen on Start', async () => {
    const named = (name: string) => { const found = CAUSES.find(cause => cause.name === name); if (!found) throw new Error(`no cause called ${name}`); return found; };
    for (const cause of [named('the reader cannot be reached'), named('the day’s three uploads are used'), named('Cloudflare’s script is blocked')]) {
      const app = open('#/');
      const posted = cause.arrange();
      await app.takeFile(pdf());
      // Start has no place for the sentence: the student is on the page of the flow, with it under the upload control.
      expect(app.route, cause.name).toBe('left');
      expect(window.location.hash, cause.name).toBe('#/left');
      expect(message(), cause.name).toBe(SENTENCE);
      expect(said(), cause.name).toBe(SENTENCE);
      expect(document.activeElement, cause.name).toBe($('[data-browse]'));
      expect(posted.mock.calls.length, cause.name).toBe(cause.posted ? 1 : 0);
      noOtherWords(cause.name);
    }
    // Dropped on Start's drop zone: the same.
    open('#/');
    // (The simulated browser tells of an address change a moment later: the one of the try before is let through first.)
    await new Promise(resolve => { setTimeout(resolve, 20); });
    widget();
    const posted = reader(() => json({ error: 'unavailable' }, 503));
    const dropped = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
    dropped.dataTransfer = { types: ['Files'], files: [pdf()], dropEffect: 'none' };
    $('[data-drop]').dispatchEvent(dropped);
    await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(message()).toBe(SENTENCE));
    expect(window.location.hash).toBe('#/left');
    expect(document.activeElement).toBe($('[data-browse]'));
  });

  it('leaves Check my courses working without a transcript', async () => {
    const app = open('#/check');
    reader(() => json({ error: 'limit' }, 429));
    widget();
    add('mgt 321');
    await app.takeFile(pdf());
    expect(message()).toBe(SENTENCE);
    // Courses are added and answered as for a student who never uploads: with the condition, the totals and their note.
    add('bio 230');
    add('fls 161');
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    expect(answerOf('BIO 230')).toBe('Doesn’t count toward CIS — not in the CIS curriculum');
    expect(answerOf('FLS 161')).toContain('Are you a legacy CIS student?');
    $('[data-entries] [data-legacy="yes"]').click();
    expect(answerOf('FLS 161')).toContain('Counts toward CIS');
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    const summary = tidy($('[data-summary]').textContent);
    expect(summary).toMatch(/^9\s*Total credits/);
    expect(summary).toMatch(/6\s*Count toward CIS/);
    expect(summary).toContain('Below 12 credits: below full-time; may affect scholarships.');
    expect(tidy($('[data-status]').textContent)).toBe('No transcript added');
    expect(document.querySelector('[data-pace-line], [data-line-term], [data-line-target]')).toBeNull();
    // The sentence is still under the card while the student goes on (it went nowhere, and nothing else took its place).
    expect(message()).toBe(SENTENCE);
    // The report by email is filled with the list as the page has it: no transcript.
    const report = $<HTMLAnchorElement>('.foot a');
    report.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const body = decodeURIComponent(report.getAttribute('href') ?? '');
    expect(body).toContain('No transcript added');
    expect(body).toContain('MGT 321 — Counts toward CIS — Business core');
    expect(body).not.toContain('try again tomorrow');
    // A return visit: the list is back, the sentence is not.
    app.stop();
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState(null, '', '#/check');
    site = hosted.startApp(onTestDay(window as unknown as AppWindow));
    expect(heading()).toBe('Check my courses');
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    expect(message()).toBe('');
    expect(main()).not.toContain('try again tomorrow');
  });

  it('goes when it is no longer true', async () => {
    // A later try that is read: the review takes its place.
    for (const hash of ['#/left', '#/check']) {
      const app = open(hash);
      widget();
      reader(() => json({ error: 'unavailable' }, 503));
      await app.takeFile(pdf());
      expect(message(), hash).toBe(SENTENCE);
      const posted = working();
      await app.takeFile(pdf());
      expect(posted, hash).toHaveBeenCalledTimes(1);
      expect(heading(), hash).toBe('Check what was read');
      expect(document.querySelectorAll('.review-row').length, hash).toBe(17);
      expect(main(), hash).not.toContain('try again tomorrow');
      expect(said(), hash).not.toBe(SENTENCE);
    }
    // Going to another page and back: it is not shown again, on either page.
    for (const [hash, other] of [['#/left', '#/check'], ['#/check', '#/left'], ['#/left', '#/'], ['#/check', '#/']] as const) {
      const app = open(hash);
      widget();
      reader(() => json({ error: 'limit' }, 429));
      if (hash === '#/check') add('mgt 321');
      await app.takeFile(pdf());
      expect(message(), hash).toBe(SENTENCE);
      go(other);
      expect(main(), `${hash} → ${other}`).not.toContain('try again tomorrow');
      go(hash);
      expect(message(), `${hash} → ${other} → back`).toBe('');
      expect(said(), hash).toBe('');
    }
    // "Clear my data" removes it with everything else.
    const app = open('#/check');
    widget();
    reader(() => json({ error: 'limit' }, 429));
    add('mgt 321');
    await app.takeFile(pdf());
    expect(message()).toBe(SENTENCE);
    $('[data-clear]').click();
    expect(main()).not.toContain('try again tomorrow');
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it('keeps the sentences of the student’s own mistakes', async () => {
    const NOT_A_PDF = 'That file is not a PDF. Choose the unofficial transcript PDF from the portal.';
    const TOO_LARGE = 'That file is too large to be a transcript. Nothing from it was read.';
    for (const hash of ['#/left', '#/check']) {
      // The function is the one that says so.
      for (const [status, error, sentence] of [[415, 'not-a-pdf', NOT_A_PDF], [413, 'too-large', TOO_LARGE]] as const) {
        const app = open(hash);
        widget();
        reader(() => json({ error }, status));
        await app.takeFile(pdf());
        expect(message(), `${hash} ${status}`).toBe(sentence);
        expect(said(), `${hash} ${status}`).toBe(sentence);
        expect(main(), `${hash} ${status}`).not.toContain('try again tomorrow');
      }
      // The browser says so itself, and nothing is asked of Cloudflare or the reader.
      const app = open(hash);
      widget();
      const posted = working();
      const text = new TextEncoder().encode('ENG 131 B');
      await app.takeFile({ name: 'notes.txt', size: text.length, arrayBuffer: () => Promise.resolve(text.slice().buffer as ArrayBuffer) });
      expect(message(), hash).toBe(NOT_A_PDF);
      await app.takeFile({ ...pdf(), size: 4 * 1024 * 1024 + 1 });
      expect(message(), hash).toBe(TOO_LARGE);
      expect(posted, hash).not.toHaveBeenCalled();
    }
  });

  it('says so on the page the student is on', async () => {
    /** A reader whose answer comes when it is let go. */
    const held = (answer: () => Response) => {
      let release = (): void => undefined;
      const posted = reader(() => new Promise<Response>(resolve => { release = () => { resolve(answer()); }; }));
      return { posted, release: () => { release(); } };
    };
    const refused = (): Response => json({ error: 'unavailable' }, 503);

    // Chosen on "See what I have left"; the student goes to "Check my courses" and types a course; the refusal comes.
    let app = open('#/left');
    widget();
    let reading = held(refused);
    let waiting = app.takeFile(pdf());
    await vi.waitFor(() => expect(reading.posted).toHaveBeenCalledTimes(1));
    go('#/check');
    expect(message()).toBe(READING);
    type('mgt');
    reading.release();
    await waiting;
    // The sentence is under the card of the page the student is on, said once; the student is not moved,
    // and the course field keeps the keyboard and what was typed.
    expect(app.route).toBe('check');
    expect(window.location.hash).toBe('#/check');
    expect(message()).toBe(SENTENCE);
    expect(said()).toBe(SENTENCE);
    expect(document.activeElement).toBe(field());
    expect(field().value).toBe('mgt');
    // "See what I have left" shows none when visited: the student moved on.
    go('#/left');
    expect(message()).toBe('');
    expect(main()).not.toContain('try again tomorrow');

    // The same, with the keyboard in the credits list of a course PathCheck doesn't know: the list is drawn again with
    // the card, and the keyboard is on the new list of that course, not nowhere.
    app = open('#/left');
    widget();
    reading = held(refused);
    waiting = app.takeFile(pdf());
    await vi.waitFor(() => expect(reading.posted).toHaveBeenCalledTimes(1));
    go('#/check');
    add('xyz 999');
    const list = $<HTMLSelectElement>('[data-credits="XYZ 999"]');
    list.focus();
    reading.release();
    await waiting;
    expect(message()).toBe(SENTENCE);
    expect(document.activeElement).toBe($('[data-credits="XYZ 999"]'));
    expect(document.activeElement?.isConnected).toBe(true);
    // With the keyboard on a button (not something being filled in): it goes to where another file is chosen.
    app = open('#/left');
    widget();
    reading = held(refused);
    waiting = app.takeFile(pdf());
    await vi.waitFor(() => expect(reading.posted).toHaveBeenCalledTimes(1));
    go('#/check');
    add('fls 161');
    $<HTMLElement>('[data-entries] [data-legacy="yes"]').focus();
    reading.release();
    await waiting;
    expect(document.activeElement).toBe($('[data-choose]'));

    // Chosen on "Check my courses"; the student goes to "See what I have left"; the refusal comes there.
    app = open('#/check');
    widget();
    add('mgt 321');
    reading = held(refused);
    waiting = app.takeFile(pdf());
    await vi.waitFor(() => expect(reading.posted).toHaveBeenCalledTimes(1));
    go('#/left');
    expect(message()).toBe(READING);
    reading.release();
    await waiting;
    expect(app.route).toBe('left');
    expect(message()).toBe(SENTENCE);
    expect($('[data-refusal]').previousElementSibling?.matches('[data-drop]')).toBe(true);
    expect(said()).toBe(SENTENCE);
    // (Nothing was in use there: the keyboard is where another file is chosen.)
    expect(document.activeElement).toBe($('[data-browse]'));
    go('#/check');
    expect(message()).toBe('');

    // Chosen on "Check my courses"; the student is on Start when the refusal comes: taken to the page of the flow.
    app = open('#/check');
    widget();
    reading = held(refused);
    waiting = app.takeFile(pdf());
    await vi.waitFor(() => expect(reading.posted).toHaveBeenCalledTimes(1));
    go('#/');
    reading.release();
    await waiting;
    expect(app.route).toBe('left');
    expect(message()).toBe(SENTENCE);
    expect(document.activeElement).toBe($('[data-browse]'));

    // A file that IS read still takes the student to its review, wherever they are: the rows wait to be checked.
    app = open('#/left');
    widget();
    reading = held(() => json({ rows: sampleRows('sample-a') }));
    waiting = app.takeFile(pdf());
    await vi.waitFor(() => expect(reading.posted).toHaveBeenCalledTimes(1));
    go('#/check');
    reading.release();
    await waiting;
    expect(app.route).toBe('left');
    expect(heading()).toBe('Check what was read');
  });

  it('uses the brief’s sentence, in one place', () => {
    // Brief §4: "Upload isn't available right now — try again tomorrow" (the page writes its apostrophe as type does).
    expect(SENTENCE.replace('’', "'")).toBe("Upload isn't available right now — try again tomorrow");
    const sources = readdirSync(join(root, 'src')).filter(name => name.endsWith('.ts')).map(name => [name, readFileSync(join(root, 'src', name), 'utf8')] as const);
    const holding = sources.filter(([, text]) => text.includes('try again tomorrow')).map(([name]) => name);
    expect(holding).toEqual(['left.ts']);
    expect(sources.find(([name]) => name === 'left.ts')![1].match(/try again tomorrow/g)).toHaveLength(1);
    // No other wording for a reader that cannot be used exists in the pages.
    for (const [name, text] of sources) expect(text, name).not.toMatch(/try again later|Something went wrong|An error occurred/i);
  });
});
