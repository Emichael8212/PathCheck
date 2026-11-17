// @vitest-environment happy-dom
// F11: "See what I have left" in a simulated browser: choosing and dropping a transcript,
// the review step, correcting and leaving out rows, and continuing (docs/sprints/F11.md).
// A real file picker and a real drag and drop are checked by the evaluator in a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onTestDay } from './day';
import { startApp, type App, type AppWindow } from '../src/app';
import { curriculum } from '../src/curriculum';
import { openTranscript, reviewedStandings } from '../src/review';

const folder = join(import.meta.dirname, '..', 'synthetic', 'transcripts');
const fileOf = (bytes: Uint8Array, name = 'transcript.pdf') => ({ name, size: bytes.length, arrayBuffer: async (): Promise<ArrayBuffer> => bytes.slice().buffer as ArrayBuffer });
const madeUp = (name: string) => fileOf(new Uint8Array(readFileSync(join(folder, `${name}.pdf`))), `${name}.pdf`);
const tidy = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const heading = (): string => tidy($('h1').textContent);
// What a screen reader is told: one line beside the page, which the page being drawn again does not replace.
const said = (): string => tidy($('#pathcheck-status').textContent);
const rows = (): string[] => [...document.querySelectorAll('.review-row')].map(row => tidy(row.textContent));
const rowOf = (line: number): string => tidy($(`[data-line="${line}"]`).textContent);
const go = (hash: string): void => {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};
type Row = Record<string, unknown>;
const good = (over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: 3, earned: 3, grade: 'B', points: 9, ...over });
const codesHandedOn = (): string[] => (app.left.transcript ? reviewedStandings(app.left.transcript, curriculum.grades).map(one => one.code) : []);
// Types into a field of an open edit, as a browser does: the value, then the event that says so.
const setField = (line: number, name: string, value: string): void => {
  const field = $<HTMLInputElement>(`[data-editing="${line}"] [data-field="${name}"]`);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};
// Opens a row's edit. (The simulated browser does not honour the selected option of a list
// made from HTML text, so the grade read is put into the list as a real browser shows it.)
const openEdit = (line: number): void => {
  $(`[data-edit="${line}"]`).click();
  const grade = $<HTMLSelectElement>(`#row-${line}-grade`);
  grade.value = grade.querySelector('option[selected]')?.getAttribute('value') ?? '';
};
/** The grade an open edit shows as chosen, put into the list as a real browser has it. */
const gradeShown = (line: number): string => {
  const grade = $<HTMLSelectElement>(`#row-${line}-grade`);
  grade.value = grade.querySelector('option[selected]')?.getAttribute('value') ?? '';
  return grade.value;
};
/** A file dragged over, or dropped on, a part of the page. */
const drag = (type: 'dragover' | 'drop', target: Element, types: string[], files: unknown[] = []): { prevented: boolean; effect: string } => {
  const dataTransfer = { types, files, dropEffect: '' };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  target.dispatchEvent(event);
  return { prevented: event.defaultPrevented, effect: dataTransfer.dropEffect };
};

let app: App;
/** Opens the review step on a prepared reader's answer, as if its PDF had been read. */
const review = (...answerRows: unknown[]): void => {
  Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: answerRows }, curriculum), continued: false, refusal: null, editing: null, draft: null });
  go('#/left');
};
beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#/left');
  app = startApp(onTestDay(window as unknown as AppWindow));
});
// Each test's app stops listening to the window, so that it takes no part in the next test.
afterEach(() => { app.stop(); });

describe('bringing a transcript', () => {
  it('reviews a chosen transcript', async () => {
    expect(heading()).toBe('See what I have left');
    expect(document.querySelector('[data-drop] [data-browse]')).not.toBeNull();
    await app.takeFile(madeUp('sample-a'));
    expect(app.route).toBe('left');
    expect(heading()).toBe('Check what was read');
    // The keyboard is on the heading of the review step.
    expect(document.activeElement).toBe($('h1'));
    expect(document.title).toBe('See what I have left — PathCheck');
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Fall 2025', 'Spr 2026', 'Fall 2026']);
    expect(rows()).toHaveLength(17);
    expect(rows()[0]).toBe('ORI 100 First Year Experience 1 cr A Passed Edit Not on my transcript');
    expect(document.querySelector('[data-drop]')).toBeNull();
    expect(tidy($('.review-intro').textContent)).toContain('sample-a.pdf');
  });

  it('opens the file picker from "Browse files", here and on Start', async () => {
    const made: HTMLInputElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = create(tag);
      if (tag === 'input') { made.push(element as HTMLInputElement); vi.spyOn(element as HTMLInputElement, 'click').mockImplementation(() => undefined); }
      return element;
    }) as typeof document.createElement);
    $('[data-browse]').click();
    go('#/');
    $('[data-browse]').click();
    expect(made).toHaveLength(2);
    for (const input of made) {
      expect(input.type).toBe('file');
      expect(input.accept).toBe('application/pdf,.pdf');
      expect(input.click).toHaveBeenCalledTimes(1);
      // Made for the moment: no page has a field of its own to fill in.
      expect(input.isConnected).toBe(false);
    }
    expect(document.querySelector('input')).toBeNull();
    // Choosing a file in the picker opened on Start brings the review on the page of this flow.
    Object.defineProperty(made[1], 'files', { value: [madeUp('sample-b')] });
    made[1]!.dispatchEvent(new Event('change'));
    // (While it is read the page of this flow says so; then the review.)
    await vi.waitFor(() => expect(heading()).toBe('Check what was read'));
    expect(app.route).toBe('left');
    expect(window.location.hash).toBe('#/left');
    vi.restoreAllMocks();
  });

  it('takes a transcript dropped on Start', async () => {
    go('#/');
    // Away from the drop zone a file is not opened by the browser, and not taken: the page says so while it is dragged.
    expect(drag('dragover', $('h1'), ['Files'])).toEqual({ prevented: true, effect: 'none' });
    expect(drag('drop', $('h1'), ['Files'], [madeUp('sample-a')]).prevented).toBe(true);
    await Promise.resolve();
    expect(app.route).toBe('start');
    expect(app.left.transcript).toBeNull();
    // On the drop zone it is taken, and the review opens on the page of this flow.
    expect(drag('dragover', $('[data-drop] .drop-title'), ['Files'])).toEqual({ prevented: true, effect: 'copy' });
    expect(drag('drop', $('[data-drop] .drop-title'), ['Files'], [madeUp('sample-a')]).prevented).toBe(true);
    await vi.waitFor(() => expect(heading()).toBe('Check what was read'));
    expect(app.route).toBe('left');
    expect(rows()).toHaveLength(17);
    // During a review a dropped file is not read; the page says how to use another one. The
    // drag is let through (a browser gives no drop where the page refused the drag).
    expect(said()).toBe('');
    expect(drag('dragover', $('main'), ['Files'])).toEqual({ prevented: true, effect: 'copy' });
    drag('drop', $('main'), ['Files'], [{ name: 'x.pdf', size: 1, arrayBuffer: () => { throw new Error('read'); } }]);
    expect(said()).toBe('To use another transcript, choose “Use another transcript” first.');
    expect(rows()).toHaveLength(17);
    // The same after "Continue".
    $('[data-continue]').click();
    expect(drag('dragover', $('main'), ['Files']).effect).toBe('copy');
    // Dragged text is left alone.
    expect(drag('dragover', $('main'), ['text/plain'])).toEqual({ prevented: false, effect: '' });
    expect(drag('drop', $('main'), ['text/plain']).prevented).toBe(false);
  });

  it('takes the same file twice, and another after it', async () => {
    await app.takeFile(madeUp('sample-a'));
    $('[data-another]').click();
    expect(heading()).toBe('See what I have left');
    expect(app.left.transcript).toBeNull();
    expect(document.activeElement).toBe($('[data-browse]'));
    await app.takeFile(madeUp('sample-a'));
    expect(rows()).toHaveLength(17);
    $('[data-another]').click();
    await app.takeFile(madeUp('sample-b'));
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Transfer Credit', 'Fall 2024', 'Spr 2025', 'Fall 2025']);
    expect(rows()).toHaveLength(16);
    // Transfer credit shows no credits, as on the transcript; its edit starts with none, and saves as it is.
    expect(rowOf(0)).toBe('ENG 131 English Comp I T Transfer credit Passed Edit Not on my transcript');
    openEdit(0);
    expect($<HTMLInputElement>('#row-0-attempted').value).toBe('');
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('ENG 131 English Comp I T Transfer credit Passed Edit Not on my transcript');
  });

  it('says why a file was not taken, and stays ready for another', async () => {
    const text = (words: string): Uint8Array => new TextEncoder().encode(words);
    const cases: [ReturnType<typeof fileOf>, string][] = [
      [fileOf(text('%PDF-1.7 some other document')), 'PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.'],
      [fileOf(text('ENG 131 B'), 'transcript.pdf'), 'That file is not a PDF. Choose the unofficial transcript PDF from the portal.'],
      [{ ...fileOf(text('%PDF-')), size: 11 * 1024 * 1024 }, 'That file is too large to be a transcript. Nothing from it was read.'],
    ];
    for (const [file, sentence] of cases) {
      await app.takeFile(file);
      expect(tidy($('[data-refusal]').textContent)).toBe(sentence);
      // It is also said to a screen reader, in the line beside the page.
      expect(said()).toBe(sentence);
      expect(heading()).toBe('See what I have left');
      expect(document.activeElement).toBe($('[data-browse]'));
      expect(app.left.transcript).toBeNull();
    }
    // From Start, the reason is shown on the page of this flow.
    go('#/');
    await app.takeFile(fileOf(text('nope')));
    expect(app.route).toBe('left');
    expect(tidy($('[data-refusal]').textContent)).toContain('not a PDF');
    // A good file afterwards is taken, and the reason is gone.
    await app.takeFile(madeUp('sample-b'));
    expect(heading()).toBe('Check what was read');
    expect(document.querySelector('[data-refusal]')).toBeNull();
  });

  it('says so when a file cannot be opened', async () => {
    // A file moved away or not downloaded yet: reading it fails. The student is told, and nothing is left unhandled.
    const gone = { name: 'gone.pdf', size: 10, arrayBuffer: (): Promise<ArrayBuffer> => Promise.reject(new DOMException('gone', 'NotReadableError')) };
    await expect(app.takeFile(gone)).resolves.toBeUndefined();
    expect(tidy($('[data-refusal]').textContent)).toBe('That file could not be opened. Choose it again.');
    expect(said()).toBe('That file could not be opened. Choose it again.');
    expect(document.activeElement).toBe($('[data-browse]'));
    await app.takeFile(madeUp('sample-a'));
    expect(heading()).toBe('Check what was read');
  });

  it('reads no other file while a transcript is under review', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-out="8"]').click();
    go('#/');
    // Chosen or dropped on Start: a good file and a bad one alike are not read, and the review stays as it was.
    let reads = 0;
    const counted = (file: ReturnType<typeof fileOf>) => ({ ...file, arrayBuffer: (): Promise<ArrayBuffer> => { reads++; return file.arrayBuffer(); } });
    for (const file of [counted(madeUp('sample-a')), counted(fileOf(new TextEncoder().encode('not a pdf')))]) {
      go('#/');
      await app.takeFile(file);
      expect(reads).toBe(0);
      expect(app.route).toBe('left');
      expect(window.location.hash).toBe('#/left');
      expect(heading()).toBe('Check what was read');
      expect(said()).toBe('To use another transcript, choose “Use another transcript” first.');
      expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
      expect(rows()).toHaveLength(16);
      expect(rowOf(8)).toContain('Put back');
      expect(app.left.refusal).toBeNull();
    }
  });

  it('says that the transcript is being read', async () => {
    // On the hosted site reading takes some seconds (F21): a file whose bytes arrive late stands for it.
    const READING = 'Reading your transcript…';
    const late = (name: string) => {
      const file = madeUp(name);
      let release = (): void => undefined;
      return { file: { ...file, arrayBuffer: (): Promise<ArrayBuffer> => new Promise<ArrayBuffer>(resolve => { release = () => { void file.arrayBuffer().then(resolve); }; }) }, release: () => release() };
    };
    // On this page: where a refusal would stand, and read out.
    let slow = late('sample-a');
    $('[data-browse]').focus();
    let waiting = app.takeFile(slow.file);
    expect(heading()).toBe('See what I have left');
    expect(tidy($('[data-refusal]').textContent)).toBe(READING);
    expect(said()).toBe(READING);
    // The keyboard is still on the button the file was chosen with.
    expect(document.activeElement).toBe($('[data-browse]'));
    slow.release();
    await waiting;
    expect(heading()).toBe('Check what was read');
    expect(tidy($('main').textContent)).not.toContain(READING);
    expect(said()).not.toBe(READING);
    // Chosen on Start: the page of this flow opens at once and says so.
    $('[data-another]').click();
    go('#/');
    slow = late('sample-b');
    waiting = app.takeFile(slow.file);
    expect(app.route).toBe('left');
    expect(tidy($('[data-refusal]').textContent)).toBe(READING);
    expect(said()).toBe(READING);
    slow.release();
    await waiting;
    expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
    // On "Check my courses": under the card; a file that is then refused says why in the same place.
    $('[data-another]').click();
    go('#/check');
    const other = fileOf(new TextEncoder().encode('%PDF-1.4 somebody else'), 'other.pdf');
    let let_go = (): void => undefined;
    waiting = app.takeFile({ ...other, arrayBuffer: (): Promise<ArrayBuffer> => new Promise<ArrayBuffer>(resolve => { let_go = () => { void other.arrayBuffer().then(resolve); }; }) });
    expect(app.route).toBe('check');
    expect(tidy($('[data-refusal]').textContent)).toBe(READING);
    expect(document.activeElement).toBe($('[data-choose]'));
    let_go();
    await waiting;
    expect(tidy($('[data-refusal]').textContent)).toBe('PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.');
  });

  it('says on the page that another transcript must be chosen first', async () => {
    const SENTENCE = 'To use another transcript, choose “Use another transcript” first.';
    const notice = (): string | null => document.querySelector('[data-notice]')?.textContent?.trim() ?? null;
    // No transcript: nothing to say.
    expect(notice()).toBeNull();
    await app.takeFile(madeUp('sample-a'));
    expect(heading()).toBe('Check what was read');
    expect(notice()).toBeNull();
    // Another file chosen during the review: it is not read, and the page says why under its heading; it is read out too.
    await app.takeFile(madeUp('sample-b'));
    expect(tidy($('.review-intro').textContent)).toContain('sample-a.pdf');
    expect(notice()).toBe(SENTENCE);
    expect(said()).toBe(SENTENCE);
    const main = [...$('main').children];
    expect(main.indexOf($('[data-notice]'))).toBe(main.indexOf($('.page-head')) + 1);
    // It is not a second announcement, and it is not printed.
    expect($('[data-notice]').closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect($('[data-notice]').classList.contains('no-print')).toBe(true);
    // The next thing the student does on the page takes it away.
    $('[data-out="0"]').click();
    expect(notice()).toBeNull();
    // With the result shown, a file chosen on Start: the result of the first transcript, and the sentence above it.
    $('[data-continue]').click();
    expect(heading()).toBe('Your degree, in focus.');
    go('#/');
    await app.takeFile(madeUp('sample-b'));
    expect(app.route).toBe('left');
    expect(heading()).toBe('Your degree, in focus.');
    expect(notice()).toBe(SENTENCE);
    expect(app.left.transcript?.name).toBe('sample-a.pdf');
    // Whatever the student does next on the result takes it away at once, also where only a part of the page is drawn again
    // or nothing is: a pace control, a requirement opened, the filter. Each time another file brings it back.
    const again = async (): Promise<void> => {
      go('#/');
      await app.takeFile(madeUp('sample-b'));
      expect(notice()).toBe(SENTENCE);
    };
    $('[data-stepper="most"] [data-delta="1"]').click();
    expect(notice()).toBeNull();
    await again();
    $('main details summary').click();
    expect(notice()).toBeNull();
    await again();
    $('[data-reqs="not-done"]').click();
    expect(notice()).toBeNull();
    await again();
    const target = $<HTMLSelectElement>('[data-pace-target]');
    target.dispatchEvent(new Event('change', { bubbles: true }));
    expect(notice()).toBeNull();
    // Moving through the page with the keyboard is not such a thing: the sentence stays while it is reached.
    await again();
    $('main').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(notice()).toBe(SENTENCE);
    // What is kept in the browser is the same with the sentence shown as without it.
    const kept = JSON.stringify(Object.entries(window.localStorage));
    // Going to another page and back: it has been read, and does not follow.
    go('#/check');
    go('#/left');
    expect(notice()).toBeNull();
    expect(JSON.stringify(Object.entries(window.localStorage))).toBe(kept);
    // A file dropped while a transcript is there says the same.
    const dropped = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
    dropped.dataTransfer = { types: ['Files'], files: [madeUp('sample-b')], dropEffect: 'none' };
    $('main').dispatchEvent(dropped);
    expect(notice()).toBe(SENTENCE);
    // "Use another transcript" takes it away with the transcript; the upload control is back, with nothing said under it.
    $('[data-another]').click();
    expect(notice()).toBeNull();
    expect(document.querySelector('[data-browse]')).not.toBeNull();
    expect(tidy($('[data-refusal]').textContent)).toBe('');
    // It is never kept in the browser.
    expect(JSON.stringify(window.localStorage)).not.toContain('notice');
  });

  it('says when the bot check wants a box ticked', async () => {
    // The hosted site, with a stand-in for Cloudflare's widget that wants a tick before it passes (F22).
    const READING = 'Reading your transcript…';
    const TICK = 'One more step: tick the box at the bottom of the window.';
    type Drawn = { place: unknown; options: Record<string, (value?: unknown) => void> };
    const drawn: Drawn[] = [];
    const sampleRows = (name: string): unknown[] => (JSON.parse(readFileSync(join(folder, name + '.json'), 'utf8')) as { rows: unknown[] }).rows;
    let site: App | null = null;
    app.stop();
    try {
      vi.stubEnv('DEV', false);
      vi.stubGlobal('turnstile', { render: (place: unknown, options: Drawn['options']) => { drawn.push({ place, options }); return `widget-${drawn.length}`; }, remove: () => undefined });
      vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ rows: sampleRows('sample-a') }), { status: 200 })));
      vi.resetModules();
      const hosted = await import('../src/app');
      window.localStorage.clear();
      document.body.innerHTML = '<div id="app"></div>';
      window.history.replaceState(null, '', '#/left');
      site = hosted.startApp(onTestDay(window as unknown as AppWindow));
      const place = document.getElementById('pathcheck-check')!;
      // The widget's place is one element beside the page, not a part of it; empty and out of the tab order until it is needed.
      expect(place.parentElement).toBe(document.body);
      expect(document.getElementById('app')!.contains(place)).toBe(false);
      expect([place.className, place.getAttribute('tabindex'), place.childElementCount]).toEqual(['bot-check no-print', '-1', 0]);

      const waiting = site.takeFile(fileOf(new TextEncoder().encode('%PDF-1.7 my own transcript'), 'mine.pdf'));
      await vi.waitFor(() => expect(drawn).toHaveLength(1));
      // The widget is drawn in that place, and the page says that it is reading.
      expect(drawn[0]!.place).toBe(place);
      expect(tidy($('[data-refusal]').textContent)).toBe(READING);
      // Cloudflare wants its box ticked: the page says so where it said that it is reading, it is read out,
      // and the keyboard is on the box's place.
      drawn[0]!.options['before-interactive-callback']!();
      expect(tidy($('[data-refusal]').textContent)).toBe(TICK);
      expect(said()).toBe(TICK);
      expect(document.activeElement).toBe(place);
      // The page is drawn again and another page is opened meanwhile: the place is still the same element, still in the document.
      go('#/check');
      expect(tidy($('[data-refusal]').textContent)).toBe(TICK);
      go('#/left');
      expect(document.getElementById('pathcheck-check')).toBe(place);
      expect(place.isConnected).toBe(true);
      expect(tidy($('[data-refusal]').textContent)).toBe(TICK);
      // The box is ticked: the page says again that it is reading; then the token comes and the transcript is read.
      drawn[0]!.options['after-interactive-callback']!();
      expect(tidy($('[data-refusal]').textContent)).toBe(READING);
      expect(said()).toBe(READING);
      drawn[0]!.options.callback!('a-token');
      await waiting;
      expect(heading()).toBe('Check what was read');
      expect(tidy($('main').textContent)).not.toMatch(/One more step|Reading your transcript/);

      // Nobody ticks it and the check gives up: the existing sentence, and the tick is no longer asked for.
      $('[data-another]').click();
      const again = site.takeFile(fileOf(new TextEncoder().encode('%PDF-1.7 my own transcript'), 'mine.pdf'));
      await vi.waitFor(() => expect(drawn).toHaveLength(2));
      drawn[1]!.options['before-interactive-callback']!();
      expect(tidy($('[data-refusal]').textContent)).toBe(TICK);
      drawn[1]!.options['error-callback']!();
      await again;
      expect(tidy($('[data-refusal]').textContent)).toBe('Upload isn’t available right now — try again tomorrow');
      expect(tidy($('main').textContent)).not.toContain('One more step');
    } finally {
      site?.stop();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetModules();
      window.localStorage.clear();
      document.body.innerHTML = '<div id="app"></div>';
      window.history.replaceState(null, '', '#/left');
      app = startApp(onTestDay(window as unknown as AppWindow));
    }
  });

  it('takes the file chosen last when two are being read', async () => {
    const first = madeUp('sample-a');
    let release = (): void => undefined;
    const slow = { ...first, arrayBuffer: (): Promise<ArrayBuffer> => new Promise(resolve => { release = () => { void first.arrayBuffer().then(resolve); }; }) };
    const waiting = app.takeFile(slow);
    await app.takeFile(madeUp('sample-b'));
    expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
    $('[data-out="0"]').click();
    // The slower file arrives afterwards and changes nothing.
    release();
    await waiting;
    expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
    expect(rows()).toHaveLength(16);
    expect(rowOf(0)).toContain('Put back');
    // The other way round: a slow transcript, then a file that is refused. The refusal stays.
    $('[data-another]').click();
    const again = app.takeFile(slow);
    await app.takeFile(fileOf(new TextEncoder().encode('not a pdf')));
    release();
    await again;
    expect(heading()).toBe('See what I have left');
    expect(tidy($('[data-refusal]').textContent)).toContain('not a PDF');
    expect(app.left.transcript).toBeNull();
    // And a slow transcript that arrives after the student has started again changes nothing either.
    const late = app.takeFile(slow);
    await app.takeFile(madeUp('sample-b'));
    $('[data-another]').click();
    release();
    await late;
    expect(app.left.transcript).toBeNull();
    expect(document.querySelector('[data-drop]')).not.toBeNull();
  });
});

describe('the review step', () => {
  it('counts nothing from a row that still needs fixing', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }), good({ prefix: 'CIS', number: '30' }), 'not a row');
    expect(rows().map(row => row.replace(/ ?Edit ?| ?Not on my transcript/g, ''))).toEqual([
      'MGT 321 Prin of Management 3 cr B Passed', 'ENG 131 Prin of Management 3 cr Needs fixing: the grade', 'CIS 30 Prin of Management 3 cr Needs fixing: the course code', 'This line could not be read',
    ]);
    expect(tidy($('.review-count').textContent)).toBe('3 rows still need fixing. They count nothing until fixed.');
    expect(codesHandedOn()).toEqual(['MGT 321']);
    // A line that could not be read has no "Edit".
    expect(document.querySelector('[data-edit="3"]')).toBeNull();
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(3);
  });

  it('fixes a misread row', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    openEdit(1);
    expect($<HTMLInputElement>('#row-1-prefix').value).toBe('ENG');
    expect($<HTMLInputElement>('#row-1-number').value).toBe('131');
    expect($<HTMLInputElement>('#row-1-term').value).toBe('Fall 2025');
    expect([...$<HTMLSelectElement>('#row-1-grade').options].map(option => option.value)).toEqual(['', 'A', 'B', 'C', 'D', 'F', 'W', 'I', 'B+']);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    expect(rowOf(1)).toBe('ENG 131 Prin of Management 3 cr B Passed Edit Not on my transcript');
    expect(document.querySelector('.review-count')?.textContent).toBe('');
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131']);
    expect(said()).toBe('ENG 131 saved.');
    // A row that passed can be corrected too: its code, its grade, or whether it is transfer credit.
    openEdit(0);
    setField(0, 'number', '422');
    setField(0, 'grade', 'D');
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 422 Prin of Management 3 cr D Doesn’t count — below C Edit Not on my transcript');
    openEdit(0);
    $<HTMLInputElement>('#row-0-transfer').checked = true;
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 422 Prin of Management 3 cr D Transfer credit Passed Edit Not on my transcript');
    expect(codesHandedOn()).toEqual(['MGT 422', 'ENG 131']);
  });

  it('fixes a row whose term was not read', () => {
    review(good(), good({ prefix: 'ENG', number: '131', term: '' }));
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Fall 2025', 'Term not read']);
    expect(rowOf(1)).toContain('Needs fixing: the term');
    openEdit(1);
    setField(1, 'term', 'Spr 2026');
    $('[data-save="1"]').click();
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Fall 2025', 'Spr 2026']);
    expect(rowOf(1)).toBe('ENG 131 Prin of Management 3 cr B Passed Edit Not on my transcript');
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131']);
  });

  it('keeps a row to fix when the correction is faulty', () => {
    review(good({ grade: 'B+' }), good({ prefix: 'ENG', number: '131' }));
    openEdit(0);
    setField(0, 'grade', 'B');
    setField(0, 'number', '32');
    setField(0, 'attempted', 'three');
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 32 Prin of Management three cr Needs fixing: the course code, the credits Edit Not on my transcript');
    expect(said()).toBe('MGT 32 still needs fixing: the course code, the credits.');
    expect(codesHandedOn()).toEqual(['ENG 131']);
    // What was typed is back in the fields, to be corrected again.
    openEdit(0);
    expect($<HTMLInputElement>('#row-0-number').value).toBe('32');
    expect($<HTMLInputElement>('#row-0-attempted').value).toBe('three');
  });

  it('keeps what is being typed while another row is left out or put back', () => {
    review(good(), good({ prefix: 'ENG', number: '131' }), good({ prefix: 'CIS', number: '300' }));
    openEdit(0);
    // One edit at a time: while it is open the other rows offer none, so nothing typed is lost to a second one.
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-out]')).toHaveLength(3);
    setField(0, 'term', 'Spr 2026');
    setField(0, 'number', '422');
    setField(0, 'attempted', '4');
    setField(0, 'grade', 'C');
    $<HTMLInputElement>('#row-0-transfer').click();
    const typed = (): unknown[] => [$<HTMLInputElement>('#row-0-term').value, $<HTMLInputElement>('#row-0-prefix').value, $<HTMLInputElement>('#row-0-number').value, $<HTMLInputElement>('#row-0-attempted').value, gradeShown(0), $<HTMLInputElement>('#row-0-transfer').checked];
    $('[data-out="1"]').click();
    expect(rowOf(1)).toContain('Put back');
    expect(typed()).toEqual(['Spr 2026', 'MGT', '422', '4', 'C', true]);
    $('[data-back="1"]').click();
    expect(typed()).toEqual(['Spr 2026', 'MGT', '422', '4', 'C', true]);
    // Typed after that, and the student looks at another page and comes back: the last thing typed is there.
    setField(0, 'number', '423');
    go('#/');
    go('#/check');
    go('#/left');
    expect(typed()).toEqual(['Spr 2026', 'MGT', '423', '4', 'C', true]);
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(0);
    setField(0, 'number', '422');
    // Nothing is saved until "Save".
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131', 'CIS 300']);
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 422 Prin of Management 4 cr C Transfer credit Passed Edit Not on my transcript');
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(3);
    // A later edit starts from what is saved, not from an earlier draft.
    openEdit(1);
    expect($<HTMLInputElement>('#row-1-number').value).toBe('131');
    // Leaving out the row that is being edited closes its edit.
    $('[data-out="1"]').click();
    expect(document.querySelector('.row-edit')).toBeNull();
    expect(app.left).toMatchObject({ editing: null, draft: null });
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(2);
  });

  it('cancels an edit', () => {
    review(good({ grade: 'B+' }));
    const before = rowOf(0);
    openEdit(0);
    setField(0, 'grade', 'A');
    setField(0, 'prefix', 'XYZ');
    $('[data-cancel="0"]').click();
    expect(rowOf(0)).toBe(before);
    expect(document.querySelector('.row-edit')).toBeNull();
    expect(codesHandedOn()).toEqual([]);
  });

  it('leaves out a row that is not on the transcript', () => {
    review(good(), good({ prefix: 'CIS', number: '300', grade: 'A' }), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    expect(codesHandedOn()).toEqual(['MGT 321', 'CIS 300']);
    $('[data-out="1"]').click();
    expect(rowOf(1)).toBe('CIS 300 Prin of Management 3 cr Not on my transcript Put back');
    expect($('[data-line="1"]').className).toBe('row review-row is-left-out');
    expect(codesHandedOn()).toEqual(['MGT 321']);
    expect(said()).toBe('CIS 300: Not on my transcript.');
    expect(document.activeElement).toBe($('[data-back="1"]'));
    // A row to fix can be left out as well: it is then no longer among those to fix.
    $('[data-out="2"]').click();
    expect(document.querySelector('.review-count')?.textContent).toBe('');
    $('[data-back="1"]').click();
    expect(codesHandedOn()).toEqual(['MGT 321', 'CIS 300']);
    expect(document.activeElement).toBe($('[data-out="1"]'));
    $('[data-back="2"]').click();
    expect(tidy($('.review-count').textContent)).toBe('1 row still needs fixing. It counts nothing until fixed.');
  });

  it('moves the keyboard through an edit', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    openEdit(1);
    // Into the first field of the row; every field is labelled.
    expect(document.activeElement).toBe($('#row-1-term'));
    for (const field of document.querySelectorAll<HTMLElement>('[data-editing="1"] [data-field]')) {
      expect(document.querySelector(`label[for="${field.id}"]`), field.id).not.toBeNull();
    }
    expect($('[data-editing="1"]').getAttribute('aria-label')).toBe('Edit ENG 131, Fall 2025');
    $('[data-cancel="1"]').click();
    expect(document.activeElement).toBe($('[data-edit="1"]'));
    openEdit(1);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    expect(document.activeElement).toBe($('[data-edit="1"]'));
    // Edit and Not on my transcript are buttons that name their course.
    expect($('[data-edit="0"]').getAttribute('aria-label')).toBe('Edit MGT 321, Fall 2025');
    expect($('[data-out="0"]').getAttribute('aria-label')).toBe('Not on my transcript: MGT 321, Fall 2025');
    // The edit is one cell of its row, as a table allows.
    openEdit(0);
    expect($('[data-editing="0"]').parentElement?.getAttribute('role')).toBe('cell');
    expect($('[data-editing="0"]').parentElement?.parentElement).toBe($('[data-line="0"]'));
    $('[data-cancel="0"]').click();
    // What happened is said in one polite line that stays in the page while the rest is drawn again.
    const status = $('#pathcheck-status');
    expect([status.getAttribute('role'), status.getAttribute('aria-live'), status.className]).toEqual(['status', 'polite', 'sr-only']);
    expect($('#app').contains(status)).toBe(false);
    $('[data-out="0"]').click();
    expect($('#pathcheck-status')).toBe(status);
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    // The terms are headings.
    expect($('.term-name').tagName).toBe('H2');
    // What was said here does not stay behind on another page.
    expect(said()).toBe('MGT 321: Not on my transcript.');
    go('#/check');
    expect(said()).toBe('');
  });
});

describe('going on', () => {
  it('hands on the reviewed rows', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }), good({ prefix: 'CIS', number: '300', grade: 'A' }), good({ prefix: 'CIS', number: '30' }));
    openEdit(1);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    $('[data-out="2"]').click();
    $('[data-continue]').click();
    expect(app.left.continued).toBe(true);
    // The corrected course is handed on; the one left out and the one still to fix are not.
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131']);
    expect(heading()).toBe('Your degree, in focus.');
    expect(document.activeElement).toBe($('h1'));
    expect(tidy($('[data-handed-on]').textContent)).toBe('2 rows taken on. 1 left out because it still needs fixing. 1 left out as not on your transcript.');
    expect(document.querySelector('.review-row')).toBeNull();
  });

  it('starts again with another transcript', async () => {
    await app.takeFile(madeUp('sample-a'));
    expect(tidy($('.review-foot').textContent)).toContain('Choosing another transcript forgets your corrections.');
    $('[data-out="0"]').click();
    $('[data-continue]').click();
    expect(tidy($('[data-handed-on]').textContent)).toBe('16 rows taken on. 1 left out as not on your transcript.');
    $('[data-another]').click();
    expect(app.left).toMatchObject({ transcript: null, continued: false, editing: null });
    expect(document.querySelector('[data-drop]')).not.toBeNull();
    await app.takeFile(madeUp('sample-a'));
    // The earlier corrections are forgotten.
    expect(rows()).toHaveLength(17);
    expect(document.querySelector('.is-left-out')).toBeNull();
  });

  it('keeps the review while the student moves between pages', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-out="8"]').click();
    openEdit(7);
    setField(7, 'grade', 'C');
    $('[data-save="7"]').click();
    const before = rows();
    go('#/');
    go('#/check');
    expect(document.querySelector('.review-row')).toBeNull();
    go('#/left');
    expect(heading()).toBe('Check what was read');
    expect(rows()).toEqual(before);
    expect(rowOf(8)).toContain('Put back');
    expect(rowOf(7)).toContain('C Passed');
    // A new visit starts without a transcript.
    document.body.innerHTML = '<div id="app"></div>';
    const fresh = startApp(onTestDay(window as unknown as AppWindow));
    expect(fresh.left.transcript).toBeNull();
    expect(document.querySelector('[data-drop]')).not.toBeNull();
    fresh.stop();
  });
});

// ---- F13: the checklist, after "Continue" (docs/sprints/F13.md) ----
describe('the checklist', () => {
  const cards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.req')];
  const cardOf = (name: string): HTMLElement => {
    const found = cards().find(card => tidy(card.querySelector('.req-name')?.textContent) === name);
    if (!found) throw new Error(`no requirement ${name}`);
    return found;
  };
  const statusOf = (name: string): string => tidy(cardOf(name).querySelector('.req-status')?.textContent);
  const creditsOf = (name: string): string => tidy(cardOf(name).querySelector('.req-credits')?.textContent);
  const listOf = (name: string): string => tidy(cardOf(name).querySelector('.req-body')?.textContent);
  const ring = (): string => tidy($('.donut strong').textContent);

  it('says "Synthetic transcript result" only over a made-up transcript', async () => {
    const pill = (): string | null => { const found = document.querySelector('.pill'); return found ? tidy(found.textContent) : null; };
    const reloaded = (): void => {
      app.stop();
      document.body.innerHTML = '<div id="app"></div>';
      app = startApp(onTestDay(window as unknown as AppWindow));
    };
    const sampleRows = (name: string): unknown[] => (JSON.parse(readFileSync(join(folder, name + '.json'), 'utf8')) as { rows: unknown[] }).rows;
    const stored = (): { result?: Record<string, unknown> } => JSON.parse(window.localStorage.getItem('pathcheck.visit') ?? '{}') as { result?: Record<string, unknown> };

    // One of the made-up transcripts in synthetic/transcripts/, recognised by its bytes: its result says so,
    // during the visit and when it comes back from the browser.
    await app.takeFile(madeUp('sample-a'));
    expect(app.left.transcript?.madeUp).toBe(true);
    expect(pill()).toBeNull();
    $('[data-continue]').click();
    expect(heading()).toBe('Your degree, in focus.');
    expect(pill()).toBe('Synthetic transcript result');
    // (A row left out does not change what the file is.)
    $('[data-review-again]').click();
    $('[data-out="0"]').click();
    $('[data-continue]').click();
    expect(pill()).toBe('Synthetic transcript result');
    reloaded();
    expect(heading()).toBe('Your degree, in focus.');
    expect(pill()).toBe('Synthetic transcript result');
    expect(stored().result?.madeUp).toBe(true);

    // A student's own transcript, read by the reader on the hosted site: the same rows, and no such label, ever.
    $('[data-another]').click();
    window.localStorage.clear();
    app.stop();
    let site: App | null = null;
    try {
      vi.stubEnv('DEV', false);
      // (The hosted site asks its reader only with a passed bot check: a stand-in for Cloudflare's widget passes it. F22)
      vi.stubGlobal('turnstile', { render: (_place: unknown, options: { callback(token: string): void }) => { queueMicrotask(() => { options.callback('a-token'); }); return 'widget'; }, remove: () => undefined });
      vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ rows: sampleRows('sample-a') }), { status: 200 })));
      vi.resetModules();
      const hosted = await import('../src/app');
      document.body.innerHTML = '<div id="app"></div>';
      site = hosted.startApp(onTestDay(window as unknown as AppWindow));
      await site.takeFile(fileOf(new TextEncoder().encode('%PDF-1.7 a student\'s own transcript'), 'my-transcript.pdf'));
      expect(heading()).toBe('Check what was read');
      expect(site.left.transcript?.madeUp).toBeUndefined();
      $('[data-continue]').click();
      expect(heading()).toBe('Your degree, in focus.');
      expect(tidy($('.donut strong').textContent)).toBe('81');
      expect(pill()).toBeNull();
      expect(tidy($('main').textContent)).not.toMatch(/synthetic/i);
      // Not when it comes back from the browser either,
      expect(stored().result && 'madeUp' in stored().result!).toBe(false);
      site.stop();
      document.body.innerHTML = '<div id="app"></div>';
      site = hosted.startApp(onTestDay(window as unknown as AppWindow));
      expect(heading()).toBe('Your degree, in focus.');
      expect(pill()).toBeNull();
      // and not even when what is kept in the browser was changed to say so: the hosted site knows no made-up transcript.
      const forged = stored();
      forged.result!.madeUp = true;
      window.localStorage.setItem('pathcheck.visit', JSON.stringify(forged));
      site.stop();
      document.body.innerHTML = '<div id="app"></div>';
      site = hosted.startApp(onTestDay(window as unknown as AppWindow));
      expect(heading()).toBe('Your degree, in focus.');
      expect(pill()).toBeNull();
      // The very bytes of a made-up transcript, uploaded to the hosted site, are a file like any other there.
      $('[data-another]').click();
      await site.takeFile(madeUp('sample-a'));
      $('[data-continue]').click();
      expect(pill()).toBeNull();
    } finally {
      site?.stop();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetModules();
      window.localStorage.clear();
      document.body.innerHTML = '<div id="app"></div>';
      app = startApp(onTestDay(window as unknown as AppWindow));
    }
  });

  it('shows and hides the requirements', async () => {
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect(heading()).toBe('Your degree, in focus.');
    expect(tidy($('.eyebrow').textContent)).toBe('What I have left');
    expect(tidy($('.pill').textContent)).toBe('Synthetic transcript result');
    expect(ring()).toBe('81');
    expect(cards()).toHaveLength(9);
    // Done requirements start closed; the others start open, with their courses.
    const open = (name: string): boolean => cardOf(name).querySelector('details')!.open;
    expect(cards().map(card => [tidy(card.querySelector('.req-status')?.textContent), card.querySelector('details')!.open])).toEqual([
      ['Done', false], ['Done', false], ['In progress', true], ['In progress', true], ['Done', false], ['In progress', true], ['Still needed', true], ['Still needed', true], ['Still needed', true],
    ]);
    // Every requirement has the toggle, on a control the keyboard reaches.
    for (const card of cards()) {
      expect(card.querySelector('summary')).not.toBeNull();
      expect(tidy(card.querySelector('.req-show')?.textContent)).toBe('Show courses Hide courses');
    }
    // The student opens a done requirement, and closes one that is not done.
    cardOf('Composition').querySelector('details')!.open = true;
    cardOf('Major (CIS)').querySelector('details')!.open = false;
    // "Not done" hides the done ones; nothing else changes, and nothing is drawn again.
    const before = cards();
    $('[data-reqs="not-done"]').click();
    expect(cards().filter(card => !card.hidden).map(card => tidy(card.querySelector('.req-name')?.textContent))).toEqual(['Humanities', 'Social sciences', 'Pre-professional', 'Business core', 'Major (CIS)', 'CIS electives']);
    expect([$('[data-reqs="all"]').getAttribute('aria-pressed'), $('[data-reqs="not-done"]').getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect(cards()).toEqual(before);
    expect(open('Major (CIS)')).toBe(false);
    $('[data-reqs="all"]').click();
    expect(cards().every(card => !card.hidden)).toBe(true);
    expect([$('[data-reqs="all"]').getAttribute('aria-pressed'), $('[data-reqs="not-done"]').getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    expect(open('Composition')).toBe(true);
    expect(open('Major (CIS)')).toBe(false);
    // Nothing of this transcript is left uncounted: no such list.
    expect(document.querySelector('.unused')).toBeNull();
  });

  it('follows the corrected rows', () => {
    review(good(), good({ prefix: 'ENG', number: '131' }), good({ prefix: 'BIO', number: '230', description: 'Human Anatomy' }));
    // A grade corrected to one below C, and a row that is not the student's.
    openEdit(1);
    setField(1, 'grade', 'D');
    $('[data-save="1"]').click();
    $('[data-out="0"]').click();
    $('[data-continue]').click();
    expect(ring()).toBe('121');
    // The course left out is not used: it is still needed, with no note.
    expect(statusOf('Business core')).toBe('Still needed');
    expect(listOf('Business core')).toContain('MGT 321 Principles of Management');
    expect(listOf('Business core')).not.toContain('doesn’t count');
    // The corrected grade does not count, and its pick says so.
    expect(creditsOf('Composition')).toBe('0 / 6 cr');
    expect(listOf('Composition')).toContain('1 of ENG 131 / ENG 140 ENG 131: the D doesn’t count. It must be repeated, or another course of this pick taken.');
    // A passed course that fills nothing is in the list under the requirements, closed until asked for.
    const unused = $<HTMLDetailsElement>('.unused');
    expect(unused.open).toBe(false);
    expect(tidy(unused.querySelector('summary')?.textContent)).toBe('1 course on your transcript is not counted toward CIS Show courses Hide courses');
    expect(tidy(unused.querySelector('ul')?.textContent)).toBe('BIO 230 Doesn’t count toward CIS — not in the CIS curriculum');
    // Back in the review the corrections are as they were left; undoing them changes the checklist.
    $('.review-foot [data-review-again]').click();
    expect(heading()).toBe('Check what was read');
    expect(document.activeElement).toBe($('h1'));
    expect(rowOf(0)).toContain('Put back');
    expect(rowOf(1)).toContain('D Doesn’t count — below C');
    $('[data-back="0"]').click();
    $('[data-continue]').click();
    expect(ring()).toBe('118');
    expect(creditsOf('Business core')).toBe('3 / 27 cr');
    expect(listOf('Business core')).toContain('Done MGT 321 Principles of Management');
  });

  it('says when rows still need fixing', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }), 'not a row', 7);
    $('[data-continue]').click();
    // Above the result: how many, what it means, and the way back.
    expect(tidy($('[data-to-fix]').textContent)).toBe('3 rows of your transcript still need fixing and count nothing. A requirement, or the sequence, may show as still needed because of them. The credits left, the pace and the draft plan may change too. Fix them');
    expect(creditsOf('Composition')).toBe('0 / 6 cr');
    expect(creditsOf('Business core')).toBe('3 / 27 cr');
    $('[data-to-fix] [data-review-again]').click();
    expect(heading()).toBe('Check what was read');
    expect(rowOf(1)).toContain('Needs fixing: the grade');
    openEdit(1);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    $('[data-out="2"]').click();
    $('[data-continue]').click();
    expect(tidy($('[data-to-fix]').textContent)).toBe('1 row of your transcript still needs fixing and counts nothing. A requirement, or the sequence, may show as still needed because of it. The credits left, the pace and the draft plan may change too. Fix it');
    expect(creditsOf('Composition')).toBe('3 / 6 cr');
    $('[data-to-fix] [data-review-again]').click();
    $('[data-out="3"]').click();
    $('[data-continue]').click();
    expect(document.querySelector('[data-to-fix]')).toBeNull();
  });

  it('does not say a course must be repeated while a row of it still needs fixing', () => {
    // An F, then a later row of the same course that could not be checked: it may be the one that passed.
    review(good({ grade: 'F', term: 'Fall 2024' }), good({ grade: 'B+', term: 'Spr 2025' }), good({ prefix: 'MGT', number: '422', grade: 'D' }));
    $('[data-continue]').click();
    expect(listOf('Business core')).toContain('MGT 321 Principles of Management');
    expect(listOf('Business core')).not.toContain('MGT 321 Principles of Management Must be repeated');
    // A course with no row to fix is still flagged.
    expect(listOf('Business core')).toContain('MGT 422 Production Management Must be repeated; the D doesn’t count.');
    // A row to fix whose code cannot be read could be any course: then no course is said to need repeating.
    $('[data-to-fix] [data-review-again]').click();
    openEdit(1);
    setField(1, 'number', '32');
    $('[data-save="1"]').click();
    $('[data-continue]').click();
    expect(tidy($('[data-to-fix]').textContent)).toContain('1 row of your transcript still needs fixing');
    expect(listOf('Business core')).not.toContain('Must be repeated');
    expect(listOf('Business core')).toContain('MGT 422 Production Management');
    $('[data-to-fix] [data-review-again]').click();
    openEdit(1);
    setField(1, 'number', '321');
    $('[data-save="1"]').click();
    $('[data-continue]').click();
    // Once the row is fixed the course is done; had it been left out, the flag would be back.
    $('[data-to-fix] [data-review-again]').click();
    $('[data-out="1"]').click();
    $('[data-continue]').click();
    expect(listOf('Business core')).toContain('MGT 321 Principles of Management Must be repeated; the F doesn’t count.');
  });

  it('keeps the numbers of the credit bar apart, however small a part is', () => {
    // A new student, with one course passed and one in progress: nearly everything is left.
    review(good({ prefix: 'ORI', number: '100', attempted: 1 }), good({ prefix: 'ENG', number: '131', grade: '' }));
    $('[data-continue]').click();
    expect(ring()).toBe('117');
    const labels = [...document.querySelectorAll<HTMLElement>('.bar-label')];
    expect(labels.map(label => tidy(label.textContent))).toEqual(['3 in progress · Fall 2025', '1 counted', '117 left', '121 total']);
    // The labels are laid out in rows of their own that wrap; none is tied to a part of the bar that may be too narrow for it.
    for (const label of labels) expect(label.parentElement?.className).toBe('credit-row');
    expect($('.credit').getAttribute('style')).toBeNull();
    expect($('.is-counted').getAttribute('style')).toBe('min-width: 3.306%');
    expect($('.credit-gap').getAttribute('style')).toBe('flex-basis: 0.826%');
    // The pace answer is beside the ring.
    expect($<HTMLElement>('[data-pace]').hidden).toBe(false);
    expect(tidy($('[data-pace]').textContent)).toContain('On pace for');
  });

  it('asks the legacy question before the result', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-continue]').click();
    // Nothing of the result is on the page before the answer: no number, no status.
    const asking = $('[data-legacy-first]');
    expect(tidy(asking.textContent)).toBe('Are you a legacy CIS student? Yes No Your transcript has FLS 161, which counts as an elective only for legacy students.');
    expect(asking.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Are you a legacy CIS student?');
    expect(document.querySelector('.req, .donut, .credit, .sequence, .unused, .legacy-line')).toBeNull();
    expect(tidy($('main').textContent)).not.toMatch(/Done|In progress|Still needed|credits left|\d+ counted/);
    $<HTMLElement>('[data-legacy="yes"]').focus();
    $('[data-legacy="yes"]').click();
    // Yes: the legacy course is an elective, done.
    expect(document.querySelector('[data-legacy-first]')).toBeNull();
    expect(creditsOf('CIS electives')).toBe('6 / 9 cr');
    expect(listOf('CIS electives')).toContain('FLS 161 Spanish I');
    expect(ring()).toBe('89');
    expect(tidy($('.unused summary').textContent)).toContain('1 course on your transcript is not counted');
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    expect(document.activeElement).toBe($('[data-legacy-change]'));
    expect(said()).toBe('Legacy CIS student: Yes');
    // It is the answer "Check my courses" uses, remembered in the browser.
    expect(window.localStorage.getItem('pathcheck.legacy')).not.toBeNull();
    go('#/check');
    go('#/left');
    expect(document.querySelector('[data-legacy-first]')).toBeNull();
    expect(creditsOf('CIS electives')).toBe('6 / 9 cr');
    // "Change" asks again; No: the course counts nothing, and is listed with its reason.
    $('[data-legacy-change]').click();
    expect(document.querySelector('.req')).toBeNull();
    expect(document.activeElement).toBe($('[data-legacy="yes"]'));
    expect(window.localStorage.getItem('pathcheck.legacy')).toBeNull();
    $('[data-legacy="no"]').click();
    expect(creditsOf('CIS electives')).toBe('3 / 9 cr');
    expect(ring()).toBe('92');
    expect(listOf('CIS electives')).not.toContain('FLS 161');
    expect(tidy($('.unused ul').textContent)).toContain('FLS 161 Spanish I Doesn’t count toward CIS. Legacy students only.');
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: No Change');
    // A new visit has the result again (F19) and does not ask again.
    app.stop();
    document.body.innerHTML = '<div id="app"></div>';
    app = startApp(onTestDay(window as unknown as AppWindow));
    expect(document.querySelector('[data-legacy-first]')).toBeNull();
    expect(creditsOf('CIS electives')).toBe('3 / 9 cr');
    // A transcript whose result the answer cannot change shows no question and no line about it.
    $('[data-another]').click();
    window.localStorage.clear();
    app.stop();
    document.body.innerHTML = '<div id="app"></div>';
    app = startApp(onTestDay(window as unknown as AppWindow));
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect(document.querySelector('[data-legacy-first], .legacy-line')).toBeNull();
    expect(cards()).toHaveLength(9);
  });

  it('shows an empty result for a transcript with no row', () => {
    review(good());
    $('[data-out="0"]').click();
    $('[data-continue]').click();
    expect(heading()).toBe('Your degree, in focus.');
    expect(tidy($('[data-no-rows]').textContent)).toBe('No row of your transcript was taken on, so there is nothing to show yet.');
    // Nothing is shown as done, counted or left.
    expect(document.querySelector('.req, .donut, .credit, .sequence')).toBeNull();
    expect(tidy($('[data-handed-on]').textContent)).toBe('0 rows taken on. 1 left out as not on your transcript.');
    // Both ways on are there.
    $('.review-foot [data-review-again]').click();
    expect(heading()).toBe('Check what was read');
    $('[data-back="0"]').click();
    $('[data-continue]').click();
    expect(cards()).toHaveLength(9);
    $('[data-another]').click();
    expect(document.querySelector('[data-drop]')).not.toBeNull();
  });
});

// ---- F14: pace, beside the credits left (docs/sprints/F14.md) ----
describe('pace', () => {
  const CAVEAT = 'Credits only — course order may add semesters.';
  const pace = (): string => tidy($('[data-pace]').textContent).replace(/^Looking ahead /, '').replace(` ${CAVEAT}`, '');
  const valueOf = (end: string): string => tidy($(`[data-stepper="${end}"] [data-value]`).textContent);
  const noteOf = (end: string): string => tidy($(`#${end}-note`).textContent);
  const step = (end: string, delta: 1 | -1, times = 1): void => { for (let i = 0; i < times; i++) $(`[data-stepper="${end}"] [data-delta="${delta}"]`).click(); };
  // The targets offered and the one shown as chosen. (The simulated browser does not honour
  // the selected option of a list made from HTML text; a real browser is checked by the evaluator.)
  const targets = (): string[] => [...$<HTMLSelectElement>('[data-pace-target]').options].map(option => option.value);
  const chosen = (): string => $('[data-pace-target] option[selected]').getAttribute('value') ?? '';
  const choose = (target: string): void => {
    const list = $<HTMLSelectElement>('[data-pace-target]');
    list.focus();
    list.value = target;
    list.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('follows the pace controls', async () => {
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect(tidy($('[data-pace]').textContent)).toBe(`Looking ahead On pace for Spring 2029 about 16 credits a term ${CAVEAT}`);
    expect([targets(), chosen()]).toEqual([['Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030'], 'Spring 2029']);
    expect([valueOf('fewest'), valueOf('most'), $('[data-pace-summers]').getAttribute('aria-checked')]).toEqual(['12', '18', 'false']);
    // Something the student opened, to see that the controls leave the rest of the page alone.
    const requirements = [...document.querySelectorAll<HTMLElement>('.req')];
    requirements[0]!.querySelector('details')!.open = true;

    // An earlier target than can be reached.
    choose('Fall 2028');
    expect(pace()).toBe('Not on pace for Fall 2028 At 18 credits a term you finish Spring 2029, one semester after your target.');
    expect(tidy($('[data-pace]').textContent)).toContain(CAVEAT);
    expect(chosen()).toBe('Fall 2028');
    expect(document.activeElement).toBe($('[data-pace-target]'));
    expect(said()).toBe('Not on pace for Fall 2028. At 18 credits a term you finish Spring 2029, one semester after your target.');
    // Only the overview card was drawn again.
    expect([...document.querySelectorAll('.req')]).toEqual(requirements);
    expect(requirements[0]!.querySelector('details')!.open).toBe(true);

    // More credits a term: reachable now; the note about more than 18 appears under that control.
    step('most', 1, 3);
    expect(valueOf('most')).toBe('21');
    expect(pace()).toBe('On pace for Fall 2028 about 20 credits a term');
    expect([noteOf('most'), noteOf('fewest')]).toEqual(['Over 18 credits: may cost extra.', '']);
    expect(document.activeElement).toBe($('[data-stepper="most"] [data-delta="1"]'));
    expect(targets()).toEqual(['Spring 2028', 'Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030']);
    // The new value and its note are read out with the answer: the card was drawn again.
    expect(said()).toBe('Most credits per term: 21 credits. Over 18 credits: may cost extra. On pace for Fall 2028: about 20 credits a term');
    // Fewer at the low end: its own note; the verdict does not change.
    step('fewest', -1);
    expect(said()).toBe('Fewest credits per term: 11 credits. Below 12 credits: below full-time; may affect scholarships. On pace for Fall 2028: about 20 credits a term');
    expect([valueOf('fewest'), noteOf('fewest')]).toEqual(['11', 'Below 12 credits: below full-time; may affect scholarships.']);
    expect(pace()).toBe('On pace for Fall 2028 about 20 credits a term');
    expect(document.activeElement).toBe($('[data-stepper="fewest"] [data-delta="-1"]'));

    // Summers: more terms before the same target; a summer can be chosen.
    $<HTMLElement>('[data-pace-summers]').focus();
    $('[data-pace-summers]').click();
    expect([$('[data-pace-summers]').getAttribute('aria-checked'), tidy($('.switch-value').textContent)]).toEqual(['true', 'On']);
    expect(document.activeElement).toBe($('[data-pace-summers]'));
    expect(pace()).toBe('On pace for Fall 2028 about 14 credits a term');
    expect(said()).toBe('Summers: On. On pace for Fall 2028: about 14 credits a term');
    expect(targets()).toEqual(['Fall 2027', 'Spring 2028', 'Summer 2028', 'Fall 2028', 'Spring 2029']);
    choose('Summer 2028');
    expect(pace()).toBe('On pace for Summer 2028 about 16 credits a term');
    // Off again: the summer target becomes the Fall after it.
    $('[data-pace-summers]').click();
    expect([$('[data-pace-summers]').getAttribute('aria-checked'), chosen()]).toEqual(['false', 'Fall 2028']);
    expect(pace()).toBe('On pace for Fall 2028 about 20 credits a term');
    expect(targets().some(target => target.startsWith('Summer'))).toBe(false);
    // The summer does not come back with the switch: the target is the Fall now.
    $('[data-pace-summers]').click();
    expect(chosen()).toBe('Fall 2028');
    $('[data-pace-summers]').click();
    expect(app.left.pace).toMatchObject({ summers: false, target: { season: 'Fall', year: 2028 } });

    // The settings are still there after a look at another page.
    go('#/check');
    go('#/left');
    expect([valueOf('fewest'), valueOf('most'), $('[data-pace-summers]').getAttribute('aria-checked'), chosen()]).toEqual(['11', '21', 'false', 'Fall 2028']);
    expect(pace()).toBe('On pace for Fall 2028 about 20 credits a term');

    // The ends never cross: pushing the most below the fewest takes the fewest along.
    step('most', -1, 11);
    expect([valueOf('fewest'), valueOf('most')]).toEqual(['10', '10']);
    expect(pace()).toBe('Not on pace for Fall 2028 At 10 credits a term you finish Spring 2031, 5 semesters after your target.');
    // Both ends moved, and both are read out.
    expect(said()).toBe('Most credits per term: 10 credits. Below 12 credits: below full-time; may affect scholarships. Fewest credits per term: 10 credits. Below 12 credits: below full-time; may affect scholarships. Not on pace for Fall 2028. At 10 credits a term you finish Spring 2031, 5 semesters after your target.');
    // Down to 1: "−" is switched off, and the keyboard goes to "+".
    step('fewest', -1, 9);
    expect(valueOf('fewest')).toBe('1');
    expect($<HTMLButtonElement>('[data-stepper="fewest"] [data-delta="-1"]').disabled).toBe(true);
    expect(document.activeElement).toBe($('[data-stepper="fewest"] [data-delta="1"]'));
    expect(tidy($('[data-stepper="fewest"] output').textContent)).toBe('1 credit');

    // Another transcript starts with its own default target; the range is kept for the visit.
    $('[data-another]').click();
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect([valueOf('fewest'), valueOf('most')]).toEqual(['1', '10']);
    expect(pace()).toBe('On pace for Spring 2031 about 9 credits a term');
    // The same from "Check my courses": forgetting the transcript there keeps the range too.
    choose('Fall 2031');
    go('#/check');
    $('[data-another]').click();
    expect(app.left.pace).toEqual({ target: null, fewest: 1, most: 10, summers: false });
    go('#/left');
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect([valueOf('fewest'), valueOf('most'), chosen()]).toEqual(['1', '10', 'Spring 2031']);
    // The card is named for what it holds.
    expect($('.overview').getAttribute('aria-label')).toBe('Credits left and pace');
  });

  it('says pace may change while rows still need fixing', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    $('[data-continue]').click();
    expect(tidy($('[data-to-fix]').textContent)).toBe('1 row of your transcript still needs fixing and counts nothing. A requirement, or the sequence, may show as still needed because of it. The credits left, the pace and the draft plan may change too. Fix it');
    // The answer is given all the same, from the rows that were checked.
    expect(pace()).toBe('On pace for Spring 2029 about 17 credits a term');
    // Fixed: three credits fewer to take.
    $('[data-to-fix] [data-review-again]').click();
    openEdit(1);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    $('[data-continue]').click();
    expect(document.querySelector('[data-to-fix]')).toBeNull();
    expect(pace()).toBe('On pace for Spring 2029 about 16 credits a term');
  });

  it('gives no pace before the legacy answer, and none without rows', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-continue]').click();
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    expect(document.querySelector('[data-pace], .pace, [data-pace-target]')).toBeNull();
    expect(tidy($('main').textContent)).not.toMatch(/On pace|Looking ahead|credits a term/);
    $('[data-legacy="yes"]').click();
    expect(pace()).toBe('On pace for Spring 2028 about 18 credits a term');
    // A control draws the card again with the same legacy answer: the credits left do not move.
    expect(tidy($('.donut strong').textContent)).toBe('89');
    step('most', 1);
    expect(tidy($('.donut strong').textContent)).toBe('89');
    expect(pace()).toBe('On pace for Spring 2028 about 18 credits a term');
    expect(tidy($('.bar-label.is-counted').textContent)).toBe('26 counted');
    step('most', -1);
    $('[data-legacy-change]').click();
    $('[data-legacy="no"]').click();
    // Three credits more to take without the legacy elective: one term more.
    expect(pace()).toBe('On pace for Fall 2028 about 15 credits a term');
    // Every row left out: nothing to estimate from.
    $('.review-foot [data-review-again]').click();
    for (const button of document.querySelectorAll<HTMLElement>('[data-out]')) button.click();
    for (let left = document.querySelectorAll<HTMLElement>('[data-out]').length; left > 0; left = document.querySelectorAll<HTMLElement>('[data-out]').length) $('[data-out]').click();
    $('[data-continue]').click();
    expect(document.querySelector('[data-no-rows]')).not.toBeNull();
    expect(document.querySelector('[data-pace], .pace')).toBeNull();
  });
});

// F16: the draft plan on the page (docs/sprints/F16.md). Its rules are in tests/plan.test.ts.
describe('the draft plan', () => {
  const semesters = (): string[] => [...document.querySelectorAll('.semester')].map(one => `${tidy(one.querySelector('h3')?.textContent)} ${tidy(one.querySelector('header .num')?.textContent)}`);
  const nameOf = (entry: Element): string => tidy(entry.querySelector('.code')?.textContent ?? entry.querySelector('.plan-text p')?.textContent);
  const entriesOf = (term: string): string[] => {
    const semester = [...document.querySelectorAll('.semester')].find(one => tidy(one.querySelector('h3')?.textContent) === term);
    return semester ? [...semester.querySelectorAll('.plan-entry')].map(nameOf) : [];
  };
  const termOf = (key: string): string => tidy($(`[data-move="${key}"]`).closest('.semester')?.querySelector('h3')?.textContent);
  const late = (): string => tidy(document.querySelector('.plan-late')?.textContent);
  const paceAnswer = (): string => tidy($('[data-pace]').textContent);

  it('moves a course later', async () => {
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect(semesters()).toEqual(['Spring 2027 18 cr', 'Fall 2027 18 cr', 'Spring 2028 15 cr', 'Fall 2028 15 cr', 'Spring 2029 15 cr']);
    expect(document.querySelectorAll('.plan-entry')).toHaveLength(27);
    expect(document.querySelectorAll('.plan-entry [data-move]')).toHaveLength(27);
    expect(tidy($('.plan .draft-label').textContent)).toBe('Draft — Order not checked — your portal checks prerequisites');
    expect(late()).toBe('');
    // Something the student opened, and the parts of the page a move must leave alone.
    const card = $<HTMLDetailsElement>('.req details');
    card.open = true;
    const overview = $('.overview');
    const requirements = $('.reqs');

    expect(termOf('MGT 321')).toBe('Fall 2027');
    $('[data-move="MGT 321"]').click();
    expect(termOf('MGT 321')).toBe('Spring 2028');
    // Said once; the keyboard is still on that entry's button; only the plan was drawn again.
    expect(said()).toBe('MGT 321 moved to Spring 2028.');
    expect(document.activeElement).toBe($('[data-move="MGT 321"]'));
    expect($('[data-move="MGT 321"]').getAttribute('aria-label')).toBe('Move later: MGT 321');
    expect(tidy($('[data-move="MGT 321"]').textContent)).toBe('Move later');
    expect([$('.overview'), $('.reqs'), $<HTMLDetailsElement>('.req details').open]).toEqual([overview, requirements, true]);
    // The others flowed again into the room it left: the same credits, nothing lost or doubled.
    expect(semesters()).toEqual(['Spring 2027 18 cr', 'Fall 2027 18 cr', 'Spring 2028 15 cr', 'Fall 2028 15 cr', 'Spring 2029 15 cr']);
    expect(document.querySelectorAll('.plan-entry')).toHaveLength(27);
    expect(entriesOf('Fall 2027')).not.toContain('MGT 321');
    expect(entriesOf('Fall 2027')).toHaveLength(6);
    // Again: one further.
    $('[data-move="MGT 321"]').click();
    expect([termOf('MGT 321'), said()]).toEqual(['Fall 2028', 'MGT 321 moved to Fall 2028.']);
    expect(late()).toBe('');

    // An open choice moves by its own place: the second elective, not the first or third.
    expect(['elective:0', 'elective:1', 'elective:2'].map(key => $(`[data-move="${key}"]`).getAttribute('aria-label'))).toEqual(['Move later: CIS elective, 1 of 3', 'Move later: CIS elective, 2 of 3', 'Move later: CIS elective, 3 of 3']);
    $('[data-move="elective:1"]').click();
    expect(['elective:0', 'elective:1', 'elective:2'].map(termOf)).toEqual(['Spring 2029', 'Fall 2029', 'Spring 2029']);
    expect(said()).toBe('CIS elective, 2 of 3, moved to Fall 2029.');
    expect(document.activeElement).toBe($('[data-move="elective:1"]'));
    // It opened a new last semester, and the final-semester course went with the end. The plan says it now ends later, and why.
    expect(entriesOf('Fall 2029')).toEqual(['CIS elective', 'MGT 462']);
    expect(tidy($('[data-move="MGT 462"]').closest('.plan-entry')?.textContent)).toContain('Always the final semester');
    expect(late()).toBe('This draft ends in Fall 2029, later than the pace estimate above: you moved courses later.');
    expect(paceAnswer()).toContain('Spring 2029');
    // The final-semester course itself: alone, one term after the last.
    $('[data-move="MGT 462"]').click();
    expect([entriesOf('Spring 2030'), said()]).toEqual([['MGT 462'], 'MGT 462 moved to Spring 2030.']);
    expect(late()).toBe('This draft ends in Spring 2030, later than the pace estimate above: you moved courses later.');

    // The moves are kept for the visit: on another page and back, and when the pace settings change.
    go('#/check');
    go('#/left');
    expect([termOf('MGT 321'), termOf('elective:1'), termOf('MGT 462')]).toEqual(['Fall 2028', 'Fall 2029', 'Spring 2030']);
    $('[data-stepper="most"] [data-delta="1"]').click();
    expect([termOf('MGT 321'), termOf('elective:1'), termOf('MGT 462')]).toEqual(['Fall 2028', 'Fall 2029', 'Spring 2030']);
    // They are forgotten with the transcript.
    $('[data-another]').click();
    expect(app.left.moves).toEqual({});
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    expect([termOf('MGT 321'), termOf('elective:1'), termOf('MGT 462'), late()]).toEqual(['Fall 2027', 'Spring 2029', 'Spring 2029', '']);
  });

  it('lays the plan out again when the pace settings change', async () => {
    await app.takeFile(madeUp('sample-a'));
    $('[data-continue]').click();
    const card = $<HTMLDetailsElement>('.req details');
    card.open = true;
    const requirements = $('.reqs');
    const step = (end: string, delta: 1 | -1, times = 1): void => { for (let i = 0; i < times; i++) $(`[data-stepper="${end}"] [data-delta="${delta}"]`).click(); };
    // More credits a term: fewer semesters, none over the most.
    step('most', 1, 3);
    expect(semesters()).toEqual(['Spring 2027 21 cr', 'Fall 2027 21 cr', 'Spring 2028 21 cr', 'Fall 2028 18 cr']);
    expect(paceAnswer()).toContain('Fall 2028');
    // Fewer than the courses can fill: the plan runs one term past the estimate, and says so.
    step('most', -1, 4);
    expect(semesters()).toEqual(['Spring 2027 15 cr', 'Fall 2027 15 cr', 'Spring 2028 15 cr', 'Fall 2028 15 cr', 'Spring 2029 15 cr', 'Fall 2029 6 cr']);
    expect(paceAnswer()).toContain('Spring 2029');
    expect(late()).toBe('This draft ends in Fall 2029, later than the pace estimate above: courses can’t be split across semesters.');
    step('most', 1);
    expect(late()).toBe('');
    // A later target: lighter semesters, ending there.
    const list = $<HTMLSelectElement>('[data-pace-target]');
    list.value = 'Fall 2029';
    list.dispatchEvent(new Event('change', { bubbles: true }));
    expect(semesters()).toEqual(['Spring 2027 15 cr', 'Fall 2027 15 cr', 'Spring 2028 15 cr', 'Fall 2028 12 cr', 'Spring 2029 12 cr', 'Fall 2029 12 cr']);
    // Summers on: summers are used.
    $('[data-pace-summers]').click();
    expect(semesters().some(one => one.startsWith('Summer '))).toBe(true);
    $('[data-pace-summers]').click();
    expect(semesters().some(one => one.startsWith('Summer '))).toBe(false);
    // The requirements were left alone throughout, and the final-semester course is still last.
    expect([$('.reqs'), $<HTMLDetailsElement>('.req details').open]).toEqual([requirements, true]);
    const last = [...document.querySelectorAll('.semester')].pop()!;
    expect(nameOf([...last.querySelectorAll('.plan-entry')].pop()!)).toBe('MGT 462');
  });

  it('comes with the result, and not before the legacy answer', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-continue]').click();
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    expect(document.querySelector('.plan, [data-plan], [data-move]')).toBeNull();
    expect(tidy($('main').textContent)).not.toMatch(/Draft plan|Move later/);
    $('[data-legacy="yes"]').click();
    const credits = (): number => [...document.querySelectorAll('.semester header .num')].reduce((sum, one) => sum + Number(tidy(one.textContent).replace(' cr', '')), 0);
    expect(credits()).toBe(89);
    expect(credits()).toBe(Number(tidy($('.donut strong').textContent)));
    // Answered "no": the legacy elective no longer counts, so one more elective place is planned.
    const places = document.querySelectorAll('.plan-entry.is-choice').length;
    $('[data-legacy-change]').click();
    $('[data-legacy="no"]').click();
    expect(credits()).toBe(92);
    expect(document.querySelectorAll('.plan-entry.is-choice')).toHaveLength(places + 1);
    // With no row taken on there is no plan.
    $('.review-foot [data-review-again]').click();
    for (let left = document.querySelectorAll<HTMLElement>('[data-out]').length; left > 0; left = document.querySelectorAll<HTMLElement>('[data-out]').length) $('[data-out]').click();
    $('[data-continue]').click();
    expect(document.querySelector('[data-no-rows]')).not.toBeNull();
    expect(document.querySelector('.plan, [data-plan]')).toBeNull();
  });
});
